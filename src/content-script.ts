// Content Script for AI Focus Lens extension
// Identifies focusable elements and collects style data

import { 
  FocusableElement, 
  ElementAnalysisData, 
  ComputedStyleData,
  ContentScriptMessage 
} from './types';

console.log('AI Focus Lens Content Script loaded');

// Initialize content script
function initializeContentScript(): void {
  console.log('Initializing AI Focus Lens content script');
  
  // Listen for messages from popup/service worker
  chrome.runtime.onMessage.addListener((message: ContentScriptMessage, _sender, _sendResponse) => {
    switch (message.type) {
      case 'HIGHLIGHT_ELEMENT':
        if (message.payload && 'selector' in message.payload) {
          highlightElement(message.payload.selector);
        }
        break;
      case 'CLEAR_HIGHLIGHTS':
        clearHighlights();
        break;
    }
  });
  
  // Start element analysis when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', analyzeElements);
  } else {
    analyzeElements();
  }
}

function analyzeElements(): void {
  console.log('Starting element analysis');
  
  const focusableElements = identifyFocusableElements();
  const analysisData: ElementAnalysisData = {
    elements: focusableElements,
    pageUrl: window.location.href,
    timestamp: Date.now(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
  
  // Send data to service worker
  chrome.runtime.sendMessage({
    type: 'ELEMENTS_ANALYZED',
    payload: analysisData
  } as ContentScriptMessage);
  
  console.log(`Analyzed ${focusableElements.length} focusable elements`);
}

function identifyFocusableElements(): FocusableElement[] {
  const focusableSelectors = [
    'a[href]',
    'button',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ];
  
  const elements: FocusableElement[] = [];
  
  focusableSelectors.forEach(selector => {
    const nodeList = document.querySelectorAll(selector);
    nodeList.forEach((element: Element) => {
      if (element instanceof HTMLElement && isElementVisible(element)) {
        const focusableElement = createFocusableElement(element);
        if (focusableElement) {
          elements.push(focusableElement);
        }
      }
    });
  });
  
  return elements;
}

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    parseFloat(style.opacity) > 0
  );
}

function createFocusableElement(element: HTMLElement): FocusableElement | null {
  try {
    const computedStyle = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    // Generate unique selector for the element
    const selector = generateSelector(element);
    
    const focusableElement: FocusableElement = {
      selector,
      tagName: element.tagName.toLowerCase(),
      tabIndex: element.tabIndex,
      computedStyle: {
        outline: computedStyle.outline,
        outlineColor: computedStyle.outlineColor,
        outlineWidth: computedStyle.outlineWidth,
        outlineStyle: computedStyle.outlineStyle,
        boxShadow: computedStyle.boxShadow,
        border: computedStyle.border,
        borderColor: computedStyle.borderColor,
        borderWidth: computedStyle.borderWidth,
        borderStyle: computedStyle.borderStyle
      },
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        toJSON: rect.toJSON
      }
    };
    
    // Collect focus state data
    collectFocusStateData(element, focusableElement);
    
    return focusableElement;
  } catch (error) {
    console.error('Error creating focusable element:', error);
    return null;
  }
}

function collectFocusStateData(element: HTMLElement, focusableElement: FocusableElement): void {
  // Store original focused element
  const originalFocused = document.activeElement;
  
  try {
    // Collect unfocused state
    focusableElement.unfocusedStyle = getComputedStyleData(element);
    
    // Focus the element and collect focused state
    element.focus();
    focusableElement.focusedStyle = getComputedStyleData(element);
    
    // Restore original focus
    if (originalFocused instanceof HTMLElement) {
      originalFocused.focus();
    } else {
      element.blur();
    }
  } catch (error) {
    console.error('Error collecting focus state data:', error);
  }
}

function getComputedStyleData(element: HTMLElement): ComputedStyleData {
  const style = window.getComputedStyle(element);
  return {
    outline: style.outline,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth,
    outlineStyle: style.outlineStyle,
    boxShadow: style.boxShadow,
    border: style.border,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    borderStyle: style.borderStyle
  };
}

function generateSelector(element: HTMLElement): string {
  // Generate a unique CSS selector for the element
  if (element.id) {
    return `#${element.id}`;
  }
  
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
    }
  }
  
  // Fallback to nth-child selector
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element) + 1;
    return `${generateSelector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
  }
  
  return element.tagName.toLowerCase();
}

function highlightElement(selector: string): void {
  // Remove existing highlights
  clearHighlights();
  
  try {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      element.style.outline = '3px solid #ff6b6b';
      element.style.outlineOffset = '2px';
      element.setAttribute('data-ai-focus-lens-highlight', 'true');
      
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (error) {
    console.error('Error highlighting element:', error);
  }
}

function clearHighlights(): void {
  const highlightedElements = document.querySelectorAll('[data-ai-focus-lens-highlight]');
  highlightedElements.forEach(element => {
    if (element instanceof HTMLElement) {
      element.style.outline = '';
      element.style.outlineOffset = '';
      element.removeAttribute('data-ai-focus-lens-highlight');
    }
  });
}

// Initialize when script loads
initializeContentScript();