// Perception Engine for Accessibility Testing Agent
// Handles environment sensing, page state detection, and interaction result collection

import { 
  FocusableElement, 
  ElementAnalysisData, 
  ComputedStyleData,
  ExtensionError 
} from '../../types';
import { FrameInfo } from '../cdp-interface';

/**
 * Perception data collected from the environment
 * Requirements: 需求 1.1, 1.2 - 感知页面状态和交互结果
 */
export interface PerceptionData {
  pageState: {
    url: string;
    title: string;
    focusableElements: FocusableElement[];
    currentFocus: string | null;
    viewport: ViewportInfo;
    dynamicContent: DynamicContentInfo[];
    frames: FrameInfo[];
  };
  interactionResults: {
    lastAction: ActionType;
    success: boolean;
    focusChanged: boolean;
    visualChanges: VisualChange[];
    errors: string[];
  };
  testProgress: {
    completedTasks: string[];
    currentTask: string;
    remainingTasks: string[];
    discoveredIssues: AccessibilityIssue[];
  };
}

export interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
}

export interface DynamicContentInfo {
  selector: string;
  type: 'added' | 'removed' | 'modified';
  timestamp: number;
  previousState?: any;
  currentState?: any;
}

export interface VisualChange {
  type: 'focus-ring' | 'outline' | 'background' | 'border';
  before: StyleSnapshot;
  after: StyleSnapshot;
  isSignificant: boolean;
  colorDifference: number;
}

export interface StyleSnapshot {
  outline: string;
  outlineColor: string;
  outlineWidth: string;
  backgroundColor: string;
  borderColor: string;
  boxShadow: string;
}

export interface AccessibilityIssue {
  id: string;
  type: 'focus-visible' | 'focus-trap' | 'keyboard-navigation' | 'color-contrast';
  severity: 'critical' | 'major' | 'minor';
  element: string;
  description: string;
  detectionMethod: 'static' | 'dynamic' | 'interaction';
}

export type ActionType = 
  | 'tab-navigation' 
  | 'mouse-click' 
  | 'keyboard-input' 
  | 'focus-change' 
  | 'page-navigation'
  | 'element-interaction';

/**
 * Perception Engine implementation
 * Requirements: 需求 1.1, 1.2 - 扩展现有的元素识别功能，添加页面状态变化检测
 */
export class PerceptionEngine {
  private currentPerception: PerceptionData | null = null;
  private observers: MutationObserver[] = [];
  private focusObserver: FocusObserver | null = null;
  private interactionHistory: InteractionRecord[] = [];
  private pageStateCache: Map<string, PageStateSnapshot> = new Map();
  private routeChangeListeners: ((url: string) => void)[] = [];
  private domChangeListeners: ((changes: DynamicContentInfo[]) => void)[] = [];
  private originalPushState: any;
  private originalReplaceState: any;
  private handleRouteChangeBound: any;
  private domChangeDebounceTimer: any;
  private pendingDynamicChanges: DynamicContentInfo[] = [];

  constructor() {
    this.initializeObservers();
    this.initializeRouteChangeDetection();
  }

  /**
   * Initialize DOM and focus observers
   * Requirements: 需求 1.1 - 页面状态变化检测
   */
  private initializeObservers(): void {
    // Initialize mutation observer for DOM changes
    const mutationObserver = new MutationObserver((mutations) => {
      this.handleDOMChanges(mutations);
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['tabindex', 'disabled', 'aria-hidden', 'style', 'class']
    });

    this.observers.push(mutationObserver);

    // Initialize focus observer
    this.focusObserver = new FocusObserver((focusEvent) => {
      this.handleFocusChange(focusEvent);
    });
  }

