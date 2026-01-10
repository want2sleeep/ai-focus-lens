// Background Service Worker for AI Focus Lens extension
// Handles LLM API integration, data processing, and component coordination

import { 
  ExtensionConfig, 
  Message,
  ContentScriptMessage,
  PopupMessage,
  ServiceWorkerMessage,
  ElementAnalysisData,
  FocusableElement,
  AnalysisResult,
  ScanProgress,
  ScanReport,
  FocusVisibilityResult,
  DEFAULT_CONFIG,
  isElementAnalysisData
} from './types';

import { LLMClient, createLLMClient, buildLLMRequest } from './api/llm-client';
import { 
  ACTRulePromptBuilder, 
  createSingleElementPrompt, 
  createBatchPrompt,
  isElementApplicable 
} from './prompts/act-rule-oj04fd';
import { 
  ErrorHandler, 
  createErrorHandler, 
  CircuitBreaker, 
  createCircuitBreaker,
  GlobalErrorLogger,
  UserNotificationManager
} from './utils/error-handler';
import { EdgeCaseHandler, createEdgeCaseHandler, EdgeCaseUtils } from './utils/edge-case-handler';
import { StorageManager, createStorageManager } from './utils/storage-manager';
import { CacheManager, createCacheManager, CacheUtils } from './utils/cache-manager';
import { BatchProcessor, createBatchProcessor, BatchUtils } from './utils/batch-processor';
import { DataFilter, createDataFilter, DataFilterUtils } from './utils/data-filter';

// Agent Integration for CDP functionality
import { 
  AccessibilityTestingAgent, 
  createAccessibilityTestingAgent,
  AgentIntegrationUtils,
  ComprehensiveTestResult
} from './agent/agent-integration';

console.log('AI Focus Lens Service Worker initialized');

// Global instances
let llmClient: LLMClient | null = null;
let errorHandler: ErrorHandler | null = null;
let circuitBreaker: CircuitBreaker | null = null;
let storageManager: StorageManager | null = null;
let cacheManager: CacheManager | null = null;
let batchProcessor: BatchProcessor | null = null;
let dataFilter: DataFilter | null = null;
let currentScanId: string | null = null;
let scanProgress: ScanProgress | null = null;

// Agent instances for CDP functionality
let accessibilityAgent: AccessibilityTestingAgent | null = null;
let agentInitialized = false;

// Initialize global error handling and edge case handling
const globalErrorLogger = GlobalErrorLogger.getInstance();
const userNotificationManager = UserNotificationManager.getInstance();
const edgeCaseHandler = createEdgeCaseHandler();

// Service worker event listeners
// Requirements: 需求 6.4, 7.4 - 处理扩展安装、更新和卸载，实现资源清理和配置迁移
chrome.runtime.onInstalled.addListener((details) => {
  console.log('AI Focus Lens extension installed/updated:', details.reason);
  handleExtensionInstalled(details);
});

chrome.runtime.onStartup.addListener(() => {
  console.log('AI Focus Lens service worker started');
  handleExtensionStartup();
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('AI Focus Lens service worker suspending');
  handleExtensionSuspend();
});

// Handle tab updates for cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  handleTabRemoved(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    handleTabNavigated(tabId);
  }
});

// Message routing system
// Requirements: 需求 1.4, 2.1 - 处理来自 Content Script 和 Popup 的消息，实现消息分发和响应机制
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  console.log('Service Worker received message:', message.type, 'from:', sender.tab ? 'content-script' : 'popup');
  
  // Handle async initialization and routing
  (async () => {
    // Ensure services are initialized
    if (!storageManager || !llmClient || !errorHandler || !cacheManager || !batchProcessor) {
      console.log('Services not initialized, initializing now...');
      await initializeServices();
    }
    
    // Route message based on source and type
    routeMessage(message, sender, sendResponse);
  })();
  
  return true; // Always return true to keep the message channel open for async responses
});

// Global error handling registration
// Requirements: 需求 5.4 - 统一错误捕获和日志记录
globalErrorLogger.registerErrorHandler('service-worker', (error) => {
  console.error('Service Worker Error Handler:', error);
  
  // Show user notification for critical errors
  if (!error.recoverable) {
    userNotificationManager.showError(
      globalErrorLogger.getUserFriendlyMessage(error),
      true // persistent for critical errors
    );
  }
  
  // Reset scan state if error occurs during scanning
  if (currentScanId && (
    error.code === 'API_KEY_INVALID' || 
    error.code === 'API_ENDPOINT_UNREACHABLE' ||
    error.code === 'NETWORK_ERROR'
  )) {
    currentScanId = null;
    scanProgress = null;
    
    // Notify popup of scan cancellation
    notifyPopup({
      type: 'SCAN_ERROR',
      payload: error
    });
  }
});

/**
 * Central message routing function
 * Requirements: 需求 1.4, 2.1 - 实现消息分发和响应机制
 */
function routeMessage(
  message: Message, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response?: any) => void
): boolean {
  try {
    // Validate message structure
    if (!message || typeof message.type !== 'string') {
      const error = globalErrorLogger.createError('VALIDATION_ERROR', 'Invalid message format', {
        component: 'service-worker',
        action: 'message-routing'
      });
      globalErrorLogger.logError(error);
      sendResponse({ success: false, error: 'Invalid message format' });
      return false;
    }

    // Add message metadata
    const messageWithMetadata = {
      ...message,
      timestamp: message.timestamp || Date.now(),
      messageId: message.messageId || generateMessageId(),
      source: sender.tab ? 'content-script' : 'popup',
      tabId: sender.tab?.id
    };

    // Route based on message source and type
    if (sender.tab) {
      // Messages from Content Script
      return routeContentScriptMessage(messageWithMetadata as ContentScriptMessage & { source: string; tabId?: number; messageId: string }, sender, sendResponse);
    } else {
      // Messages from Popup
      return routePopupMessage(messageWithMetadata as PopupMessage & { source: string; messageId: string }, sender, sendResponse);
    }
  } catch (error) {
    const handledError = globalErrorLogger.handleError(error, {
      component: 'service-worker',
      action: 'message-routing'
    });
    globalErrorLogger.logError(handledError);
    sendResponse({ success: false, error: 'Message routing failed' });
    return false;
  }
}

/**
 * Route messages from Content Script
 * Requirements: 需求 1.4 - 处理来自 Content Script 的消息
 */
