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
const modelSelect = document.getElementById('model') as HTMLSelectElement;
const saveConfigBtn = document.getElementById('saveConfig') as HTMLButtonElement;
const configStatus = document.getElementById('configStatus') as HTMLDivElement;
const startScanBtn = document.getElementById('startScan') as HTMLButtonElement;
const scanProgress = document.getElementById('scanProgress') as HTMLDivElement;
const progressBar = document.getElementById('progressBar') as HTMLDivElement;
const scanStatus = document.getElementById('scanStatus') as HTMLDivElement;
const resultsSection = document.getElementById('resultsSection') as HTMLDivElement;
const resultsSummary = document.getElementById('resultsSummary') as HTMLDivElement;
const resultsContainer = document.getElementById('resultsContainer') as HTMLDivElement;

// Initialize popup
document.addEventListener('DOMContentLoaded', initializePopup);

async function initializePopup(): Promise<void> {
  console.log('Initializing AI Focus Lens popup');
  
  // Load existing configuration
  await loadConfiguration();
  
  // Set up event listeners
  saveConfigBtn.addEventListener('click', saveConfiguration);
  startScanBtn.addEventListener('click', startScan);
  
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
      modelSelect.value = config.model || 'gpt-3.5-turbo';
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
    model: modelSelect.value,
    batchSize: 5,
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

async function startScan(): Promise<void> {
  // Validate configuration first
  if (!apiKeyInput.value.trim()) {
    showStatus(configStatus, 'Please configure your API Key first', 'error');
    return;
  }
  
  try {
    // Show progress UI
    scanProgress.classList.remove('hidden');
    startScanBtn.disabled = true;
    startScanBtn.textContent = '扫描中...';
    
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
  
  // Update summary
  resultsSummary.textContent = 
    `共检测 ${report.totalElements} 个元素，` +
    `${report.passedElements} 个通过，` +
    `${report.failedElements} 个失败`;
  
  // Display results
  displayResults(report);
  
  // Reset scan UI
  resetScanUI();
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
  startScanBtn.disabled = false;
  startScanBtn.textContent = '开始扫描';
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