  /**
   * Initialize route change detection for SPAs
   * Requirements: Task 7.1.1 - 监听路由变化
   */
  private initializeRouteChangeDetection(): void {
    this.handleRouteChangeBound = () => {
      const url = window.location.href;
      console.log(`Route change detected: ${url}`);
      this.recordInteraction({
        action: 'page-navigation',
        success: true,
        focusChanged: false,
        timestamp: Date.now(),
        dynamicChanges: [{
          selector: 'window',
          type: 'modified',
          timestamp: Date.now(),
          currentState: url
        }]
      });
      this.notifyRouteChange(url);
    };

    window.addEventListener('popstate', this.handleRouteChangeBound);
    window.addEventListener('hashchange', this.handleRouteChangeBound);

    // Monkey-patch pushState and replaceState
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    const self = this;
    history.pushState = function(...args) {
      self.originalPushState.apply(this, args);
      self.handleRouteChangeBound();
    };

    history.replaceState = function(...args) {
      self.originalReplaceState.apply(this, args);
      self.handleRouteChangeBound();
    };
  }

  /**
   * Collect current perception data from the environment
   * Requirements: 需求 1.1, 1.2 - 收集页面状态和交互结果
   */
  async perceive(): Promise<PerceptionData> {
    try {
      const pageState = await this.collectPageState();
      const interactionResults = this.collectInteractionResults();
      const testProgress = this.collectTestProgress();

      this.currentPerception = {
        pageState,
        interactionResults,
        testProgress
      };

      return this.currentPerception;
    } catch (error) {
      throw this.createPerceptionError('Failed to collect perception data', error);
    }
  }

  /**
   * Collect current page state
   * Requirements: 需求 1.1 - 扩展现有的元素识别功能
   */
  private async collectPageState(): Promise<PerceptionData['pageState']> {
    const focusableElements = await this.identifyFocusableElements(document);
    const currentFocus = this.getCurrentFocusedElement();
    const viewport = this.getViewportInfo();
    const dynamicContent = this.getDynamicContentChanges();
    const frames = await this.discoverFrames();

    return {
      url: window.location.href,
      title: document.title,
      focusableElements,
      currentFocus,
      viewport,
      dynamicContent,
      frames
    };
  }

  private async discoverFrames(): Promise<FrameInfo[]> {
    const iframes = document.querySelectorAll('iframe');
    const frames: FrameInfo[] = [];
    
    iframes.forEach(iframe => {
      try {
        frames.push({
          frameId: iframe.id || this.generateSelector(iframe),
          url: iframe.src,
          securityOrigin: new URL(iframe.src).origin,
          mimeType: 'text/html'
        });
      } catch (e) {
        // Handle invalid URL or same-origin issues
      }
    });
    
    return frames;
  }

  /**
   * Enhanced element identification with state tracking
   * Requirements: 需求 1.1 - 扩展现有的元素识别功能
   */
  private async identifyFocusableElements(doc: Document = document, frameId?: string): Promise<FocusableElement[]> {
    const focusableSelectors = [
      'a[href]',
      'button',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
      'details',
      'audio[controls]',
      'video[controls]',
      'iframe'
    ];

    const elements: FocusableElement[] = [];

    for (const selector of focusableSelectors) {
      const nodeList = doc.querySelectorAll(selector);
      
      for (const element of nodeList) {
        if (element instanceof HTMLElement && this.isElementVisible(element)) {
          // Always add the element itself first
          const focusableElement = await this.createEnhancedFocusableElement(element, frameId);
          if (focusableElement) {
            elements.push(focusableElement);
          }

          // If it's an iframe, recurse into it if same-origin
          if (element instanceof HTMLIFrameElement) {
            const currentFrameId = element.id || this.generateSelector(element);
            try {
              if (element.contentDocument) {
                const subElements = await this.identifyFocusableElements(element.contentDocument, currentFrameId);
                elements.push(...subElements);
              }
            } catch (e) {
              // Cross-origin iframe, cannot access contentDocument - already added the iframe itself
            }
          }
        }
      }
    }

    return elements;
  }