function routeContentScriptMessage(
  message: ContentScriptMessage & { source: string; tabId?: number; messageId: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): boolean {
  console.log('Routing content script message:', message.type);

  switch (message.type) {
    case 'ELEMENTS_ANALYZED':
      if (message.payload && isElementAnalysisData(message.payload)) {
        handleElementsAnalyzed(message.payload, sender.tab?.id);
        sendResponse({ success: true, messageId: message.messageId });
      } else {
        console.error('Invalid ELEMENTS_ANALYZED payload:', message.payload);
        sendResponse({ success: false, error: 'Invalid payload format', messageId: message.messageId });
      }
      return false; // Sync response

    case 'HIGHLIGHT_ELEMENT':
      if (message.payload && typeof message.payload === 'object' && 'selector' in message.payload) {
        handleHighlightElement(message.payload as { selector: string }, sender.tab?.id);
        sendResponse({ success: true, messageId: message.messageId });
      } else {
        sendResponse({ success: false, error: 'Invalid highlight payload', messageId: message.messageId });
      }
      return false;

    case 'CLEAR_HIGHLIGHTS':
      handleClearHighlights(sender.tab?.id);
      sendResponse({ success: true, messageId: message.messageId });
      return false;

    case 'FOCUS_ELEMENT':
    case 'BLUR_ELEMENT':
      // Handle focus/blur events for testing
      if (message.payload && typeof message.payload === 'object' && 'selector' in message.payload) {
        handleFocusEvent(message.type, message.payload as { selector: string }, sender.tab?.id);
        sendResponse({ success: true, messageId: message.messageId });
      } else {
        sendResponse({ success: false, error: 'Invalid focus event payload', messageId: message.messageId });
      }
      return false;

    default:
      console.warn('Unknown content script message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type', messageId: message.messageId });
      return false;
  }
}

/**
 * Route messages from Popup
 * Requirements: 需求 2.1 - 处理来自 Popup 的消息
 */
function routePopupMessage(
  message: PopupMessage & { source: string; messageId: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): boolean {
  console.log('Routing popup message:', message.type);

  switch (message.type) {
    case 'START_SCAN':
      // Get active tab for scan
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          handleStartScan(tabs[0].id, (response) => {
            sendResponse({ ...response, messageId: message.messageId });
          });
        } else {
          sendResponse({ success: false, error: 'No active tab found', messageId: message.messageId });
        }
      });
      return true; // Async response

    case 'START_AGENT_SCAN':
      // New CDP-based agent scan
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          handleStartAgentScan(tabs[0].id, (response) => {
            sendResponse({ ...response, messageId: message.messageId });
          });
        } else {
          sendResponse({ success: false, error: 'No active tab found', messageId: message.messageId });
        }
      });
      return true; // Async response

    case 'GET_AGENT_STATUS':
      handleGetAgentStatus((response) => {
        sendResponse({ ...response, messageId: message.messageId });
      });
      return true; // Async response

    case 'TEST_FOCUS_TRAPS':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          handleTestFocusTraps(tabs[0].id, (response) => {
            sendResponse({ ...response, messageId: message.messageId });
          });
        } else {
          sendResponse({ success: false, error: 'No active tab found', messageId: message.messageId });
        }
      });
      return true; // Async response

    case 'GET_CONFIG':
      handleGetConfig((response) => {
        sendResponse({ ...response, messageId: message.messageId });
      });
      return true; // Async response

    case 'SAVE_CONFIG':
      if (message.payload && typeof message.payload === 'object') {
        handleSaveConfig(message.payload as ExtensionConfig, (response) => {
          sendResponse({ ...response, messageId: message.messageId });
        });
      } else {
        sendResponse({ success: false, error: 'Invalid config payload', messageId: message.messageId });
      }
      return true; // Async response

    case 'GET_RESULTS':
      handleGetResults((response) => {
        sendResponse({ ...response, messageId: message.messageId });
      });
      return true; // Async response

    case 'CANCEL_SCAN':
      handleCancelScan((response) => {
        sendResponse({ ...response, messageId: message.messageId });
      });
      return true; // Async response

    case 'CLEAR_CACHE':
      handleClearCache((response) => {
        sendResponse({ ...response, messageId: message.messageId });
      });
      return true; // Async response

    case 'TEST_CONNECTION':
      handleTestConnection((response) => {
        sendResponse({ ...response, messageId: message.messageId });
      });
      return true; // Async response

    default:
      console.warn('Unknown popup message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type', messageId: message.messageId });
      return false;
  }
}

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Handle element highlighting requests
 */
function handleHighlightElement(payload: { selector: string }, tabId?: number): void {
  if (!tabId) {
    console.error('No tab ID for highlight request');
    return;
  }

  chrome.tabs.sendMessage(tabId, {
    type: 'HIGHLIGHT_ELEMENT',
    payload: payload
  }).catch((error) => {
    console.error('Failed to send highlight message:', error);
  });
}

/**
 * Handle clear highlights requests
 */
function handleClearHighlights(tabId?: number): void {
  if (!tabId) {
    console.error('No tab ID for clear highlights request');
    return;
  }

  chrome.tabs.sendMessage(tabId, {
    type: 'CLEAR_HIGHLIGHTS'
  }).catch((error) => {
    console.error('Failed to send clear highlights message:', error);
  });
}

/**
 * Handle focus/blur events for testing
 */
function handleFocusEvent(
  eventType: 'FOCUS_ELEMENT' | 'BLUR_ELEMENT',
  payload: { selector: string },
  tabId?: number
): void {
  if (!tabId) {
    console.error('No tab ID for focus event');
    return;
  }

  chrome.tabs.sendMessage(tabId, {
    type: eventType,
    payload: payload
  }).catch((error) => {
    console.error('Failed to send focus event message:', error);
  });
}

/**
 * Initialize services with default configuration
 */
