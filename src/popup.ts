// Popup UI script for AI Focus Lens extension
// Handles user interface interactions and configuration management

import { 
  ExtensionConfig, 
  ScanReport, 
  PopupMessage,
  ServiceWorkerMessage 
} from './types';

// DOM elements
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const saveConfigBtn = document.getElementById('saveConfig') as HTMLButtonElement;
const clearCacheBtn = document.getElementById('clearCache') as HTMLButtonElement;
const configStatus = document.getElementById('configStatus') as HTMLDivElement;
const startScanBtn = document.getElementById('startScan') as HTMLButtonElement;
const stopScanBtn = document.getElementById('stopScan') as HTMLButtonElement;
const scanProgress = document.getElementById('scanProgress') as HTMLDivElement;
const progressBar = document.getElementById('progressBar') as HTMLDivElement;
const scanStatus = document.getElementById('scanStatus') as HTMLDivElement;
const resultsSection = document.getElementById('resultsSection') as HTMLDivElement;
const resultsSummary = document.getElementById('resultsSummary') as HTMLDivElement;
const resultsContainer = document.getElementById('resultsContainer') as HTMLDivElement;

// Global error notification container
let notificationContainer: HTMLDivElement | null = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', initializePopup);

async function initializePopup(): Promise<void> {
  console.log('Initializing AI Focus Lens popup');
  
  // Create notification container
  createNotificationContainer();
  
  // Load existing configuration
  await loadConfiguration();
  
  // Set up event listeners
  saveConfigBtn.addEventListener('click', saveConfiguration);
  clearCacheBtn.addEventListener('click', clearCache);
  startScanBtn.addEventListener('click', startScan);
  stopScanBtn.addEventListener('click', stopScan);
  
  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    handleServiceWorkerMessage(message);
  });
}

async function loadConfiguration(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONFIG'
    } as PopupMessage);
    
    if (response.success && response.config) {
      const config: ExtensionConfig = response.config;
      apiKeyInput.value = config.apiKey || '';
      baseUrlInput.value = config.baseUrl || 'https://api.openai.com/v1';
      modelInput.value = config.model || 'gpt-4';
    }
  } catch (error) {
    console.error('Failed to load configuration:', error);
    showStatus(configStatus, 'Failed to load configuration', 'error');
  }
}