  /**
   * Create enhanced focusable element with state tracking
   * Requirements: 需求 1.1, 1.2 - 收集交互结果
   */
  private async createEnhancedFocusableElement(element: HTMLElement, frameId?: string): Promise<FocusableElement | null> {
    try {
      const rect = element.getBoundingClientRect();
      const selector = this.generateSelector(element);

      // Capture initial state of siblings
      const unfocusedSiblings = this.captureSiblingsState(element);

      // Collect both focused and unfocused states
      const unfocusedStyle = this.getComputedStyleData(element);
      
      // Temporarily focus to get focused state
      const originalFocused = document.activeElement;
      element.focus();
      const focusedStyle = this.getComputedStyleData(element);
      
      // Capture state of siblings after focus
      const focusedSiblings = this.captureSiblingsState(element);

      // Compare sibling states to find external indicators
      const externalIndicators = this.compareSiblingStates(unfocusedSiblings, focusedSiblings);
      
      // Restore original focus
      if (originalFocused instanceof HTMLElement) {
        originalFocused.focus();
      } else {
        element.blur();
      }

      const focusableElement: FocusableElement = {
        selector,
        tagName: element.tagName.toLowerCase(),
        tabIndex: element.tabIndex,
        computedStyle: unfocusedStyle,
        focusedStyle,
        unfocusedStyle,
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
        },
        isSequentialFocusElement: this.isSequentialFocusElement(element),
        isInViewport: this.isInViewport(element),
        frameId,
        externalIndicators,
        ...(element.id && { elementId: element.id }),
        ...(element.className && { className: element.className })
      };

      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        focusableElement.ariaLabel = ariaLabel;
      }

