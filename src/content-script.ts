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
    console.log('Content Script received message:', message.type);
    switch (message.type) {
      case 'START_ANALYSIS':
        analyzeElements();
        break;
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
  // REMOVED: No longer automatic to prevent duplicate triggers
}

async function analyzeElements(): Promise<void> {
  console.log('Starting element analysis');
  
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
  const rawElements = Array.from(document.querySelectorAll(focusableSelectors.join(',')));
  
  // Process elements sequentially to allow focus/blur logic to work reliably
  for (const element of rawElements) {
    if (element instanceof HTMLElement && isElementVisible(element)) {
      const focusableElement = await createFocusableElement(element);
      if (focusableElement) {
        elements.push(focusableElement);
      }
    }
  }

  const analysisData: ElementAnalysisData = {
    elements: elements,
    pageUrl: window.location.href,
    timestamp: Date.now(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    pageMetadata: {
      title: document.title,
      domain: window.location.hostname,
      userAgent: navigator.userAgent,
      documentReadyState: document.readyState
    },
    scanSettings: {
      includeHiddenElements: false,
      minimumContrastRatio: 3.0,
      focusIndicatorThreshold: 3
    }
  };
  
  // Send data to service worker
  chrome.runtime.sendMessage({
    type: 'ELEMENTS_ANALYZED',
    payload: analysisData
  } as ContentScriptMessage);
  
  console.log(`Analyzed ${elements.length} focusable elements`);
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

async function createFocusableElement(element: HTMLElement): Promise<FocusableElement | null> {
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
        outlineOffset: computedStyle.outlineOffset,
        boxShadow: computedStyle.boxShadow,
        border: computedStyle.border,
        borderColor: computedStyle.borderColor,
        borderWidth: computedStyle.borderWidth,
        borderStyle: computedStyle.borderStyle,
        borderRadius: computedStyle.borderRadius,
        backgroundColor: computedStyle.backgroundColor,
        color: computedStyle.color,
        opacity: computedStyle.opacity,
        visibility: computedStyle.visibility,
        display: computedStyle.display,
        position: computedStyle.position,
        zIndex: computedStyle.zIndex
      },
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      },
      isSequentialFocusElement: isSequentialFocusElement(element),
      isInViewport: isInViewport(element),
      ...(element.id && { elementId: element.id }),
      ...(element.className && { className: element.className })
    };
    
    // Add aria-label if it exists and is not null
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      focusableElement.ariaLabel = ariaLabel;
    }
    
    // Collect focus state data (including sibling changes)
    await collectFocusStateData(element, focusableElement);
    
    return focusableElement;
  } catch (error) {
    console.error('Error creating focusable element:', error);
    return null;
  }
}

async function collectFocusStateData(element: HTMLElement, focusableElement: FocusableElement): Promise<void> {
  const originalFocused = document.activeElement;
  
  try {
    console.log(`[AI Focus Lens] Collecting focus state for: ${focusableElement.selector}`);
    
    // 1. Snapshot siblings BEFORE focus
    const siblingsBefore = captureSiblingsState(element);

    // 2. Collect unfocused state
    focusableElement.unfocusedStyle = getComputedStyleData(element);
    
    // 3. Focus the element and trigger events
    element.focus({ preventScroll: true });
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    element.dispatchEvent(new Event('focusin', { bubbles: true }));
    
    // 4. WAIT for JavaScript-triggered style changes to render
    // Increased to 250ms for slower systems/complex handlers
    await new Promise(resolve => setTimeout(resolve, 250));
    
    // 5. Collect focused state
    focusableElement.focusedStyle = getComputedStyleData(element);
    
    // 6. Snapshot siblings AFTER focus
    const siblingsAfter = captureSiblingsState(element);

    // 7. Compare sibling states to find external indicators
    const indicators = compareSiblingStates(siblingsBefore, siblingsAfter);
    focusableElement.externalIndicators = indicators;
    
    if (indicators.length > 0) {
      console.log(`%c[AI Focus Lens] Found ${indicators.length} external indicators for ${focusableElement.selector}:`, 'color: #007bff; font-weight: bold;', indicators);
    } else {
      console.log(`[AI Focus Lens] No external indicators found for ${focusableElement.selector}`);
    }
    
    // Restore original focus
    if (originalFocused instanceof HTMLElement && originalFocused !== element) {
      originalFocused.focus({ preventScroll: true });
    } else if (document.activeElement === element) {
      element.blur();
    }
  } catch (error) {
    console.error('Error collecting focus state data:', error);
  }
}

function captureSiblingsState(element: HTMLElement): Map<string, any> {
  const state = new Map<string, any>();
  const parent = element.parentElement;
  
  if (parent) {
    Array.from(parent.children).forEach(child => {
      if (child !== element && child instanceof HTMLElement) {
        const key = child.id ? `#${child.id}` : generateSelector(child);
        const style = window.getComputedStyle(child);
        state.set(key, {
          backgroundColor: style.backgroundColor,
          color: style.color,
          visibility: style.visibility,
          display: style.display,
          opacity: style.opacity,
          outline: style.outline,
          border: style.border,
          boxShadow: style.boxShadow,
          width: style.width,
          height: style.height
        });
      }
    });
  }
  return state;
}

function compareSiblingStates(before: Map<string, any>, after: Map<string, any>): string[] {
  const indicators: string[] = [];
  
  after.forEach((afterState, key) => {
    const beforeState = before.get(key);
    if (!beforeState) return;

    const changes: string[] = [];
    const propsToCompare = [
      'backgroundColor', 'color', 'visibility', 'display', 
      'opacity', 'outline', 'border', 'boxShadow', 'width', 'height'
    ];

    propsToCompare.forEach(prop => {
      if (beforeState[prop] !== afterState[prop]) {
        console.log(`[AI Focus Lens] Sibling ${key} change: ${prop} from "${beforeState[prop]}" to "${afterState[prop]}"`);
        changes.push(`${prop} changed from "${beforeState[prop]}" to "${afterState[prop]}"`);
      }
    });

    if (changes.length > 0) {
      indicators.push(`Sibling element ${key}: ${changes.join(', ')}`);
    }
  });

  return indicators;
}

function getComputedStyleData(element: HTMLElement): ComputedStyleData {
  const style = window.getComputedStyle(element);
  return {
    outline: style.outline,
    outlineColor: style.outlineColor,
    outlineWidth: style.outlineWidth,
    outlineStyle: style.outlineStyle,
    outlineOffset: style.outlineOffset,
    boxShadow: style.boxShadow,
    border: style.border,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    borderStyle: style.borderStyle,
    borderRadius: style.borderRadius,
    backgroundColor: style.backgroundColor,
    color: style.color,
    opacity: style.opacity,
    visibility: style.visibility,
    display: style.display,
    position: style.position,
    zIndex: style.zIndex
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

function isSequentialFocusElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const tabIndex = element.getAttribute('tabindex');
  
  // Elements that are naturally focusable
  const naturallyFocusable = [
    'a', 'button', 'input', 'select', 'textarea', 'details'
  ];
  
  if (naturallyFocusable.includes(tagName)) {
    // Check if explicitly removed from tab order
    return tabIndex !== '-1';
  }
  
  // Elements with positive or zero tabindex
  if (tabIndex !== null) {
    const tabIndexNum = parseInt(tabIndex, 10);
    return !isNaN(tabIndexNum) && tabIndexNum >= 0;
  }
  
  // Contenteditable elements
  if (element.getAttribute('contenteditable') === 'true') {
    return tabIndex !== '-1';
  }
  
  return false;
}

function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Initialize when script loads
initializeContentScript();