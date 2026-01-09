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
  DEFAULT_CONFIG
} from './types';

import { LLMClient, createLLMClient, buildLLMRequest } from './api/llm-client';
import { 
  ACTRulePromptBuilder, 
  createSingleElementPrompt, 
  createBatchPrompt,
  isElementApplicable 
} from './prompts/act-rule-oj04fd';
import { ErrorHandler, createErrorHandler, CircuitBreaker, createCircuitBreaker } from './utils/error-handler';
import { StorageManager, createStorageManager } from './utils/storage-manager';
import { CacheManager, createCacheManager, CacheUtils } from './utils/cache-manager';

console.log('AI Focus Lens Service Worker initialized');

// Global instances
let llmClient: LLMClient | null = null;
let errorHandler: ErrorHandler | null = null;
let circuitBreaker: CircuitBreaker | null = null;
let storageManager: StorageManager | null = null;
let cacheManager: CacheManager | null = null;
let currentScanId: string | null = null;
let scanProgress: ScanProgress | null = null;

// Service worker event listeners
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Focus Lens extension installed');
  initializeServices();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('AI Focus Lens service worker started');
  initializeServices();
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  console.log('Service Worker received message:', message.type);
  
  // Handle different message types
  switch (message.type) {
    case 'START_SCAN':
      handleStartScan(sender.tab?.id, sendResponse);
      return true; // Keep message channel open for async response
    case 'ELEMENTS_ANALYZED':
      if (message.payload && typeof message.payload === 'object') {
        handleElementsAnalyzed(message.payload as ElementAnalysisData, sender.tab?.id);
      }
      break;
    case 'GET_CONFIG':
      handleGetConfig(sendResponse);
      return true; // Keep message channel open for async response
    case 'SAVE_CONFIG':
      if (message.payload && typeof message.payload === 'object') {
        handleSaveConfig(message.payload as ExtensionConfig, sendResponse);
      }
      return true;
    case 'GET_RESULTS':
      handleGetResults(sendResponse);
      return true;
    case 'CANCEL_SCAN':
      handleCancelScan(sendResponse);
      return true;
    case 'CLEAR_CACHE':
      handleClearCache(sendResponse);
      return true;
    case 'TEST_CONNECTION':
      handleTestConnection(sendResponse);
      return true;
    default:
      console.warn('Unknown message type:', message.type);
  }
  
  return false; // Close message channel for sync responses
});

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
    
    console.log('Services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
  }
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

  if (!llmClient || !errorHandler || !storageManager || !cacheManager) {
    const error = 'Services not initialized';
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
 */
async function handleElementsAnalyzed(data: ElementAnalysisData, tabId?: number): Promise<void> {
  if (!llmClient || !errorHandler || !currentScanId || !storageManager || !cacheManager) {
    console.error('Services not initialized or no active scan');
    return;
  }

  try {
    console.log(`Received ${data.elements.length} elements for analysis`);
    
    // Get configuration
    const config: ExtensionConfig = await storageManager.loadConfig();
    
    // Check if caching is enabled and results are cached
    if (CacheUtils.isCachingEnabled(config)) {
      const cachedResults = await cacheManager.getCachedResults(data, config);
      if (cachedResults) {
        console.log(`Using cached results for ${data.pageUrl} (${cachedResults.length} results)`);
        await completeScan(cachedResults, data, tabId);
        return;
      }
    }
    
    // Filter applicable elements
    const applicableElements = data.elements.filter(isElementApplicable);
    
    // Update scan progress
    if (scanProgress) {
      scanProgress.total = applicableElements.length;
      scanProgress.status = 'scanning';
      notifyPopup({
        type: 'SCAN_PROGRESS',
        payload: scanProgress
      });
    }

    // Get configuration for batch processing
    const batchSize = config.batchSize || 5;
    
    // Process elements in batches
    const results: AnalysisResult[] = [];
    
    for (let i = 0; i < applicableElements.length; i += batchSize) {
      const batch = applicableElements.slice(i, i + batchSize);
      
      try {
        const batchResults = await processBatch(batch, data, config);
        results.push(...batchResults);
        
        // Update progress
        if (scanProgress) {
          scanProgress.completed += batchResults.length;
          scanProgress.currentElement = batch[batch.length - 1]?.selector || '';
          notifyPopup({
            type: 'SCAN_PROGRESS',
            payload: scanProgress
          });
        }
        
      } catch (error) {
        const handledError = errorHandler.handleError(error, {
          component: 'service-worker',
          action: 'process-batch',
          elementSelector: batch.map(e => e.selector).join(', ')
        });
        
        console.error('Batch processing failed:', handledError);
        
        // Update failed count
        if (scanProgress) {
          scanProgress.failed += batch.length;
        }
      }
      
      // Small delay between batches to avoid overwhelming the API
      if (i + batchSize < applicableElements.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Complete scan
    await completeScan(results, data, tabId);
    
  } catch (error) {
    const handledError = errorHandler.handleError(error, {
      component: 'service-worker',
      action: 'analyze-elements'
    });
    
    console.error('Element analysis failed:', handledError);
    
    // Notify popup of error
    notifyPopup({
      type: 'SCAN_ERROR',
      payload: handledError
    });
    
    // Reset scan state
    currentScanId = null;
    scanProgress = null;
  }
}

/**
 * Process a batch of elements through LLM API
 */
async function processBatch(
  elements: FocusableElement[], 
  pageContext: ElementAnalysisData,
  config: ExtensionConfig
): Promise<AnalysisResult[]> {
  if (!llmClient || !errorHandler || !circuitBreaker) {
    throw new Error('Services not initialized');
  }

  const results: AnalysisResult[] = [];
  
  // Process elements individually for better error handling
  for (const element of elements) {
    try {
      const result = await errorHandler.executeWithRetry(
        async () => {
          return await circuitBreaker!.execute(async () => {
            const { systemPrompt, userPrompt } = createSingleElementPrompt(element, pageContext);
            const request = buildLLMRequest(systemPrompt, userPrompt, config.model);
            
            const startTime = Date.now();
            const response = await llmClient!.sendRequest(request);
            const processingTime = Date.now() - startTime;
            
            const focusResult = llmClient!.parseFocusVisibilityResult(response);
            
            return {
              elementSelector: element.selector,
              result: focusResult,
              timestamp: Date.now(),
              processingTime,
              apiCallId: response.id
            } as AnalysisResult;
          });
        },
        {
          operationName: 'analyze-element',
          component: 'service-worker',
          elementSelector: element.selector,
          apiEndpoint: config.baseUrl
        }
      );
      
      results.push(result);
      
    } catch (error) {
      // Create fallback result for failed elements
      const fallbackResult: AnalysisResult = {
        elementSelector: element.selector,
        result: {
          status: 'CANTELL',
          reason: 'Analysis failed due to API error',
          suggestion: 'Please try again or review manually',
          confidence: 0,
          actRuleCompliance: {
            ruleId: 'oj04fd',
            outcome: 'cantell',
            details: 'API call failed'
          }
        },
        timestamp: Date.now(),
        processingTime: 0,
        retryCount: config.maxRetries
      };
      
      results.push(fallbackResult);
    }
  }
  
  return results;
}

/**
 * Complete the scan and generate report
 */
async function completeScan(
  results: AnalysisResult[], 
  pageContext: ElementAnalysisData,
  tabId?: number
): Promise<void> {
  if (!currentScanId || !scanProgress || !storageManager || !cacheManager) {
    return;
  }

  const endTime = Date.now();
  const scanDuration = endTime - (scanProgress.startTime || endTime);
  
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
      overallCompliance: (results.filter(r => r.result.status === 'PASS').length / results.length) * 100,
      commonIssues: extractCommonIssues(results),
      recommendations: extractRecommendations(results)
    }
  };

  // Store results
  await chrome.storage.local.set({
    [`scan_${currentScanId}`]: report
  });

  // Update scan progress to completed
  scanProgress.status = 'completed';
  scanProgress.completed = results.length;
  
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