      return focusableElement;
    } catch (error) {
      console.error('Error creating enhanced focusable element:', error);
      return null;
    }
  }

  private captureSiblingsState(element: HTMLElement): Map<string, any> {
    const state = new Map<string, any>();
    const parent = element.parentElement;
    
    if (parent) {
      // Check immediate siblings
      Array.from(parent.children).forEach(child => {
        if (child !== element && child instanceof HTMLElement) {
          const selector = this.generateSelector(child);
          state.set(selector, {
            style: this.getComputedStyleData(child),
            visible: this.isElementVisible(child),
            className: child.className
          });
        }
      });
    }
    return state;
  }

  private compareSiblingStates(before: Map<string, any>, after: Map<string, any>): string[] {
    const indicators: string[] = [];
    
    after.forEach((afterState, selector) => {
      const beforeState = before.get(selector);
      if (!beforeState) return;

      const changes: string[] = [];

      // Check for visibility changes
      if (!beforeState.visible && afterState.visible) {
        changes.push('became visible');
      } else if (beforeState.visible && !afterState.visible) {
        changes.push('became hidden');
      }

      // Check for background color changes
      if (beforeState.style.backgroundColor !== afterState.style.backgroundColor) {
        changes.push(`changed background-color from ${beforeState.style.backgroundColor} to ${afterState.style.backgroundColor}`);
      }

      // Check for border changes
      if (beforeState.style.borderColor !== afterState.style.borderColor || 
          beforeState.style.borderWidth !== afterState.style.borderWidth) {
        changes.push('changed border style');
      }

      // Check for opacity changes
      if (beforeState.style.opacity !== afterState.style.opacity) {
        changes.push(`changed opacity from ${beforeState.style.opacity} to ${afterState.style.opacity}`);
      }

      if (changes.length > 0) {
        indicators.push(`Sibling element ${selector} ${changes.join(', ')}`);
      }
    });

    return indicators;
  }

  /**
   * Collect interaction results from recent actions
   * Requirements: 需求 1.2 - 实现交互结果收集机制
   */
  private collectInteractionResults(): PerceptionData['interactionResults'] {
    const lastInteraction = this.interactionHistory[this.interactionHistory.length - 1];
    
    if (!lastInteraction) {
      return {
        lastAction: 'page-navigation',
        success: true,
        focusChanged: false,
        visualChanges: [],
        errors: []
      };
    }

    return {
      lastAction: lastInteraction.action,
      success: lastInteraction.success,
      focusChanged: lastInteraction.focusChanged,
      visualChanges: lastInteraction.visualChanges || [],
      errors: lastInteraction.errors || []
    };
  }

  /**
   * Collect current test progress
   */
  private collectTestProgress(): PerceptionData['testProgress'] {
    // This will be populated by the Planning Engine
    return {
      completedTasks: [],
      currentTask: 'initial-perception',
      remainingTasks: [],
      discoveredIssues: []
    };
  }

  /**
   * Record interaction result for future perception
   * Requirements: 需求 1.2 - 交互结果收集机制
   */
  recordInteraction(interaction: InteractionRecord): void {
    this.interactionHistory.push({
      ...interaction,
      timestamp: Date.now()
    });

    // Keep only last 50 interactions to prevent memory issues
    if (this.interactionHistory.length > 50) {
      this.interactionHistory = this.interactionHistory.slice(-50);
    }
  }

  /**
   * Add a listener for DOM changes
   */
  addDOMChangeListener(callback: (changes: DynamicContentInfo[]) => void): void {
    this.domChangeListeners.push(callback);
  }

  private handleDOMChanges(mutations: MutationRecord[]): void {
    const dynamicChanges: DynamicContentInfo[] = [];

    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            // Ignore minor elements, focus on potential interactive ones
            if (this.isPotentiallySignificant(node)) {
              dynamicChanges.push({
                selector: this.generateSelector(node),
                type: 'added',
                timestamp: Date.now(),
                currentState: this.captureElementState(node)
              });
            }
          }
        });

        mutation.removedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            if (this.isPotentiallySignificant(node)) {
              dynamicChanges.push({
                selector: this.generateSelector(node),
                type: 'removed',
                timestamp: Date.now(),
                previousState: this.captureElementState(node)
              });
            }
          }
        });
      }

      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        if (this.isPotentiallySignificant(mutation.target)) {
          dynamicChanges.push({
            selector: this.generateSelector(mutation.target),
            type: 'modified',
            timestamp: Date.now(),
            previousState: mutation.oldValue,
            currentState: mutation.target.getAttribute(mutation.attributeName!)
          });
        }
      }
    });

    if (dynamicChanges.length > 0) {
      this.pendingDynamicChanges.push(...dynamicChanges);
      this.debounceDOMNotification();
    }
  }

  private isPotentiallySignificant(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'iframe'];
    if (interactiveTags.includes(tagName)) return true;
    
    if (element.hasAttribute('tabindex')) return true;
    if (element.hasAttribute('role')) return true;
    if (element.getAttribute('aria-hidden') === 'false') return true;
    
    // Also check if it contains interactive elements
    if (element.querySelector('a, button, input, select, textarea, [tabindex]')) return true;

    return false;
  }

  private debounceDOMNotification(): void {
    if (this.domChangeDebounceTimer) {
      clearTimeout(this.domChangeDebounceTimer);
    }

    this.domChangeDebounceTimer = setTimeout(() => {
      const changes = [...this.pendingDynamicChanges];
      this.pendingDynamicChanges = [];
      this.notifyDynamicChanges(changes);
    }, 500); // 500ms debounce for stability
  }

  private notifyDynamicChanges(changes: DynamicContentInfo[]): void {
    console.log(`Notifying ${changes.length} significant dynamic changes`);
    this.domChangeListeners.forEach(listener => {
      try {
        listener(changes);
      } catch (error) {
        console.error('Error in DOM change listener:', error);
      }
    });
  }

  /**
   * Handle focus changes
   * Requirements: 需求 1.2 - 交互结果收集
   */
  private handleFocusChange(focusEvent: FocusChangeEvent): void {
    const interaction: InteractionRecord = {
      action: 'focus-change',
      success: true,
      focusChanged: true,
      timestamp: Date.now(),
      targetElement: focusEvent.target,
      previousElement: focusEvent.previous,
      visualChanges: focusEvent.visualChanges
    };

    this.recordInteraction(interaction);
  }

  /**
   * Get current focused element selector
   */
  private getCurrentFocusedElement(): string | null {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      return this.generateSelector(activeElement);
    }
    return null;
  }

  /**
   * Get viewport information
   */
  private getViewportInfo(): ViewportInfo {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio
    };
  }

  /**
   * Get recent dynamic content changes
   */
  private getDynamicContentChanges(): DynamicContentInfo[] {
    // Return recent changes from the last perception cycle
    const recentThreshold = Date.now() - 5000; // Last 5 seconds
    return this.interactionHistory
      .filter(interaction => interaction.timestamp > recentThreshold)
      .flatMap(interaction => interaction.dynamicChanges || []);
  }

  /**
   * Utility methods
   */
  private isElementVisible(element: HTMLElement): boolean {
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

  private isSequentialFocusElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    const tabIndex = element.getAttribute('tabindex');
    
    const naturallyFocusable = [
      'a', 'button', 'input', 'select', 'textarea', 'details'
    ];
    
    if (naturallyFocusable.includes(tagName)) {
      return tabIndex !== '-1';
    }
    
    if (tabIndex !== null) {
      const tabIndexNum = parseInt(tabIndex, 10);
      return !isNaN(tabIndexNum) && tabIndexNum >= 0;
    }
    
    if (element.getAttribute('contenteditable') === 'true') {
      return tabIndex !== '-1';
    }
    
    return false;
  }

  private isInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  private generateSelector(element: HTMLElement): string {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      return `${this.generateSelector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
    }
    
    return element.tagName.toLowerCase();
  }

  private getComputedStyleData(element: HTMLElement): ComputedStyleData {
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

  private captureElementState(element: HTMLElement): any {
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      tabIndex: element.tabIndex,
      disabled: element.hasAttribute('disabled'),
      ariaHidden: element.getAttribute('aria-hidden'),
      style: element.getAttribute('style')
    };
  }

  /**
   * Add a listener for route changes
   */
  addRouteChangeListener(callback: (url: string) => void): void {
    this.routeChangeListeners.push(callback);
  }

  private notifyRouteChange(url: string): void {
    this.routeChangeListeners.forEach(listener => {
      try {
        listener(url);
      } catch (error) {
        console.error('Error in route change listener:', error);
      }
    });
  }

  /**
   * Check if the page appears to be in a loading state
   * Requirements: Task 7.1.3 - 检测加载状态
   */
  isPageLoading(): boolean {
    // Check for common loading indicators
    const loadingSelectors = [
      '.spinner', '.loading', '[aria-busy="true"]', 
      '.skeleton', '.progress-bar', '#loading-overlay'
    ];
    
    for (const selector of loadingSelectors) {
      if (document.querySelector(selector)) return true;
    }

    // Check document ready state
    if (document.readyState !== 'complete') return true;

    return false;
  }

  /**
   * Wait for the page to reach a stable state (no major DOM changes and not loading)
   */
  async waitForStability(timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (!this.isPageLoading() && this.pendingDynamicChanges.length === 0) {
        // Wait a bit more to ensure it stays stable
        await new Promise(resolve => setTimeout(resolve, 500));
        if (this.pendingDynamicChanges.length === 0) return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return false;
  }

  private createPerceptionError(message: string, originalError: any): ExtensionError {
    return {
      code: 'PERCEPTION_ERROR',
      message,
      details: originalError instanceof Error ? originalError.message : String(originalError),
      timestamp: Date.now(),
      context: {
        component: 'perception-engine',
        action: 'perceive'
      },
      recoverable: true,
      retryable: true
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    
    if (this.focusObserver) {
      this.focusObserver.destroy();
      this.focusObserver = null;
    }

    if (this.handleRouteChangeBound) {
      window.removeEventListener('popstate', this.handleRouteChangeBound);
      window.removeEventListener('hashchange', this.handleRouteChangeBound);
    }

    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }
    
    if (this.domChangeDebounceTimer) {
      clearTimeout(this.domChangeDebounceTimer);
    }
    
    this.pageStateCache.clear();
    this.interactionHistory = [];
    this.routeChangeListeners = [];
    this.domChangeListeners = [];
    this.pendingDynamicChanges = [];
  }
}

/**
 * Focus observer for tracking focus changes
 */
class FocusObserver {
  private previousFocused: HTMLElement | null = null;
  private callback: (event: FocusChangeEvent) => void;

  constructor(callback: (event: FocusChangeEvent) => void) {
    this.callback = callback;
    this.initialize();
  }

  private initialize(): void {
    document.addEventListener('focusin', this.handleFocusIn.bind(this));
    document.addEventListener('focusout', this.handleFocusOut.bind(this));
  }

  private handleFocusIn(event: FocusEvent): void {
    if (event.target instanceof HTMLElement) {
      const visualChanges = this.detectVisualChanges(this.previousFocused, event.target);
      
      this.callback({
        type: 'focusin',
        target: this.generateSelector(event.target),
        previous: this.previousFocused ? this.generateSelector(this.previousFocused) : null,
        timestamp: Date.now(),
        visualChanges
      });
      
      this.previousFocused = event.target;
    }
  }

  private handleFocusOut(event: FocusEvent): void {
    if (event.target instanceof HTMLElement) {
      this.callback({
        type: 'focusout',
        target: this.generateSelector(event.target),
        previous: null,
        timestamp: Date.now(),
        visualChanges: []
      });
    }
  }

  private detectVisualChanges(previous: HTMLElement | null, current: HTMLElement): VisualChange[] {
    const changes: VisualChange[] = [];
    
    if (previous) {
      const previousStyle = this.captureStyleSnapshot(previous);
      const currentStyle = this.captureStyleSnapshot(current);
      
      // Compare styles and detect significant changes
      if (this.isSignificantStyleChange(previousStyle, currentStyle)) {
        changes.push({
          type: 'focus-ring',
          before: previousStyle,
          after: currentStyle,
          isSignificant: true,
          colorDifference: this.calculateColorDifference(previousStyle, currentStyle)
        });
      }
    }
    
    return changes;
  }

  private captureStyleSnapshot(element: HTMLElement): StyleSnapshot {
    const style = window.getComputedStyle(element);
    return {
      outline: style.outline,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow
    };
  }

  private isSignificantStyleChange(before: StyleSnapshot, after: StyleSnapshot): boolean {
    return (
      before.outline !== after.outline ||
      before.outlineColor !== after.outlineColor ||
      before.backgroundColor !== after.backgroundColor ||
      before.borderColor !== after.borderColor ||
      before.boxShadow !== after.boxShadow
    );
  }

  private calculateColorDifference(before: StyleSnapshot, after: StyleSnapshot): number {
    // Simplified color difference calculation
    // In a real implementation, this would use proper color space calculations
    return Math.abs(before.outlineColor.length - after.outlineColor.length);
  }

  private generateSelector(element: HTMLElement): string {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    return element.tagName.toLowerCase();
  }

  destroy(): void {
    document.removeEventListener('focusin', this.handleFocusIn.bind(this));
    document.removeEventListener('focusout', this.handleFocusOut.bind(this));
  }
}

/**
 * Supporting interfaces
 */
interface InteractionRecord {
  action: ActionType;
  success: boolean;
  focusChanged: boolean;
  timestamp: number;
  targetElement?: string;
  previousElement?: string | null;
  visualChanges?: VisualChange[];
  errors?: string[];
  dynamicChanges?: DynamicContentInfo[];
}

interface FocusChangeEvent {
  type: 'focusin' | 'focusout';
  target: string;
  previous: string | null;
  timestamp: number;
  visualChanges: VisualChange[];
}

interface PageStateSnapshot {
  url: string;
  timestamp: number;
  elementCount: number;
  focusedElement: string | null;
  hash: string;
}