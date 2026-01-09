// Background Service Worker for AI Focus Lens extension
// Handles LLM API integration, data processing, and component coordination

import { 
  ExtensionConfig, 
  Message 
} from './types';

console.log('AI Focus Lens Service Worker initialized');

// Service worker event listeners
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Focus Lens extension installed');
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  console.log('Service Worker received message:', message.type);
  
  // Handle different message types
  switch (message.type) {
    case 'START_SCAN':
      handleStartScan(sender.tab?.id);
      break;
    case 'GET_CONFIG':
      handleGetConfig(sendResponse);
      return true; // Keep message channel open for async response
    case 'SAVE_CONFIG':
      if (message.payload && typeof message.payload === 'object') {
        handleSaveConfig(message.payload as ExtensionConfig, sendResponse);
      }
      return true;
    default:
      console.warn('Unknown message type:', message.type);
  }
  
  return false; // Close message channel for sync responses
});

async function handleStartScan(tabId?: number): Promise<void> {
  if (!tabId) {
    console.error('No tab ID provided for scan');
    return;
  }
  
  try {
    // Inject content script and start analysis
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
    
    console.log('Content script injected, scan started');
  } catch (error) {
    console.error('Failed to start scan:', error);
  }
}

async function handleGetConfig(sendResponse: (response: { success: boolean; config?: ExtensionConfig; error?: string }) => void): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(['config']);
    const config: ExtensionConfig = result.config || {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo',
      batchSize: 5,
      cacheEnabled: true
    };
    
    sendResponse({ success: true, config });
  } catch (error) {
    console.error('Failed to get config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}

async function handleSaveConfig(
  config: ExtensionConfig, 
  sendResponse: (response: { success: boolean; error?: string }) => void
): Promise<void> {
  try {
    await chrome.storage.sync.set({ config });
    sendResponse({ success: true });
    console.log('Configuration saved successfully');
  } catch (error) {
    console.error('Failed to save config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendResponse({ success: false, error: errorMessage });
  }
}