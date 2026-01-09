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
import { BatchProcessor, createBatchProcessor, BatchUtils } from './utils/batch-processor';
import { DataFilter, createDataFilter, DataFilterUtils } from './utils/data-filter';

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
    batchProcessor = createBatchProcessor(llmClient, errorHandler, config);
    
    // Initialize data filter with domain-specific configuration
    const filterConfig = DataFilterUtils.getRecommendedConfig('default');
    dataFilter = createDataFilter(filterConfig);
    
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
 * Requirements: 需求 6.1 - 按配置的批次大小分组处理元素，实现并发控制和速率限制
 * Requirements: 需求 7.2, 7.3 - 过滤敏感信息和用户输入，确保只发送必要的样式信息
 */
async function handleElementsAnalyzed(data: ElementAnalysisData, tabId?: number): Promise<void> {
  if (!llmClient || !errorHandler || !currentScanId || !storageManager || !cacheManager || !batchProcessor || !dataFilter) {
    console.error('Services not initialized or no active scan');
    return;
  }

  try {
    console.log(`Received ${data.elements.length} elements for analysis`);
    
    // Get configuration
    const config: ExtensionConfig = await storageManager.loadConfig();
    
    // Apply data filtering and privacy protection
    // Requirements: 需求 7.2, 7.3 - 过滤敏感信息和用户输入
    console.log('Applying data filtering and privacy protection...');
    
    // Update data filter configuration based on the current domain
    const domain = new URL(data.pageUrl).hostname;
    const domainFilterConfig = DataFilterUtils.getRecommendedConfig(domain);
    dataFilter.updateConfig(domainFilterConfig);
    
    // Filter the data
    const filteredData = dataFilter.filterElementAnalysisData(data);
    
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
    if (CacheUtils.isCachingEnabled(config)) {
      const cachedResults = await cacheManager.getCachedResults(filteredData, config);
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
      notifyPopup({
        type: 'SCAN_PROGRESS',
        payload: scanProgress
      });
    }

    // Use BatchProcessor for optimized processing with concurrency control and rate limiting
    console.log(`Processing ${applicableElements.length} applicable elements using BatchProcessor`);
    
    const batchResult = await batchProcessor.processElements(applicableElements, filteredData, config);
    
    // Update scan progress with final results
    if (scanProgress) {
      scanProgress.completed = batchResult.results.length;
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
    }

    // Complete scan with results (using original data for report context)
    await completeScan(batchResult.results, data, tabId);
    
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