async function saveConfiguration(): Promise<void> {
  const config: ExtensionConfig = {
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim() || 'https://api.openai.com/v1',
    model: modelInput.value.trim() || 'gpt-4',
    batchSize: 1, // Reduced to 1 to avoid rate limits
    cacheEnabled: true,
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000
  };
  
  // Validate configuration
  if (!config.apiKey) {
    showStatus(configStatus, 'Please enter your API Key', 'error');
    return;
  }
  
  if (!config.baseUrl) {
    showStatus(configStatus, 'Please enter a valid Base URL', 'error');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_CONFIG',
      payload: config
    } as PopupMessage);
    
    if (response.success) {
      showStatus(configStatus, 'Configuration saved successfully', 'success');
      // Enable scan button
      startScanBtn.disabled = false;
    } else {
      showStatus(configStatus, `Failed to save: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Failed to save configuration:', error);
    showStatus(configStatus, 'Failed to save configuration', 'error');
  }
}

async function clearCache(): Promise<void> {
  try {
    clearCacheBtn.disabled = true;
    clearCacheBtn.textContent = '正在清除...';
    
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_CACHE'
    } as PopupMessage);
    
    if (response.success) {
      showStatus(configStatus, '缓存已成功清除', 'success');
    } else {
      showStatus(configStatus, '清除失败', 'error');
    }
  } catch (error) {
    console.error('Failed to clear cache:', error);
    showStatus(configStatus, '清除出错', 'error');
  } finally {
    clearCacheBtn.disabled = false;
    clearCacheBtn.textContent = '清除本地缓存';
  }
}

async function startScan(): Promise<void> {
  // Validate configuration first
  if (!apiKeyInput.value.trim()) {
    showStatus(configStatus, 'Please configure your API Key first', 'error');
    return;
  }
  
  try {
    // Show progress UI and toggle buttons
    scanProgress.classList.remove('hidden');
    startScanBtn.classList.add('hidden');
    stopScanBtn.classList.remove('hidden');
    
    // Reset progress
    updateProgress(0, '正在初始化...');
    
    // Send scan request to service worker
    await chrome.runtime.sendMessage({
      type: 'START_SCAN'
    } as PopupMessage);
    
  } catch (error) {
    console.error('Failed to start scan:', error);
    showStatus(scanStatus, 'Failed to start scan', 'error');
    resetScanUI();
  }
}

async function stopScan(): Promise<void> {
  try {
    stopScanBtn.disabled = true;
    stopScanBtn.textContent = '停止中...';
    
    await chrome.runtime.sendMessage({
      type: 'CANCEL_SCAN'
    } as PopupMessage);
    
    // UI reset will happen via handleScanComplete or manual delay
    setTimeout(() => {
      resetScanUI();
      stopScanBtn.disabled = false;
      stopScanBtn.textContent = '停止扫描';
    }, 1000);

  } catch (error) {
    console.error('Failed to stop scan:', error);
    resetScanUI();
    stopScanBtn.disabled = false;
    stopScanBtn.textContent = '停止扫描';
  }
}

function handleServiceWorkerMessage(message: ServiceWorkerMessage): void {
  switch (message.type) {
    case 'SCAN_PROGRESS':
      if (message.payload && 'completed' in message.payload && 'total' in message.payload) {
        updateProgress(
          (message.payload.completed / message.payload.total) * 100,
          `正在分析: ${message.payload.currentElement || '...'}`
        );
      }
      break;
      
    case 'SCAN_COMPLETE':
      if (message.payload && 'results' in message.payload) {
        handleScanComplete(message.payload as ScanReport);
      }
      break;
      
    case 'SCAN_ERROR':
      if (message.payload && typeof message.payload === 'object' && 'message' in message.payload) {
        handleScanError(String(message.payload.message));
      }
      break;

    case 'GLOBAL_ERROR_NOTIFICATION':
      // Handle global error notifications
      // Requirements: 需求 5.4 - 用户友好的错误提示
      if (message.payload && typeof message.payload === 'object') {
        const payload = message.payload as unknown as {
          error: any;
          userMessage: string;
          suggestions: string[];
        };
        showGlobalErrorNotification(payload.userMessage, payload.suggestions);
      }
      break;

    case 'NOTIFICATIONS_UPDATED':
      // Handle notification updates from UserNotificationManager
      if (message.payload && Array.isArray(message.payload)) {
        updateNotificationDisplay(message.payload);
      }
      break;
  }
}

function updateProgress(percentage: number, status: string): void {
  progressBar.style.width = `${percentage}%`;
  scanStatus.textContent = status;
}

function handleScanComplete(report: ScanReport): void {
  console.log('Scan completed:', report);
  
  // Hide progress, show results
  scanProgress.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  
  // Handle edge case information
  if (report.edgeCaseInfo) {
    handleEdgeCaseInfo(report.edgeCaseInfo);
  }
  
  // Update summary
  if (report.totalElements === 0) {
    resultsSummary.textContent = '未检测到可聚焦元素';
  } else {
    resultsSummary.textContent = 
      `共检测 ${report.totalElements} 个元素，` +
      `${report.passedElements} 个通过，` +
      `${report.failedElements} 个失败`;
  }
  
  // Display results
  displayResults(report);
  
  // Reset scan UI
  resetScanUI();
}

/**
 * Handle edge case information in scan reports
 * Requirements: 需求 5.1, 5.2, 5.3 - 处理边缘情况的用户提示
 */
function handleEdgeCaseInfo(edgeCaseInfo: {
  type: 'no-elements' | 'large-page' | 'critical-error' | 'network-issue';
  message: string;
  suggestions: string[];
  fallbackAction?: string;
  warnings?: string[];
}): void {
  // Create edge case notification
  const edgeCaseContainer = document.createElement('div');
  edgeCaseContainer.className = `edge-case-info ${edgeCaseInfo.type}`;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'edge-case-message';
  messageDiv.textContent = edgeCaseInfo.message;
  
  const suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'edge-case-suggestions';
  
  if (edgeCaseInfo.suggestions.length > 0) {
    const suggestionsList = document.createElement('ul');
    edgeCaseInfo.suggestions.forEach(suggestion => {
      const listItem = document.createElement('li');
      listItem.textContent = suggestion;
      suggestionsList.appendChild(listItem);
    });
    suggestionsDiv.appendChild(suggestionsList);
  }
  
  // Add warnings if present
  if (edgeCaseInfo.warnings && edgeCaseInfo.warnings.length > 0) {
    const warningsDiv = document.createElement('div');
    warningsDiv.className = 'edge-case-warnings';
    
    const warningsTitle = document.createElement('h4');
    warningsTitle.textContent = '注意事项：';
    warningsDiv.appendChild(warningsTitle);
    
    const warningsList = document.createElement('ul');
    edgeCaseInfo.warnings.forEach(warning => {
      const listItem = document.createElement('li');
      listItem.textContent = warning;
      warningsList.appendChild(listItem);
    });
    warningsDiv.appendChild(warningsList);
    
    edgeCaseContainer.appendChild(warningsDiv);
  }
  
  // Add fallback action button if present
  if (edgeCaseInfo.fallbackAction) {
    const actionButton = document.createElement('button');
    actionButton.className = 'edge-case-action';
    
    switch (edgeCaseInfo.fallbackAction) {
      case 'open-settings':
        actionButton.textContent = '打开设置';
        actionButton.onclick = () => {
          // Focus on API key input
          apiKeyInput.focus();
        };
        break;
      case 'retry-scan':
        actionButton.textContent = '重试扫描';
        actionButton.onclick = () => {
          startScan();
        };
        break;
      case 'check-connection':
        actionButton.textContent = '测试连接';
        actionButton.onclick = () => {
          testConnection();
        };
        break;
      case 'enable-caching':
        actionButton.textContent = '启用缓存';
        actionButton.onclick = () => {
          // Enable caching and save config
          const currentConfig = {
            apiKey: apiKeyInput.value.trim(),
            baseUrl: baseUrlInput.value.trim() || 'https://api.openai.com/v1',
            model: modelInput.value.trim(),
            batchSize: 5,
            cacheEnabled: true,
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 1000
          };
          saveConfigurationInternal(currentConfig);
        };
        break;
      case 'reduce-batch-size':
        actionButton.textContent = '减少批处理大小';
        actionButton.onclick = () => {
          // Reduce batch size and save config
          const currentConfig = {
            apiKey: apiKeyInput.value.trim(),
            baseUrl: baseUrlInput.value.trim() || 'https://api.openai.com/v1',
            model: modelInput.value.trim(),
            batchSize: 2, // Reduced batch size
            cacheEnabled: true,
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 1000
          };
          saveConfigurationInternal(currentConfig);
        };
        break;
    }
    
    edgeCaseContainer.appendChild(actionButton);
  }
  
  edgeCaseContainer.appendChild(messageDiv);
  edgeCaseContainer.appendChild(suggestionsDiv);
  
  // Insert edge case info before results
  resultsSection.insertBefore(edgeCaseContainer, resultsSummary);
}

/**
 * Test API connection
 */
async function testConnection(): Promise<void> {
  try {
    showStatus(configStatus, '正在测试连接...', 'info' as any);
    
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION'
    } as PopupMessage);
    
    if (response.success) {
      showStatus(configStatus, '连接测试成功', 'success');
    } else {
      showStatus(configStatus, `连接测试失败: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    showStatus(configStatus, '连接测试失败', 'error');
  }
}