async function initializeServices(): Promise<void> {
  try {
    // Initialize storage and cache managers
    storageManager = createStorageManager();
    cacheManager = createCacheManager();
    
    // Load configuration from storage
    const config: ExtensionConfig = await storageManager.loadConfig();
    
    llmClient = createLLMClient(config);
    errorHandler = createErrorHandler(config);
    circuitBreaker = createCircuitBreaker();
    batchProcessor = createBatchProcessor(llmClient, errorHandler, config);
    
    // Initialize data filter with domain-specific configuration
    const filterConfig = DataFilterUtils.getRecommendedConfig('default');
    dataFilter = createDataFilter(filterConfig);
    
    // Initialize accessibility agent
    accessibilityAgent = createAccessibilityTestingAgent();
    
    console.log('Services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
  }
}

/**
 * Handle agent-based scan start request
 * Requirements: 需求 1.1, 1.2 - 启动基于 CDP 的智能体扫描
 */
async function handleStartAgentScan(
  tabId?: number,
  sendResponse?: (response: { success: boolean; scanId?: string; error?: string }) => void
): Promise<void> {
  if (!tabId) {
    const error = 'No tab ID provided for agent scan';
    console.error(error);
    sendResponse?.({ success: false, error });
    return;
  }

  if (!accessibilityAgent) {
    const error = 'Accessibility agent not initialized';
    console.error(error);
    sendResponse?.({ success: false, error });
    return;
  }

  try {
    // Check if agent can be initialized for this tab
    const canInitialize = await AgentIntegrationUtils.canInitializeForTab(tabId);
    if (!canInitialize) {
      throw new Error('Tab not compatible with agent functionality (requires debugger permission and valid URL)');
    }

    // Initialize agent for the tab
    const initialized = await accessibilityAgent.initialize(tabId);
    if (!initialized) {
      throw new Error('Failed to initialize accessibility agent');
    }

    agentInitialized = true;
    currentScanId = `agent_scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Update scan progress
    scanProgress = {
      total: 0,
      completed: 0,
      failed: 0,
      status: 'initializing',
      startTime: Date.now()
    };

    console.log('Agent scan started with ID:', currentScanId);
    sendResponse?.({ success: true, scanId: currentScanId });

    // Notify popup of scan start
    notifyPopup({
      type: 'SCAN_PROGRESS',
      payload: scanProgress
    });

    // Run comprehensive tests in background
    runAgentTestsInBackground(tabId);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to start agent scan:', errorMessage);
    sendResponse?.({ success: false, error: errorMessage });

    // Reset scan state
    currentScanId = null;
    scanProgress = null;
    agentInitialized = false;
  }
}

/**
 * Run agent tests in background
 */
async function runAgentTestsInBackground(tabId: number): Promise<void> {
  if (!accessibilityAgent || !currentScanId) {
    return;
  }

  try {
    // Update progress
    if (scanProgress) {
      scanProgress.status = 'scanning';
      scanProgress.total = 100; // Estimated progress points
      notifyPopup({
        type: 'SCAN_PROGRESS',
        payload: scanProgress
      });
    }

    // Run comprehensive tests
    const testResults = await accessibilityAgent.runComprehensiveTests();

    // Convert agent results to standard scan report format
    const scanReport = convertAgentResultsToScanReport(testResults, currentScanId);

    // Store results
    await chrome.storage.local.set({
      [`scan_${currentScanId}`]: scanReport
    });

    // Update scan progress to completed
    if (scanProgress) {
      scanProgress.status = 'completed';
      scanProgress.completed = scanProgress.total;
    }

    // Notify popup of completion
    notifyPopup({
      type: 'SCAN_COMPLETE',
      payload: scanReport
    });

    console.log('Agent scan completed:', scanReport);

  } catch (error) {
    console.error('Agent tests failed:', error);

    // Notify popup of error
    notifyPopup({
      type: 'SCAN_ERROR',
      payload: {
        code: 'AGENT_TEST_FAILED',
        message: error instanceof Error ? error.message : 'Agent tests failed',
        timestamp: Date.now(),
        recoverable: true,
        retryable: true,
        context: {
          component: 'service-worker',
          action: 'agent-scan'
        }
      }
    });

    // Reset scan state
    currentScanId = null;
    scanProgress = null;
  }
}

/**
 * Handle agent status request
 */
async function handleGetAgentStatus(
  sendResponse: (response: { success: boolean; status?: any; error?: string }) => void
): Promise<void> {
  try {
    if (!accessibilityAgent) {
      sendResponse({ 
        success: true, 
        status: { 
          initialized: false, 
          connected: false,
          capabilities: {
            cdpAvailable: false,
            debuggerPermission: false,
            keyboardSimulation: false,
            mouseSimulation: false,
            touchSimulation: false,
            screenshotCapture: false,
            cssInjection: false,
            domManipulation: false
          }
        } 
      });
      return;
    }

    const status = accessibilityAgent.getStatus();
    sendResponse({ success: true, status });

  } catch (error) {
    console.error('Failed to get agent status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle focus trap testing request
 */
async function handleTestFocusTraps(
  tabId: number,
  sendResponse: (response: { success: boolean; result?: any; error?: string }) => void
): Promise<void> {
  try {
    if (!accessibilityAgent) {
      throw new Error('Accessibility agent not initialized');
    }

    if (!agentInitialized) {
      // Initialize agent if not already done
      const initialized = await accessibilityAgent.initialize(tabId);
      if (!initialized) {
        throw new Error('Failed to initialize accessibility agent for focus trap testing');
      }
      agentInitialized = true;
    }

    // Test for focus traps
    const result = await accessibilityAgent.testForFocusTraps();
    
    sendResponse({ success: true, result });
    console.log('Focus trap testing completed:', result);

  } catch (error) {
    console.error('Focus trap testing failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Convert agent test results to standard scan report format
 */
function convertAgentResultsToScanReport(
  agentResults: ComprehensiveTestResult,
  scanId: string
): ScanReport {
  // Convert agent results to AnalysisResult format
  const results: AnalysisResult[] = [];
  
  // Convert keyboard test results
  agentResults.keyboardTests.forEach((test, index) => {
    results.push({
      elementSelector: `keyboard-test-${index}`,
      result: {
        status: test.passed ? 'PASS' : 'FAIL',
        reason: test.passed ? 'Keyboard accessibility test passed' : test.issues.join('; '),
        suggestion: test.recommendations.join('; '),
        confidence: test.passed ? 0.9 : 0.8,
        actRuleCompliance: {
          ruleId: 'oj04fd',
          outcome: test.passed ? 'passed' : 'failed',
          details: test.description
        }
      },
      timestamp: Date.now(),
      processingTime: 0
    });
  });

  // Convert mouse test results
  agentResults.mouseTests.forEach((test, index) => {
    results.push({
      elementSelector: test.element || `mouse-test-${index}`,
      result: {
        status: test.passed ? 'PASS' : 'FAIL',
        reason: test.passed ? 'Mouse accessibility test passed' : test.issues.join('; '),
        suggestion: test.recommendations.join('; '),
        confidence: test.passed ? 0.9 : 0.8,
        actRuleCompliance: {
          ruleId: 'oj04fd',
          outcome: test.passed ? 'passed' : 'failed',
          details: test.testName
        }
      },
      timestamp: Date.now(),
      processingTime: 0
    });
  });

  // Convert touch test results
  agentResults.touchTests.forEach((test, index) => {
    results.push({
      elementSelector: test.element || `touch-test-${index}`,
      result: {
        status: test.passed ? 'PASS' : 'FAIL',
        reason: test.passed ? 'Touch accessibility test passed' : test.issues.join('; '),
        suggestion: test.recommendations.join('; '),
        confidence: test.passed ? 0.9 : 0.8,
        actRuleCompliance: {
          ruleId: 'oj04fd',
          outcome: test.passed ? 'passed' : 'failed',
          details: test.testName
        }
      },
      timestamp: Date.now(),
      processingTime: 0
    });
  });

  return {
    pageUrl: agentResults.pageUrl,
    totalElements: results.length,
    passedElements: results.filter(r => r.result.status === 'PASS').length,
    failedElements: results.filter(r => r.result.status === 'FAIL').length,
    inapplicableElements: results.filter(r => r.result.status === 'INAPPLICABLE').length,
    cantellElements: results.filter(r => r.result.status === 'CANTELL').length,
    results,
    scanDuration: agentResults.testDuration,
    scanId,
    timestamp: Date.now(),
    configuration: {
      model: 'agent-based',
      batchSize: 1,
      cacheUsed: false
    },
    summary: {
      overallCompliance: agentResults.overallCompliance,
      commonIssues: agentResults.criticalIssues,
      recommendations: agentResults.recommendations
    }
  };
}

/**
 * Handle scan start request
 * Requirements: 需求 2.1, 2.2 - 启动检测流程并处理 API 调用
 */
async function handleStartScan(
  tabId?: number, 
  sendResponse?: (response: { success: boolean; scanId?: string; error?: string }) => void
): Promise<void> {
  if (!tabId) {
    const error = 'No tab ID provided for scan';
    console.error(error);
    sendResponse?.({ success: false, error });
    return;
  }

  // Prevent multiple concurrent scans
  if (currentScanId) {
    const error = 'A scan is already in progress. Please stop it before starting a new one.';
    console.warn(error);
    sendResponse?.({ success: false, error });
    return;
  }

  // Ensure services are initialized
  if (!llmClient || !errorHandler || !storageManager || !cacheManager || !batchProcessor) {
    console.log('Services not initialized, initializing now...');
    await initializeServices();
  }

  if (!llmClient || !errorHandler || !storageManager || !cacheManager || !batchProcessor) {
    const error = 'Failed to initialize services';
    console.error(error);
    sendResponse?.({ success: false, error });
    return;
  }

  try {
    // Generate unique scan ID
    currentScanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize scan progress
    scanProgress = {
      total: 0,
      completed: 0,
      failed: 0,
      status: 'initializing',
      startTime: Date.now()
    };

    // Inject content script and start analysis
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
    
    // Send start scan message to content script
    await chrome.tabs.sendMessage(tabId, {
      type: 'START_ANALYSIS',
      payload: { scanId: currentScanId }
    });
    
    console.log('Content script injected, scan started with ID:', currentScanId);
    sendResponse?.({ success: true, scanId: currentScanId });
    
    // Notify popup of scan start
    notifyPopup({
      type: 'SCAN_PROGRESS',
      payload: scanProgress
    });
    
  } catch (error) {
    const handledError = errorHandler.handleError(error, {
      component: 'service-worker',
      action: 'start-scan'
    });
    
    console.error('Failed to start scan:', handledError);
    sendResponse?.({ success: false, error: handledError.message });
    
    // Reset scan state
    currentScanId = null;
    scanProgress = null;
  }
}

/**
 * Handle analyzed elements from content script
 * Requirements: 需求 2.1, 2.2, 2.3 - 处理元素数据并调用 LLM API
 * Requirements: 需求 6.1 - 按配置的批次大小分组处理元素，实现并发控制和速率限制
 * Requirements: 需求 7.2, 7.3 - 过滤敏感信息和用户输入，确保只发送必要的样式信息
 * Requirements: 需求 5.3 - 处理无可检测元素的情况
 */
async function handleElementsAnalyzed(data: ElementAnalysisData, tabId?: number): Promise<void> {
  if (!llmClient || !errorHandler || !currentScanId || !storageManager || !cacheManager || !batchProcessor || !dataFilter) {
    console.error('Services not initialized or no active scan');
    return;
  }

  // Debug: Check if external indicators exist in incoming data
  const elementsWithIndicators = data.elements.filter(el => el.externalIndicators && el.externalIndicators.length > 0);
  console.log(`[ServiceWorker] Received data. Elements with external indicators: ${elementsWithIndicators.length}`, 
    elementsWithIndicators.map(el => ({ selector: el.selector, indicators: el.externalIndicators })));

  // Guard: If we are already in 'scanning' status, don't start another loop
  if (scanProgress && scanProgress.status === 'scanning') {
    console.log('Already scanning, ignoring duplicate analysis data');
    return;
  }

  try {
    console.log(`Received ${data.elements.length} elements for analysis`);
    
    // Handle edge case: no focusable elements found
    // Requirements: 需求 5.3 - 页面没有可检测元素时，显示相应的提示信息
    if (data.elements.length === 0) {
      const edgeCaseResult = edgeCaseHandler.handleNoFocusableElements(data.pageUrl);
      
      // Notify popup about no elements case
      notifyPopup({
        type: 'SCAN_COMPLETE',
        payload: {
          pageUrl: data.pageUrl,
          totalElements: 0,
          passedElements: 0,
          failedElements: 0,
          inapplicableElements: 0,
          cantellElements: 0,
          results: [],
          scanDuration: 0,
          scanId: currentScanId,
          timestamp: Date.now(),
          configuration: {
            model: (await storageManager.loadConfig()).model,
            batchSize: (await storageManager.loadConfig()).batchSize,
            cacheUsed: false
          },
          summary: {
            overallCompliance: 100, // No elements means no issues
            commonIssues: [],
            recommendations: edgeCaseResult.suggestions
          },
          edgeCaseInfo: {
            type: 'no-elements',
            message: edgeCaseResult.message,
            suggestions: edgeCaseResult.suggestions
          }
        } as ScanReport
      });

      // Show user notification
      userNotificationManager.showInfo(edgeCaseResult.message);
      
      // Reset scan state
      currentScanId = null;
      scanProgress = null;
      return;
    }
    
    // Get configuration
    const config: ExtensionConfig = await storageManager.loadConfig();
    
    // Handle edge case: large page with many elements
    const largePageResult = edgeCaseHandler.handleLargePageEdgeCases(data.elements);
    
    if (largePageResult.warnings.length > 0) {
      // Notify user about large page
      largePageResult.warnings.forEach(warning => {
        userNotificationManager.showWarning(warning);
      });
    }

    // Update batch size based on edge case recommendations
    const optimizedConfig = {
      ...config,
      batchSize: Math.min(config.batchSize, largePageResult.recommendedBatchSize)
    };
    
    // Apply data filtering and privacy protection
    // Requirements: 需求 7.2, 7.3 - 过滤敏感信息和用户输入
    console.log('Applying data filtering and privacy protection...');
    
    // Update data filter configuration based on the current domain
    const domain = new URL(data.pageUrl).hostname;
    const domainFilterConfig = DataFilterUtils.getRecommendedConfig(domain);
    dataFilter.updateConfig(domainFilterConfig);
    
    // Filter the data
    const filteredData = dataFilter.filterElementAnalysisData(data);
    
    // Debug: Check if external indicators preserved after filtering
    const filteredElementsWithIndicators = filteredData.elements.filter(el => el.externalIndicators && el.externalIndicators.length > 0);
    console.log(`[ServiceWorker] After filtering. Elements with external indicators: ${filteredElementsWithIndicators.length}`, 
      filteredElementsWithIndicators.map(el => ({ selector: el.selector, indicators: el.externalIndicators })));

    // Validate filtered data
    const validation = dataFilter.validateFilteredData(filteredData);
    if (!validation.isValid) {
      console.warn('Data filtering validation issues:', validation.issues);
      // Continue with filtered data but log issues
    }
    
    // Log filtering statistics
    const filterStats = dataFilter.getFilteringStats(data, filteredData);
    console.log('Data filtering stats:', {
      originalSize: `${Math.round(filterStats.originalSize / 1024)}KB`,
      filteredSize: `${Math.round(filterStats.filteredSize / 1024)}KB`,
      compressionRatio: `${Math.round(filterStats.compressionRatio * 100)}%`,
      elementsFiltered: filterStats.elementsFiltered,
      sensitiveDataRemoved: filterStats.sensitiveDataRemoved
    });
    
    // Check if caching is enabled and results are cached
    if (CacheUtils.isCachingEnabled(optimizedConfig)) {
      const cachedResults = await cacheManager.getCachedResults(filteredData, optimizedConfig);
      if (cachedResults) {
        console.log(`Using cached results for ${filteredData.pageUrl} (${cachedResults.length} results)`);
        await completeScan(cachedResults, filteredData, tabId);
        return;
      }
    }
    
    // Filter applicable elements
    const applicableElements = filteredData.elements.filter(isElementApplicable);
    
    // Update scan progress
    if (scanProgress) {
      scanProgress.total = applicableElements.length;
      scanProgress.status = 'scanning';
      scanProgress.estimatedTime = largePageResult.estimatedTime;
      notifyPopup({
        type: 'SCAN_PROGRESS',
        payload: scanProgress
      });
    }

    // Use BatchProcessor for optimized processing with concurrency control and rate limiting
    console.log(`Processing ${applicableElements.length} applicable elements using BatchProcessor`);
    
    // Re-initialize batchProcessor with current optimizedConfig to be safe
    batchProcessor = createBatchProcessor(llmClient, errorHandler, optimizedConfig);
    const batchResult = await batchProcessor.processElements(applicableElements, filteredData, optimizedConfig);
    
    // Handle edge cases in batch processing results
    const processedResults = batchResult.results.map(result => {
      // Handle API response edge cases
      const edgeCaseCheck = edgeCaseHandler.handleAPIResponseEdgeCases(
        result.result,
        applicableElements.find(el => el.selector === result.elementSelector)!
      );
      
      if (!edgeCaseCheck.isValid && edgeCaseCheck.fallbackResult) {
        console.warn(`Using fallback result for ${result.elementSelector}:`, edgeCaseCheck.error);
        return {
          ...result,
          result: edgeCaseCheck.fallbackResult
        };
      }
      
      return result;
    });
    
    // Update scan progress with final results
    if (scanProgress) {
      scanProgress.completed = processedResults.length;
      scanProgress.failed = batchResult.errors.length;
      
      // Update with processing metrics
      if (batchResult.metrics) {
        scanProgress.metrics = batchResult.metrics;
      }
      
      notifyPopup({
        type: 'SCAN_PROGRESS',
        payload: scanProgress
      });
    }

    // Log processing metrics
    console.log('Batch processing metrics:', batchResult.metrics);
    if (batchResult.errors.length > 0) {
      console.warn(`Processing completed with ${batchResult.errors.length} errors:`, batchResult.errors);
      
      // Handle network-related errors
      batchResult.errors.forEach(error => {
        if (EdgeCaseUtils.isCriticalEdgeCase(error)) {
          const networkEdgeCase = edgeCaseHandler.handleNetworkEdgeCases(error);
          userNotificationManager.showError(networkEdgeCase.userMessage, true);
        } else if (EdgeCaseUtils.isTemporaryEdgeCase(error)) {
          const networkEdgeCase = edgeCaseHandler.handleNetworkEdgeCases(error);
          userNotificationManager.showWarning(networkEdgeCase.userMessage);
        }
      });
    }

    // Complete scan with results (using original data for report context)
    await completeScan(processedResults, data, tabId);
    
  } catch (error) {
    const handledError = errorHandler.handleError(error, {
      component: 'service-worker',
      action: 'analyze-elements'
    });
    
    console.error('Element analysis failed:', handledError);
    
    // Handle edge cases for critical errors
    if (EdgeCaseUtils.isCriticalEdgeCase(handledError)) {
      const networkEdgeCase = edgeCaseHandler.handleNetworkEdgeCases(handledError);
      
      // Notify popup of critical error with edge case handling
      notifyPopup({
        type: 'SCAN_ERROR',
        payload: {
          ...handledError,
          edgeCaseInfo: {
            type: 'critical-error',
            message: networkEdgeCase.userMessage,
            suggestions: networkEdgeCase.suggestions,
            fallbackAction: networkEdgeCase.fallbackAction
          }
        }
      });
      
      userNotificationManager.showError(networkEdgeCase.userMessage, true);
    } else {
      // Regular error handling
      notifyPopup({
        type: 'SCAN_ERROR',
        payload: handledError
      });
    }
    
    // Reset scan state
    currentScanId = null;
    scanProgress = null;
  }
}

/**
 * Complete the scan and generate report
 */
async function completeScan(
  results: AnalysisResult[], 
  pageContext: ElementAnalysisData,
  tabId?: number
): Promise<void> {
  if (!currentScanId || !storageManager || !cacheManager) {
    return;
  }

  const endTime = Date.now();
  const scanDuration = endTime - (scanProgress?.startTime || endTime);
  
  // Get configuration for report
  const config = await storageManager.loadConfig();
  
  // Store results in cache if caching is enabled
  if (CacheUtils.isCachingEnabled(config)) {
    try {
      await cacheManager.storeResults(pageContext, results, config, currentScanId);
      console.log('Results cached successfully');
    } catch (error) {
      console.error('Failed to cache results:', error);
    }
  }
  
  // Generate scan report
  const report: ScanReport = {
    pageUrl: pageContext.pageUrl,
    totalElements: results.length,
    passedElements: results.filter(r => r.result.status === 'PASS').length,
    failedElements: results.filter(r => r.result.status === 'FAIL').length,
    inapplicableElements: results.filter(r => r.result.status === 'INAPPLICABLE').length,
    cantellElements: results.filter(r => r.result.status === 'CANTELL').length,
    results,
    scanDuration,
    scanId: currentScanId,
    timestamp: endTime,
    configuration: {
      model: config.model,
      batchSize: config.batchSize,
      cacheUsed: CacheUtils.isCachingEnabled(config)
    },
    summary: {
      overallCompliance: results.length > 0 ? (results.filter(r => r.result.status === 'PASS').length / results.length) * 100 : 100,
      commonIssues: extractCommonIssues(results),
      recommendations: extractRecommendations(results)
    }
  };

  // Store results
  await chrome.storage.local.set({
    [`scan_${currentScanId}`]: report
  });

  // Update scan progress to completed
  if (scanProgress) {
    scanProgress.status = 'completed';
    scanProgress.completed = results.length;
  }
  
  // Notify popup of completion
  notifyPopup({
    type: 'SCAN_COMPLETE',
    payload: report
  });

  console.log('Scan completed:', report);
  
  // Reset scan state
  currentScanId = null;
  scanProgress = null;
}

/**
 * Extract common issues from results
 */
function extractCommonIssues(results: AnalysisResult[]): string[] {
  const issues = new Map<string, number>();
  
  results.filter(r => r.result.status === 'FAIL').forEach(result => {
    const reason = result.result.reason.toLowerCase();
    if (reason.includes('outline')) {
      issues.set('Missing or insufficient outline', (issues.get('Missing or insufficient outline') || 0) + 1);
    }
    if (reason.includes('color')) {
      issues.set('Insufficient color contrast', (issues.get('Insufficient color contrast') || 0) + 1);
    }
    if (reason.includes('border')) {
      issues.set('No border changes on focus', (issues.get('No border changes on focus') || 0) + 1);
    }
  });
  
  return Array.from(issues.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue]) => issue);
}

/**
 * Extract recommendations from results
 */
function extractRecommendations(results: AnalysisResult[]): string[] {
  const recommendations = new Set<string>();
  
  results.filter(r => r.result.status === 'FAIL').forEach(result => {
    if (result.result.suggestion) {
      recommendations.add(result.result.suggestion);
    }
  });
  
  return Array.from(recommendations).slice(0, 5);
}

/**
 * Handle configuration retrieval
 */
async function handleGetConfig(sendResponse: (response: { success: boolean; config?: ExtensionConfig; error?: string }) => void): Promise<void> {
  try {
    if (!storageManager) {
      throw new Error('Storage manager not initialized');
    }
    
    const config = await storageManager.loadConfig();
    sendResponse({ success: true, config });
  } catch (error) {
    console.error('Failed to get config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle configuration saving
 */
async function handleSaveConfig(
  config: ExtensionConfig, 
  sendResponse: (response: { success: boolean; error?: string }) => void
): Promise<void> {
  try {
    if (!storageManager) {
      throw new Error('Storage manager not initialized');
    }
    
    await storageManager.saveConfig(config);
    
    // Update services with new configuration
    if (llmClient) {
      llmClient.updateConfig(config);
    }
    if (errorHandler) {
      errorHandler = createErrorHandler(config);
    }
    if (batchProcessor && llmClient && errorHandler) {
      // Recreate batch processor with new configuration
      batchProcessor = createBatchProcessor(llmClient, errorHandler, config);
    }
    if (dataFilter) {
      // Update data filter configuration
      const filterConfig = DataFilterUtils.getRecommendedConfig('default');
      dataFilter.updateConfig(filterConfig);
    }
    
    sendResponse({ success: true });
    console.log('Configuration saved successfully');
  } catch (error) {
    console.error('Failed to save config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle results retrieval
 */
async function handleGetResults(sendResponse: (response: { success: boolean; report?: ScanReport; error?: string }) => void): Promise<void> {
  try {
    if (!currentScanId) {
      sendResponse({ success: false, error: 'No active scan' });
      return;
    }
    
    const result = await chrome.storage.local.get([`scan_${currentScanId}`]);
    const report = result[`scan_${currentScanId}`];
    
    if (report) {
      sendResponse({ success: true, report });
    } else {
      sendResponse({ success: false, error: 'Scan results not found' });
    }
  } catch (error) {
    console.error('Failed to get results:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle scan cancellation
 */
async function handleCancelScan(sendResponse: (response: { success: boolean; error?: string }) => void): Promise<void> {
  try {
    if (llmClient) {
      llmClient.cancelRequest();
    }

    if (batchProcessor) {
      batchProcessor.cancelProcessing();
    }
    
    currentScanId = null;
    if (scanProgress) {
      scanProgress.status = 'cancelled';
    }
    
    sendResponse({ success: true });
    console.log('Scan cancelled');
  } catch (error) {
    console.error('Failed to cancel scan:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle cache clearing
 */
async function handleClearCache(sendResponse: (response: { success: boolean; error?: string }) => void): Promise<void> {
  try {
    if (!cacheManager) {
      throw new Error('Cache manager not initialized');
    }
    
    await cacheManager.clearCache();
    sendResponse({ success: true });
    console.log('Cache cleared successfully');
  } catch (error) {
    console.error('Failed to clear cache:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle connection testing
 */
async function handleTestConnection(sendResponse: (response: { success: boolean; error?: string }) => void): Promise<void> {
  try {
    if (!llmClient) {
      sendResponse({ success: false, error: 'LLM client not initialized' });
      return;
    }
    
    const result = await llmClient.testConnection();
    sendResponse(result);
  } catch (error) {
    console.error('Connection test failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Notify popup of updates
 */
function notifyPopup(message: ServiceWorkerMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors if popup is not open
  });
}

// Extension Lifecycle Management
// Requirements: 需求 6.4, 7.4 - 处理扩展安装、更新和卸载，实现资源清理和配置迁移

/**
 * Handle extension installation and updates
 * Requirements: 需求 7.4 - 实现配置迁移和向后兼容性
 */
async function handleExtensionInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  try {
    switch (details.reason) {
      case 'install':
        await handleFirstInstall();
        break;
      case 'update':
        await handleExtensionUpdate(details.previousVersion);
        break;
      case 'chrome_update':
        await handleChromeUpdate();
        break;
      case 'shared_module_update':
        await handleSharedModuleUpdate();
        break;
    }
    
    // Initialize services after handling installation/update
    await initializeServices();
    
  } catch (error) {
    console.error('Failed to handle extension installation:', error);
  }
}

/**
 * Handle first-time installation
 */
async function handleFirstInstall(): Promise<void> {
  console.log('First-time installation detected');
  
  try {
    // Initialize default configuration
    if (!storageManager) {
      storageManager = createStorageManager();
    }
    
    // Check if configuration already exists (shouldn't on first install)
    const existingConfig = await chrome.storage.local.get(['config']);
    if (!existingConfig.config) {
      // Save default configuration
      await storageManager.saveConfig(DEFAULT_CONFIG);
      console.log('Default configuration saved');
    }
    
    // Initialize cache structure
    await chrome.storage.local.set({
      'cache_metadata': {
        version: '1.0.0',
        created: Date.now(),
        lastCleanup: Date.now()
      }
    });
    
    // Set installation metadata
    const currentVersion = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({
      'extension_metadata': {
        version: currentVersion,
        installDate: Date.now(),
        migrationVersion: 1
      }
    });
    
    console.log('First-time installation completed successfully');
    
  } catch (error) {
    console.error('First-time installation failed:', error);
    throw error;
  }
}

/**
 * Handle extension updates with configuration migration
 * Requirements: 需求 7.4 - 保持用户配置的向后兼容性
 */
async function handleExtensionUpdate(previousVersion?: string): Promise<void> {
  console.log(`Extension update detected: ${previousVersion} -> ${chrome.runtime.getManifest().version}`);
  
  try {
    if (!storageManager) {
      storageManager = createStorageManager();
    }
    
    // Get current configuration and metadata
    const [configResult, metadataResult] = await Promise.all([
      chrome.storage.local.get(['config']),
      chrome.storage.local.get(['extension_metadata'])
    ]);
    
    const currentConfig = configResult.config;
    const metadata = metadataResult.extension_metadata || {};
    
    // Perform configuration migration if needed
    if (currentConfig) {
      const migratedConfig = await migrateConfiguration(currentConfig, previousVersion, metadata.migrationVersion || 0);
      if (migratedConfig !== currentConfig) {
        await storageManager.saveConfig(migratedConfig);
        console.log('Configuration migrated successfully');
      }
    }
    
    // Update extension metadata
    const currentVersion = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({
      'extension_metadata': {
        ...metadata,
        version: currentVersion,
        previousVersion: previousVersion,
        updateDate: Date.now(),
        migrationVersion: getCurrentMigrationVersion()
      }
    });
    
    // Clean up old cache entries if needed
    await performUpdateCleanup(previousVersion);
    
    console.log('Extension update completed successfully');
    
  } catch (error) {
    console.error('Extension update failed:', error);
    throw error;
  }
}

/**
 * Migrate configuration between versions
 * Requirements: 需求 7.4 - 保持用户配置的向后兼容性
 */
async function migrateConfiguration(
  config: any, 
  previousVersion?: string, 
  currentMigrationVersion: number = 0
): Promise<ExtensionConfig> {
  console.log(`Migrating configuration from version ${previousVersion} (migration v${currentMigrationVersion})`);
  
  let migratedConfig = { ...config };
  
  // Migration v1: Add new timeout and retry fields (if upgrading from pre-1.1.0)
  if (currentMigrationVersion < 1) {
    migratedConfig = {
      ...migratedConfig,
      timeout: migratedConfig.timeout || 30000,
      maxRetries: migratedConfig.maxRetries || 3,
      retryDelay: migratedConfig.retryDelay || 1000
    };
    console.log('Applied migration v1: Added timeout and retry configuration');
  }
  
  // Migration v2: Update model names (if upgrading from pre-1.2.0)
  if (currentMigrationVersion < 2) {
    // Update deprecated model names
    if (migratedConfig.model === 'gpt-3.5-turbo') {
      migratedConfig.model = 'gpt-4';
      console.log('Applied migration v2: Updated model from gpt-3.5-turbo to gpt-4');
    }
  }
  
  // Migration v3: Add new batch processing fields (if upgrading from pre-1.3.0)
  if (currentMigrationVersion < 3) {
    migratedConfig = {
      ...migratedConfig,
      batchSize: 1
    };
    console.log('Applied migration v3: Force batchSize to 1');
  }
  
  // Ensure all required fields are present with defaults
  const finalConfig: ExtensionConfig = {
    apiKey: migratedConfig.apiKey || '',
    baseUrl: migratedConfig.baseUrl || DEFAULT_CONFIG.baseUrl,
    model: migratedConfig.model || DEFAULT_CONFIG.model,
    batchSize: 1, // FORCE to 1 for stability
    cacheEnabled: migratedConfig.cacheEnabled !== undefined ? migratedConfig.cacheEnabled : DEFAULT_CONFIG.cacheEnabled,
    timeout: migratedConfig.timeout || DEFAULT_CONFIG.timeout,
    maxRetries: migratedConfig.maxRetries || DEFAULT_CONFIG.maxRetries,
    retryDelay: migratedConfig.retryDelay || DEFAULT_CONFIG.retryDelay
  };
  
  return finalConfig;
}

/**
 * Get current migration version
 */
function getCurrentMigrationVersion(): number {
  return 3; // Update this when adding new migrations
}

/**
 * Handle Chrome browser updates
 */
async function handleChromeUpdate(): Promise<void> {
  console.log('Chrome update detected');
  
  try {
    // Reinitialize services to ensure compatibility
    await initializeServices();
    
    // Verify storage integrity
    await verifyStorageIntegrity();
    
    console.log('Chrome update handling completed');
    
  } catch (error) {
    console.error('Chrome update handling failed:', error);
  }
}

/**
 * Handle shared module updates
 */
async function handleSharedModuleUpdate(): Promise<void> {
  console.log('Shared module update detected');
  
  try {
    // Reinitialize services
    await initializeServices();
    
    console.log('Shared module update handling completed');
    
  } catch (error) {
    console.error('Shared module update handling failed:', error);
  }
}

/**
 * Handle extension startup
 */
async function handleExtensionStartup(): Promise<void> {
  try {
    // Initialize services
    await initializeServices();
    
    // Perform startup cleanup
    await performStartupCleanup();
    
    console.log('Extension startup completed successfully');
    
  } catch (error) {
    console.error('Extension startup failed:', error);
  }
}

/**
 * Handle extension suspension
 * Requirements: 需求 6.4 - 清理所有注入的脚本和事件监听器
 */
async function handleExtensionSuspend(): Promise<void> {
  try {
    console.log('Performing cleanup before suspension...');
    
    // Cancel any ongoing scans
    if (currentScanId) {
      await handleCancelScan(() => {});
    }
    
    // Cleanup accessibility agent
    if (accessibilityAgent) {
      await accessibilityAgent.cleanup();
      accessibilityAgent = null;
      agentInitialized = false;
    }
    
    // Cancel any pending API requests
    if (llmClient) {
      llmClient.cancelRequest();
    }
    
    // Clear circuit breaker state
    if (circuitBreaker) {
      circuitBreaker.reset();
    }
    
    // Perform cache cleanup
    if (cacheManager) {
      await cacheManager.performMaintenance();
    }
    
    console.log('Extension suspension cleanup completed');
    
  } catch (error) {
    console.error('Extension suspension cleanup failed:', error);
  }
}

/**
 * Handle tab removal cleanup
 * Requirements: 需求 6.4 - 清理所有注入的脚本和事件监听器
 */
function handleTabRemoved(tabId: number): void {
  try {
    console.log(`Cleaning up resources for removed tab: ${tabId}`);
    
    // Cancel scan if it was running on this tab
    if (currentScanId && scanProgress) {
      console.log(`Cancelling scan for removed tab: ${tabId}`);
      currentScanId = null;
      scanProgress = null;
    }
    
    // Cleanup agent if it was connected to this tab
    if (accessibilityAgent && agentInitialized) {
      const agentStatus = accessibilityAgent.getStatus();
      if (agentStatus.tabId === tabId) {
        accessibilityAgent.cleanup().catch((error) => {
          console.error('Failed to cleanup agent for removed tab:', error);
        });
        agentInitialized = false;
      }
    }
    
    // Clear any tab-specific cache entries
    if (cacheManager) {
      cacheManager.clearTabCache(tabId).catch((error) => {
        console.error('Failed to clear tab cache:', error);
      });
    }
    
  } catch (error) {
    console.error('Tab removal cleanup failed:', error);
  }
}

/**
 * Handle tab navigation cleanup
 * Requirements: 需求 6.4 - 清理所有注入的脚本和事件监听器
 */
function handleTabNavigated(tabId: number): void {
  try {
    console.log(`Cleaning up resources for navigated tab: ${tabId}`);
    
    // Cancel scan if it was running on this tab
    if (currentScanId && scanProgress) {
      console.log(`Cancelling scan for navigated tab: ${tabId}`);
      currentScanId = null;
      scanProgress = null;
      
      // Notify popup of cancellation
      notifyPopup({
        type: 'SCAN_ERROR',
        payload: {
          code: 'NAVIGATION_CANCELLED',
          message: 'Scan cancelled due to page navigation',
          timestamp: Date.now(),
          recoverable: false,
          retryable: true,
          context: {
            component: 'service-worker',
            action: 'tab-navigation'
          }
        }
      });
    }
    
    // Cleanup agent if it was connected to this tab
    if (accessibilityAgent && agentInitialized) {
      const agentStatus = accessibilityAgent.getStatus();
      if (agentStatus.tabId === tabId) {
        accessibilityAgent.cleanup().catch((error) => {
          console.error('Failed to cleanup agent for navigated tab:', error);
        });
        agentInitialized = false;
      }
    }
    
  } catch (error) {
    console.error('Tab navigation cleanup failed:', error);
  }
}

/**
 * Perform cleanup after updates
 */
async function performUpdateCleanup(previousVersion?: string): Promise<void> {
  try {
    console.log('Performing post-update cleanup...');
    
    if (!cacheManager) {
      cacheManager = createCacheManager();
    }
    
    // Clear old cache entries if major version change
    const currentVersion = chrome.runtime.getManifest().version;
    if (previousVersion && currentVersion && isVersionMajorChange(previousVersion, currentVersion)) {
      console.log('Major version change detected, clearing cache');
      await cacheManager.clearCache();
    }
    
    // Clean up old storage keys
    await cleanupDeprecatedStorageKeys(previousVersion);
    
    console.log('Post-update cleanup completed');
    
  } catch (error) {
    console.error('Post-update cleanup failed:', error);
  }
}

/**
 * Perform startup cleanup
 */
async function performStartupCleanup(): Promise<void> {
  try {
    console.log('Performing startup cleanup...');
    
    // Clear any stale scan state
    currentScanId = null;
    scanProgress = null;
    
    // Perform cache maintenance
    if (cacheManager) {
      await cacheManager.performMaintenance();
    }
    
    console.log('Startup cleanup completed');
    
  } catch (error) {
    console.error('Startup cleanup failed:', error);
  }
}

/**
 * Verify storage integrity
 */
async function verifyStorageIntegrity(): Promise<void> {
  try {
    console.log('Verifying storage integrity...');
    
    // Check if configuration exists and is valid
    const configResult = await chrome.storage.local.get(['config']);
    if (!configResult.config) {
      console.warn('Configuration missing, restoring defaults');
      if (!storageManager) {
        storageManager = createStorageManager();
      }
      await storageManager.saveConfig(DEFAULT_CONFIG);
    }
    
    // Check cache metadata
    const cacheResult = await chrome.storage.local.get(['cache_metadata']);
    if (!cacheResult.cache_metadata) {
      console.warn('Cache metadata missing, reinitializing');
      await chrome.storage.local.set({
        'cache_metadata': {
          version: '1.0.0',
          created: Date.now(),
          lastCleanup: Date.now()
        }
      });
    }
    
    console.log('Storage integrity verification completed');
    
  } catch (error) {
    console.error('Storage integrity verification failed:', error);
  }
}

/**
 * Check if version change is major
 */
function isVersionMajorChange(oldVersion: string, newVersion: string): boolean {
  try {
    const oldMajor = parseInt(oldVersion.split('.')[0] || '0', 10);
    const newMajor = parseInt(newVersion.split('.')[0] || '0', 10);
    return newMajor > oldMajor;
  } catch (error) {
    console.error('Failed to compare versions:', error);
    return false;
  }
}

/**
 * Clean up deprecated storage keys
 */
async function cleanupDeprecatedStorageKeys(previousVersion?: string): Promise<void> {
  try {
    // Define deprecated keys by version
    const deprecatedKeys: { [version: string]: string[] } = {
      '1.0.0': ['old_config', 'legacy_cache'],
      '1.1.0': ['temp_results', 'old_metadata']
    };
    
    if (previousVersion) {
      const keysToRemove: string[] = [];
      
      // Collect all deprecated keys for versions up to the previous version
      Object.entries(deprecatedKeys).forEach(([version, keys]) => {
        if (compareVersions(previousVersion!, version) >= 0) {
          keysToRemove.push(...keys);
        }
      });
      
      if (keysToRemove.length > 0) {
        console.log('Removing deprecated storage keys:', keysToRemove);
        await chrome.storage.local.remove(keysToRemove);
      }
    }
    
  } catch (error) {
    console.error('Failed to clean up deprecated storage keys:', error);
  }
}

/**
 * Compare version strings
 */
function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}