/**
 * Internal configuration saving function
 */
async function saveConfigurationInternal(config: ExtensionConfig): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_CONFIG',
      payload: config
    } as PopupMessage);
    
    if (response.success) {
      showStatus(configStatus, '配置已更新', 'success');
    } else {
      showStatus(configStatus, `配置更新失败: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Failed to save configuration:', error);
    showStatus(configStatus, '配置更新失败', 'error');
  }
}

function handleScanError(error: string): void {
  console.error('Scan error:', error);
  showStatus(scanStatus, `扫描失败: ${error}`, 'error');
  resetScanUI();
}

function displayResults(report: ScanReport): void {
  resultsContainer.innerHTML = '';
  
  report.results.forEach(result => {
    const resultItem = document.createElement('div');
    resultItem.className = `result-item ${result.result.status.toLowerCase()}`;
    
    resultItem.innerHTML = `
      <div class="result-selector">${result.elementSelector}</div>
      <div class="result-reason">${result.result.reason}</div>
    `;
    
    // Add click handler to highlight element
    resultItem.addEventListener('click', () => {
      highlightElement(result.elementSelector);
    });
    
    resultsContainer.appendChild(resultItem);
  });
}

async function highlightElement(selector: string): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector }
      });
    }
  } catch (error) {
    console.error('Failed to highlight element:', error);
  }
}

function resetScanUI(): void {
  startScanBtn.classList.remove('hidden');
  stopScanBtn.classList.add('hidden');
  scanProgress.classList.add('hidden');
}

function showStatus(element: HTMLElement, message: string, type: 'success' | 'error'): void {
  element.textContent = message;
  element.className = type;
  
  // Clear status after 3 seconds
  setTimeout(() => {
    element.textContent = '';
    element.className = '';
  }, 3000);
}

/**
 * Create notification container for global error notifications
 * Requirements: 需求 5.4 - 用户友好的错误提示
 */
function createNotificationContainer(): void {
  notificationContainer = document.createElement('div');
  notificationContainer.id = 'notificationContainer';
  notificationContainer.className = 'notification-container';
  
  // Insert at the top of the popup
  const popupBody = document.body;
  popupBody.insertBefore(notificationContainer, popupBody.firstChild);
}

/**
 * Show global error notification
 * Requirements: 需求 5.4 - 用户友好的错误提示
 */
function showGlobalErrorNotification(message: string, suggestions: string[]): void {
  if (!notificationContainer) {
    createNotificationContainer();
  }

  const notification = document.createElement('div');
  notification.className = 'notification error';
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'notification-message';
  messageDiv.textContent = message;
  
  const suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'notification-suggestions';
  
  if (suggestions.length > 0) {
    const suggestionsList = document.createElement('ul');
    suggestions.forEach(suggestion => {
      const listItem = document.createElement('li');
      listItem.textContent = suggestion;
      suggestionsList.appendChild(listItem);
    });
    suggestionsDiv.appendChild(suggestionsList);
  }
  
  const closeButton = document.createElement('button');
  closeButton.className = 'notification-close';
  closeButton.textContent = '×';
  closeButton.onclick = () => {
    notification.remove();
  };
  
  notification.appendChild(messageDiv);
  if (suggestions.length > 0) {
    notification.appendChild(suggestionsDiv);
  }
  notification.appendChild(closeButton);
  
  notificationContainer!.appendChild(notification);
  
  // Auto-remove after 10 seconds for error notifications
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 10000);
}

/**
 * Update notification display from UserNotificationManager
 * Requirements: 需求 5.4 - 用户友好的错误提示
 */
function updateNotificationDisplay(notifications: Array<{
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info' | 'success';
  timestamp: number;
  persistent: boolean;
}>): void {
  if (!notificationContainer) {
    createNotificationContainer();
  }

  // Clear existing notifications
  notificationContainer!.innerHTML = '';

  // Add current notifications
  notifications.forEach(notification => {
    const notificationElement = document.createElement('div');
    notificationElement.className = `notification ${notification.type}`;
    notificationElement.setAttribute('data-notification-id', notification.id);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'notification-message';
    messageDiv.textContent = notification.message;
    
    const closeButton = document.createElement('button');
    closeButton.className = 'notification-close';
    closeButton.textContent = '×';
    closeButton.onclick = () => {
      // Send message to clear notification
      chrome.runtime.sendMessage({
        type: 'CLEAR_NOTIFICATION',
        payload: { id: notification.id }
      });
    };
    
    notificationElement.appendChild(messageDiv);
    notificationElement.appendChild(closeButton);
    
    notificationContainer!.appendChild(notificationElement);
  });
}