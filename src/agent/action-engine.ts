// Action Engine for Accessibility Testing Agent
// Implements action execution framework, complex UI component handling, and page navigation
// Requirements: 需求 1.3, 4.2 - 创建行动执行框架，实现复杂 UI 组件处理，添加页面导航功能

import { CDPInterface, CDPSession, FocusState, NavigationResult } from './cdp-interface';
import { KeyboardInteractionSimulator } from './keyboard-interaction';
import { MouseTouchInteractionSimulator, InteractionResult } from './mouse-touch-interaction';
import { FocusTrapDetector, FocusTrapReport, createFocusTrapDetector } from './focus-trap-detector';
import { ExtensionError } from '../types';

/**
 * Action types that the engine can execute
 */
export type ActionType = 
  | 'analyze' 
  | 'keyboard' 
  | 'mouse' 
  | 'focus' 
  | 'verify' 
  | 'expand-component' 
  | 'navigate' 
  | 'inject-css' 
  | 'capture-screenshot';

/**
 * Base action interface
 */
export interface Action {
  type: ActionType;
  target?: string;
  parameters?: Record<string, any>;
  description: string;
  estimatedDuration: number;
  frameId?: string;
}

/**
 * Action execution result
 */
export interface ActionResult {
  success: boolean;
  duration: number;
  output?: any;
  error?: ExtensionError;
  sideEffects?: SideEffect[];
}

export interface SideEffect {
  type: 'dom-change' | 'focus-change' | 'style-change' | 'navigation';
  description: string;
  reversible: boolean;
  data?: any;
}

/**
 * Complex UI component types that can be automatically expanded
 * Requirements: 需求 1.3 - 检测下拉菜单和模态框
 */
export interface UIComponent {
  type: 'dropdown' | 'modal' | 'accordion' | 'tab-panel' | 'menu' | 'tooltip' | 'popover';
  selector: string;
  triggerSelector?: string;
  expandedSelector?: string;
  isExpanded: boolean;
  expandMethod: 'click' | 'hover' | 'keyboard' | 'focus';
  keyboardShortcut?: string;
  ariaExpanded?: boolean;
}

/**
 * Component expansion result
 */
export interface ComponentExpansionResult {
  component: UIComponent;
  success: boolean;
  expandedElements: string[];
  accessibilityIssues: ComponentAccessibilityIssue[];
  duration: number;
  error?: string;
}

export interface ComponentAccessibilityIssue {
  type: 'missing-aria' | 'focus-trap' | 'keyboard-inaccessible' | 'no-focus-indicator';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  element: string;
  recommendation: string;
}

/**
 * Focus trap detection result
 * Requirements: 需求 1.5 - 检测"按 Tab 无反应"模式
 */
export interface FocusTrapResult {
  hasTrap: boolean;
  trapType: 'infinite-loop' | 'no-escape' | 'skip-content' | 'modal-trap';
  startElement: string;
  endElement: string;
  trapSequence: string[];
  severity: 'critical' | 'major' | 'minor';
  description: string;
  escapeMethod?: string;
}

/**
 * Page navigation capabilities
 */
export interface NavigationCapabilities {
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  canRefresh: boolean;
  canNavigateToUrl: boolean;
  supportsHashNavigation: boolean;
  supportsSPARouting: boolean;
}

/**
 * Action Engine Implementation
 * Requirements: 需求 1.3, 4.2 - 创建行动执行框架，实现复杂 UI 组件处理
 */
export class ActionEngine {
  private cdpInterface: CDPInterface;
  private keyboardSimulator: KeyboardInteractionSimulator;
  private mouseSimulator: MouseTouchInteractionSimulator;
  private focusTrapDetector: FocusTrapDetector;
  private currentSession: CDPSession | null = null;
  private frameSessionMap: Map<string, string> = new Map(); // Map frameId to sessionId
  private componentCache: Map<string, UIComponent[]> = new Map();
  private actionHistory: ActionResult[] = [];

  constructor(
    cdpInterface: CDPInterface,
    keyboardSimulator: KeyboardInteractionSimulator,
    mouseSimulator: MouseTouchInteractionSimulator
  ) {
    this.cdpInterface = cdpInterface;
    this.keyboardSimulator = keyboardSimulator;
    this.mouseSimulator = mouseSimulator;
    this.focusTrapDetector = createFocusTrapDetector(cdpInterface, keyboardSimulator);
  }

  /**
   * Initialize the action engine
   */
  async initialize(tabId: number): Promise<boolean> {
    try {
      // Connect to tab via CDP
      this.currentSession = await this.cdpInterface.connect(tabId);
      
      // Enable required CDP domains
      await Promise.all([
        this.cdpInterface.enableRuntime(this.currentSession.sessionId),
        this.cdpInterface.enableDOM(this.currentSession.sessionId),
        this.cdpInterface.enableInput(this.currentSession.sessionId),
        this.cdpInterface.enablePage(this.currentSession.sessionId),
        this.cdpInterface.autoAttachIframes(this.currentSession.sessionId)
      ]);

      // Initialize sub-simulators
      await Promise.all([
        this.keyboardSimulator.initialize(tabId),
        this.mouseSimulator.initialize(tabId),
        this.focusTrapDetector.initialize(tabId)
      ]);

      console.log(`Action Engine initialized for tab ${tabId}`);
      return true;

    } catch (error) {
      console.error('Failed to initialize Action Engine:', error);
      return false;
    }
  }

  /**
   * Register a frame ID to a CDP session ID mapping
   */
  registerFrameSession(frameId: string, sessionId: string): void {
    this.frameSessionMap.set(frameId, sessionId);
    console.log(`Registered session ${sessionId} for frame ${frameId}`);
  }

  /**
   * Execute a single action
   */
  async executeAction(action: Action): Promise<ActionResult> {
    if (!this.currentSession) {
      throw new Error('Action Engine not initialized');
    }

    const startTime = Date.now();
    let result: ActionResult;

    try {
      switch (action.type) {
        case 'analyze':
          result = await this.executeAnalyzeAction(action);
          break;
        case 'keyboard':
          result = await this.executeKeyboardAction(action);
          break;
        case 'mouse':
          result = await this.executeMouseAction(action);
          break;
        case 'focus':
          result = await this.executeFocusAction(action);
          break;
        case 'verify':
          result = await this.executeVerifyAction(action);
          break;
        case 'expand-component':
          result = await this.executeExpandComponentAction(action);
          break;
        case 'navigate':
          result = await this.executeNavigateAction(action);
          break;
        case 'inject-css':
          result = await this.executeInjectCSSAction(action);
          break;
        case 'capture-screenshot':
          result = await this.executeCaptureScreenshotAction(action);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      result.duration = Date.now() - startTime;
      this.actionHistory.push(result);

      console.log(`Action executed: ${action.type} (${result.success ? 'success' : 'failed'}) in ${result.duration}ms`);
      return result;

    } catch (error) {
      const errorResult: ActionResult = {
        success: false,
        duration: Date.now() - startTime,
        error: {
          code: 'ACTION_EXECUTION_ERROR',
          message: `Failed to execute action ${action.type}`,
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          context: { 
            component: 'action-engine',
            action: action.type,
            actionObject: action 
          },
          recoverable: true,
          retryable: true
        }
      };

      this.actionHistory.push(errorResult);
      return errorResult;
    }
  }

  /**
   * Detect and expand complex UI components
   * Requirements: 需求 1.3 - 检测下拉菜单和模态框，自动触发展开操作
   */
  async detectAndExpandComponents(): Promise<ComponentExpansionResult[]> {
    if (!this.currentSession) {
      throw new Error('Action Engine not initialized');
    }

    const results: ComponentExpansionResult[] = [];

    try {
      // Detect all expandable components on the page
      const components = await this.detectUIComponents();
      
      console.log(`Detected ${components.length} expandable components`);

      // Expand each component and test its accessibility
      for (const component of components) {
        const expansionResult = await this.expandComponent(component);
        results.push(expansionResult);

        // If expansion was successful, test internal elements
        if (expansionResult.success) {
          await this.testExpandedComponentAccessibility(component, expansionResult);
        }

        // Collapse component after testing (if possible)
        await this.collapseComponent(component);
      }

      return results;

    } catch (error) {
      console.error('Failed to detect and expand components:', error);
      return [];
    }
  }

  /**
   * Detect focus traps on the page using comprehensive analysis
   * Requirements: 需求 1.5 - 检测"按 Tab 无反应"模式，记录焦点陷阱行为，生成焦点陷阱报告
   */
  async detectFocusTraps(): Promise<FocusTrapReport> {
    if (!this.currentSession) {
      throw new Error('Action Engine not initialized');
    }

    try {
      console.log('Starting comprehensive focus trap detection...');
      
      // Use the dedicated focus trap detector for comprehensive analysis
      const report = await this.focusTrapDetector.detectFocusTraps();
      
      console.log(`Focus trap detection completed. Found ${report.totalTraps} traps with score: ${report.overallScore}/100`);
      return report;

    } catch (error) {
      console.error('Focus trap detection failed:', error);
      
      // Return error report
      return {
        pageUrl: 'unknown',
        scanTimestamp: Date.now(),
        totalTraps: 0,
        criticalTraps: 0,
        majorTraps: 0,
        minorTraps: 0,
        traps: [],
        overallScore: 0,
        recommendations: [`Detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        testDuration: 0
      };
    }
  }

  /**
   * Get navigation capabilities of the current page
   */
  async getNavigationCapabilities(): Promise<NavigationCapabilities> {
    if (!this.currentSession) {
      throw new Error('Action Engine not initialized');
    }

    try {
      const capabilities = await this.cdpInterface.evaluateExpression(this.currentSession.sessionId, `
        (function() {
          return {
            canNavigateBack: window.history.length > 1,
            canNavigateForward: false, // Cannot detect this reliably
            canRefresh: true,
            canNavigateToUrl: true,
            supportsHashNavigation: window.location.hash !== undefined,
            supportsSPARouting: !!(window.history.pushState && window.history.replaceState)
          };
        })()
      `);

      return capabilities;

    } catch (error) {
      console.error('Failed to get navigation capabilities:', error);
      return {
        canNavigateBack: false,
        canNavigateForward: false,
        canRefresh: false,
        canNavigateToUrl: false,
        supportsHashNavigation: false,
        supportsSPARouting: false
      };
    }
  }

  /**
   * Get action execution history
   */
  getActionHistory(): ActionResult[] {
    return [...this.actionHistory];
  }

  /**
   * Clear action history
   */
  clearActionHistory(): void {
    this.actionHistory = [];
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    if (this.currentSession) {
      try {
        await Promise.all([
          this.keyboardSimulator.cleanup(),
          this.mouseSimulator.cleanup(),
          this.focusTrapDetector.cleanup(),
          this.cdpInterface.disconnect(this.currentSession.sessionId)
        ]);
        
        this.currentSession = null;
        this.componentCache.clear();
        this.actionHistory = [];
        
        console.log('Action Engine cleaned up');
      } catch (error) {
        console.error('Failed to cleanup Action Engine:', error);
      }
    }
  }

  // Private action execution methods

  private async executeAnalyzeAction(action: Action): Promise<ActionResult> {
    const analysisType = action.parameters?.analysisType || 'general';
    
    switch (analysisType) {
      case 'focus-visibility':
        return this.analyzeFocusVisibility(action.target);
      case 'component-structure':
        return this.analyzeComponentStructure(action.target);
      default:
        return this.performGeneralAnalysis(action.target);
    }
  }

  private async executeKeyboardAction(action: Action): Promise<ActionResult> {
    const key = action.parameters?.key;
    const direction = action.parameters?.direction;
    const modifiers = action.parameters?.modifiers || [];

    if (key === 'Tab') {
      const navigationResult = await this.keyboardSimulator.simulateTabNavigation(direction);
      return {
        success: navigationResult.success,
        duration: 0, // Will be set by caller
        output: navigationResult,
        sideEffects: navigationResult.focusChanged ? [{
          type: 'focus-change',
          description: `Focus changed from ${navigationResult.previousFocus?.elementSelector} to ${navigationResult.currentFocus?.elementSelector}`,
          reversible: true,
          data: navigationResult
        }] : []
      };
    } else {
      await this.cdpInterface.simulateKeyPress(this.currentSession!.sessionId, key, modifiers);
      return {
        success: true,
        duration: 0,
        output: { key, modifiers }
      };
    }
  }

  private async executeMouseAction(action: Action): Promise<ActionResult> {
    const x = action.parameters?.x;
    const y = action.parameters?.y;
    const button = action.parameters?.button || 'left';

    if (x !== undefined && y !== undefined) {
      await this.cdpInterface.simulateMouseClick(this.currentSession!.sessionId, x, y, button);
      return {
        success: true,
        duration: 0,
        output: { x, y, button }
      };
    } else if (action.target) {
      const interactionResult = await this.mouseSimulator.simulateMouseClick({
        type: 'selector',
        value: action.target
      });
      
      return {
        success: interactionResult.success,
        duration: 0,
        output: interactionResult,
        sideEffects: interactionResult.focusChanged ? [{
          type: 'focus-change',
          description: 'Mouse click changed focus',
          reversible: true,
          data: interactionResult
        }] : []
      };
    }

    throw new Error('Mouse action requires either coordinates (x, y) or target selector');
  }

  private async executeFocusAction(action: Action): Promise<ActionResult> {
    if (!action.target) {
      throw new Error('Focus action requires a target selector');
    }

    const sessionId = (action.frameId && this.frameSessionMap.get(action.frameId)) || this.currentSession!.sessionId;
    const success = await this.cdpInterface.setFocus(sessionId, action.target);
    
    return {
      success,
      duration: 0,
      output: { target: action.target, focused: success, frameId: action.frameId },
      sideEffects: success ? [{
        type: 'focus-change',
        description: `Focus set to ${action.target}${action.frameId ? ` in frame ${action.frameId}` : ''}`,
        reversible: true,
        data: { target: action.target, frameId: action.frameId }
      }] : []
    };
  }

  private async executeVerifyAction(action: Action): Promise<ActionResult> {
    const criteria = action.parameters?.criteria;
    
    switch (criteria) {
      case 'focus-visible':
        return this.verifyFocusVisibility();
      case 'keyboard-accessible':
        return this.verifyKeyboardAccessibility();
      default:
        return this.performGeneralVerification();
    }
  }

  private async executeExpandComponentAction(action: Action): Promise<ActionResult> {
    if (!action.target) {
      throw new Error('Expand component action requires a target selector');
    }

    const components = await this.detectUIComponents();
    const targetComponent = components.find(c => c.selector === action.target);
    
    if (!targetComponent) {
      throw new Error(`Component not found: ${action.target}`);
    }

    const expansionResult = await this.expandComponent(targetComponent);
    
    return {
      success: expansionResult.success,
      duration: 0,
      output: expansionResult,
      sideEffects: expansionResult.success ? [{
        type: 'dom-change',
        description: `Component ${action.target} expanded`,
        reversible: true,
        data: expansionResult
      }] : []
    };
  }

  private async executeNavigateAction(action: Action): Promise<ActionResult> {
    const url = action.parameters?.url;
    const direction = action.parameters?.direction; // 'back', 'forward', 'refresh'

    if (url) {
      await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `window.location.href = '${url}'`);
      return {
        success: true,
        duration: 0,
        output: { url },
        sideEffects: [{
          type: 'navigation',
          description: `Navigated to ${url}`,
          reversible: false,
          data: { url }
        }]
      };
    } else if (direction) {
      let script = '';
      switch (direction) {
        case 'back':
          script = 'window.history.back()';
          break;
        case 'forward':
          script = 'window.history.forward()';
          break;
        case 'refresh':
          script = 'window.location.reload()';
          break;
        default:
          throw new Error(`Unknown navigation direction: ${direction}`);
      }

      await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, script);
      return {
        success: true,
        duration: 0,
        output: { direction },
        sideEffects: [{
          type: 'navigation',
          description: `Navigation: ${direction}`,
          reversible: direction !== 'refresh',
          data: { direction }
        }]
      };
    }

    throw new Error('Navigate action requires either url or direction parameter');
  }

  private async executeInjectCSSAction(action: Action): Promise<ActionResult> {
    const css = action.parameters?.css;
    
    if (!css) {
      throw new Error('Inject CSS action requires css parameter');
    }

    const styleSheetId = await this.cdpInterface.addStyleSheet(this.currentSession!.sessionId, css);
    
    return {
      success: true,
      duration: 0,
      output: { styleSheetId, css },
      sideEffects: [{
        type: 'style-change',
        description: 'CSS injected into page',
        reversible: true,
        data: { styleSheetId, css }
      }]
    };
  }

  private async executeCaptureScreenshotAction(action: Action): Promise<ActionResult> {
    const options = action.parameters?.options || {};
    
    const screenshot = await this.cdpInterface.captureScreenshot(this.currentSession!.sessionId, options);
    
    return {
      success: true,
      duration: 0,
      output: screenshot
    };
  }

  // Component detection and expansion methods

  private async detectUIComponents(): Promise<UIComponent[]> {
    if (!this.currentSession) return [];

    const cacheKey = this.currentSession.sessionId;
    if (this.componentCache.has(cacheKey)) {
      return this.componentCache.get(cacheKey)!;
    }

    try {
      const components = await this.cdpInterface.evaluateExpression(this.currentSession.sessionId, `
        (function() {
          const components = [];
          
          // Detect dropdowns
          document.querySelectorAll('select, .dropdown, [role="combobox"], [aria-haspopup]').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              components.push({
                type: 'dropdown',
                selector: el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
                triggerSelector: el.tagName === 'SELECT' ? null : el.querySelector('button, .trigger')?.id || null,
                isExpanded: el.getAttribute('aria-expanded') === 'true' || el.open,
                expandMethod: el.tagName === 'SELECT' ? 'click' : 'click',
                ariaExpanded: el.hasAttribute('aria-expanded')
              });
            }
          });
          
          // Detect modals and dialogs
          document.querySelectorAll('[role="dialog"], .modal, .popup, [aria-modal]').forEach(el => {
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== 'none';
            
            components.push({
              type: 'modal',
              selector: el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
              triggerSelector: document.querySelector('[data-target="#' + el.id + '"], [aria-controls="' + el.id + '"]')?.id || null,
              isExpanded: isVisible,
              expandMethod: 'click',
              ariaExpanded: el.getAttribute('aria-modal') === 'true'
            });
          });
          
          // Detect accordions
          document.querySelectorAll('.accordion, [role="tablist"], details').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              components.push({
                type: el.tagName === 'DETAILS' ? 'accordion' : 'accordion',
                selector: el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
                isExpanded: el.tagName === 'DETAILS' ? el.open : el.querySelector('[aria-expanded="true"]') !== null,
                expandMethod: 'click',
                ariaExpanded: el.hasAttribute('aria-expanded') || el.tagName === 'DETAILS'
              });
            }
          });
          
          // Detect menus
          document.querySelectorAll('[role="menu"], .menu, nav ul').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              components.push({
                type: 'menu',
                selector: el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
                isExpanded: getComputedStyle(el).display !== 'none',
                expandMethod: 'hover',
                ariaExpanded: el.hasAttribute('aria-expanded')
              });
            }
          });
          
          return components;
        })()
      `);

      this.componentCache.set(cacheKey, components);
      return components;

    } catch (error) {
      console.error('Failed to detect UI components:', error);
      return [];
    }
  }
  private async expandComponent(component: UIComponent): Promise<ComponentExpansionResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Expanding component: ${component.type} (${component.selector})`);

      // Skip if already expanded
      if (component.isExpanded) {
        return {
          component,
          success: true,
          expandedElements: [],
          accessibilityIssues: [],
          duration: Date.now() - startTime
        };
      }

      // Determine expansion method and execute
      let success = false;
      const expandedElements: string[] = [];

      switch (component.expandMethod) {
        case 'click':
          success = await this.expandByClick(component);
          break;
        case 'hover':
          success = await this.expandByHover(component);
          break;
        case 'keyboard':
          success = await this.expandByKeyboard(component);
          break;
        case 'focus':
          success = await this.expandByFocus(component);
          break;
      }

      // If expansion succeeded, get the newly visible elements
      if (success) {
        const newElements = await this.getExpandedElements(component);
        expandedElements.push(...newElements);
      }

      // Analyze accessibility of the expanded component
      const accessibilityIssues = success ? await this.analyzeComponentAccessibility(component) : [];

      return {
        component,
        success,
        expandedElements,
        accessibilityIssues,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        component,
        success: false,
        expandedElements: [],
        accessibilityIssues: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async expandByClick(component: UIComponent): Promise<boolean> {
    try {
      const targetSelector = component.triggerSelector || component.selector;
      
      // Try mouse click first
      const clickResult = await this.mouseSimulator.simulateMouseClick({
        type: 'selector',
        value: targetSelector
      });

      if (clickResult.success) {
        // Wait for expansion animation
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Verify expansion
        return await this.verifyComponentExpansion(component);
      }

      return false;

    } catch (error) {
      console.error(`Failed to expand component by click: ${error}`);
      return false;
    }
  }

  private async expandByHover(component: UIComponent): Promise<boolean> {
    try {
      const hoverResult = await this.mouseSimulator.simulateMouseHover({
        type: 'selector',
        value: component.selector
      });

      if (hoverResult.success) {
        // Wait for hover effects
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify expansion
        return await this.verifyComponentExpansion(component);
      }

      return false;

    } catch (error) {
      console.error(`Failed to expand component by hover: ${error}`);
      return false;
    }
  }

  private async expandByKeyboard(component: UIComponent): Promise<boolean> {
    try {
      // Focus the component first
      await this.cdpInterface.setFocus(this.currentSession!.sessionId, component.selector);
      
      // Try common keyboard shortcuts
      const shortcuts = [
        'Enter',
        'Space',
        'ArrowDown',
        component.keyboardShortcut
      ].filter(Boolean);

      for (const key of shortcuts) {
        if (key) {
          await this.cdpInterface.simulateKeyPress(this.currentSession!.sessionId, key);
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const expanded = await this.verifyComponentExpansion(component);
          if (expanded) {
            return true;
          }
        }
      }

      return false;

    } catch (error) {
      console.error(`Failed to expand component by keyboard: ${error}`);
      return false;
    }
  }

  private async expandByFocus(component: UIComponent): Promise<boolean> {
    try {
      const success = await this.cdpInterface.setFocus(this.currentSession!.sessionId, component.selector);
      
      if (success) {
        // Wait for focus effects
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify expansion
        return await this.verifyComponentExpansion(component);
      }

      return false;

    } catch (error) {
      console.error(`Failed to expand component by focus: ${error}`);
      return false;
    }
  }

  private async verifyComponentExpansion(component: UIComponent): Promise<boolean> {
    try {
      return await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const element = document.querySelector('${component.selector}');
          if (!element) return false;
          
          switch ('${component.type}') {
            case 'dropdown':
              // Check for expanded dropdown content
              const dropdown = element.querySelector('.dropdown-menu, .options, [role="listbox"]');
              return dropdown && getComputedStyle(dropdown).display !== 'none';
              
            case 'modal':
              // Check if modal is visible
              return getComputedStyle(element).display !== 'none' && 
                     getComputedStyle(element).visibility !== 'hidden';
              
            case 'accordion':
              // Check for expanded content
              if (element.tagName === 'DETAILS') {
                return element.open;
              }
              const content = element.querySelector('.content, .panel, [role="tabpanel"]');
              return content && getComputedStyle(content).display !== 'none';
              
            case 'menu':
              // Check if submenu is visible
              const submenu = element.querySelector('ul, .submenu');
              return submenu && getComputedStyle(submenu).display !== 'none';
              
            default:
              // Generic check for aria-expanded
              return element.getAttribute('aria-expanded') === 'true';
          }
        })()
      `);

    } catch (error) {
      console.error(`Failed to verify component expansion: ${error}`);
      return false;
    }
  }

  private async getExpandedElements(component: UIComponent): Promise<string[]> {
    try {
      return await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const element = document.querySelector('${component.selector}');
          if (!element) return [];
          
          const expandedElements = [];
          
          // Find newly visible focusable elements within the component
          const focusableSelectors = [
            'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
            '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]'
          ];
          
          focusableSelectors.forEach(selector => {
            element.querySelectorAll(selector).forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                expandedElements.push(el.id ? '#' + el.id : el.tagName.toLowerCase());
              }
            });
          });
          
          return expandedElements;
        })()
      `);

    } catch (error) {
      console.error(`Failed to get expanded elements: ${error}`);
      return [];
    }
  }

  private async analyzeComponentAccessibility(component: UIComponent): Promise<ComponentAccessibilityIssue[]> {
    const issues: ComponentAccessibilityIssue[] = [];

    try {
      const analysis = await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const element = document.querySelector('${component.selector}');
          if (!element) return { issues: [] };
          
          const issues = [];
          
          // Check for ARIA attributes
          if (!element.hasAttribute('aria-expanded') && '${component.type}' !== 'modal') {
            issues.push({
              type: 'missing-aria',
              severity: 'major',
              description: 'Component lacks aria-expanded attribute',
              element: '${component.selector}',
              recommendation: 'Add aria-expanded attribute to indicate component state'
            });
          }
          
          // Check for keyboard accessibility
          if (element.tabIndex < 0 && !element.querySelector('[tabindex]:not([tabindex="-1"])')) {
            issues.push({
              type: 'keyboard-inaccessible',
              severity: 'critical',
              description: 'Component is not keyboard accessible',
              element: '${component.selector}',
              recommendation: 'Add tabindex="0" or ensure focusable child elements exist'
            });
          }
          
          // Check for focus indicators
          const computedStyle = getComputedStyle(element);
          if (computedStyle.outline === 'none' && computedStyle.boxShadow === 'none') {
            issues.push({
              type: 'no-focus-indicator',
              severity: 'major',
              description: 'Component lacks visible focus indicator',
              element: '${component.selector}',
              recommendation: 'Add CSS outline or box-shadow for focus state'
            });
          }
          
          return { issues };
        })()
      `);

      issues.push(...analysis.issues);

    } catch (error) {
      console.error(`Failed to analyze component accessibility: ${error}`);
    }

    return issues;
  }

  private async collapseComponent(component: UIComponent): Promise<boolean> {
    if (!component.isExpanded) {
      return true; // Already collapsed
    }

    try {
      // Try the same method used for expansion
      switch (component.expandMethod) {
        case 'click':
          const clickResult = await this.mouseSimulator.simulateMouseClick({
            type: 'selector',
            value: component.triggerSelector || component.selector
          });
          return clickResult.success;

        case 'keyboard':
          await this.cdpInterface.setFocus(this.currentSession!.sessionId, component.selector);
          await this.cdpInterface.simulateKeyPress(this.currentSession!.sessionId, 'Escape');
          return true;

        case 'hover':
          // Move mouse away from component
          await this.cdpInterface.simulateMouseMove(this.currentSession!.sessionId, 0, 0);
          return true;

        default:
          return true;
      }

    } catch (error) {
      console.error(`Failed to collapse component: ${error}`);
      return false;
    }
  }

  private async testExpandedComponentAccessibility(component: UIComponent, expansionResult: ComponentExpansionResult): Promise<void> {
    console.log(`Testing accessibility of expanded component: ${component.selector}`);

    // Test keyboard navigation within the expanded component
    for (const elementSelector of expansionResult.expandedElements) {
      try {
        // Focus each element and verify it's accessible
        const focused = await this.cdpInterface.setFocus(this.currentSession!.sessionId, elementSelector);
        if (focused) {
          // Capture focus state for analysis
          const focusState = await this.cdpInterface.getCurrentFocus(this.currentSession!.sessionId);
          if (focusState && !focusState.focusRingVisible) {
            expansionResult.accessibilityIssues.push({
              type: 'no-focus-indicator',
              severity: 'major',
              description: `Element ${elementSelector} lacks visible focus indicator`,
              element: elementSelector,
              recommendation: 'Add CSS outline or box-shadow for focus state'
            });
          }
        }
      } catch (error) {
        console.error(`Failed to test element accessibility: ${elementSelector}`, error);
      }
    }
  }

  // Focus trap detection is now handled by the dedicated FocusTrapDetector class
  // See detectFocusTraps() method above which uses the FocusTrapDetector

  // Analysis and verification methods

  private async analyzeFocusVisibility(target?: string): Promise<ActionResult> {
    try {
      const analysis = await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const elements = ${target ? `[document.querySelector('${target}')]` : 'document.querySelectorAll("a, button, input, select, textarea, [tabindex]:not([tabindex=\\"-1\\"])")'};
          const results = [];
          
          elements.forEach(el => {
            if (el) {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              
              results.push({
                selector: el.id ? '#' + el.id : el.tagName.toLowerCase(),
                visible: rect.width > 0 && rect.height > 0,
                focusVisible: style.outline !== 'none' || style.boxShadow !== 'none',
                tabIndex: el.tabIndex,
                hasAriaLabel: el.hasAttribute('aria-label'),
                hasAriaDescribedBy: el.hasAttribute('aria-describedby')
              });
            }
          });
          
          return results;
        })()
      `);

      return {
        success: true,
        duration: 0,
        output: analysis
      };

    } catch (error) {
      return {
        success: false,
        duration: 0,
        error: {
          code: 'ANALYSIS_ERROR',
          message: 'Failed to analyze focus visibility',
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          context: { 
            component: 'action-engine',
            action: 'analyze-focus-visibility',
            target 
          },
          recoverable: true,
          retryable: true
        }
      };
    }
  }

  private async analyzeComponentStructure(target?: string): Promise<ActionResult> {
    try {
      const structure = await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const element = ${target ? `document.querySelector('${target}')` : 'document.body'};
          if (!element) return null;
          
          function analyzeElement(el) {
            return {
              tagName: el.tagName,
              id: el.id,
              className: el.className,
              role: el.getAttribute('role'),
              ariaLabel: el.getAttribute('aria-label'),
              ariaExpanded: el.getAttribute('aria-expanded'),
              tabIndex: el.tabIndex,
              childCount: el.children.length,
              focusable: el.tabIndex >= 0 || ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
            };
          }
          
          return analyzeElement(element);
        })()
      `);

      return {
        success: true,
        duration: 0,
        output: structure
      };

    } catch (error) {
      return {
        success: false,
        duration: 0,
        error: {
          code: 'ANALYSIS_ERROR',
          message: 'Failed to analyze component structure',
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          context: { 
            component: 'action-engine',
            action: 'analyze-component-structure',
            target 
          },
          recoverable: true,
          retryable: true
        }
      };
    }
  }

  private async performGeneralAnalysis(target?: string): Promise<ActionResult> {
    try {
      const analysis = await Promise.all([
        this.analyzeFocusVisibility(target),
        this.analyzeComponentStructure(target)
      ]);

      return {
        success: analysis.every(a => a.success),
        duration: 0,
        output: {
          focusVisibility: analysis[0].output,
          componentStructure: analysis[1].output
        }
      };

    } catch (error) {
      return {
        success: false,
        duration: 0,
        error: {
          code: 'ANALYSIS_ERROR',
          message: 'Failed to perform general analysis',
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          context: { 
            component: 'action-engine',
            action: 'perform-general-analysis',
            target 
          },
          recoverable: true,
          retryable: true
        }
      };
    }
  }

  private async verifyFocusVisibility(): Promise<ActionResult> {
    try {
      const currentFocus = await this.cdpInterface.getCurrentFocus(this.currentSession!.sessionId);
      
      if (!currentFocus) {
        return {
          success: false,
          duration: 0,
          output: { message: 'No element currently has focus' }
        };
      }

      return {
        success: currentFocus.focusRingVisible,
        duration: 0,
        output: {
          element: currentFocus.elementSelector,
          focusVisible: currentFocus.focusRingVisible,
          isVisible: currentFocus.isVisible,
          boundingRect: currentFocus.boundingRect
        }
      };

    } catch (error) {
      return {
        success: false,
        duration: 0,
        error: {
          code: 'VERIFICATION_ERROR',
          message: 'Failed to verify focus visibility',
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          context: {
            component: 'action-engine',
            action: 'verify-focus-visibility'
          },
          recoverable: true,
          retryable: true
        }
      };
    }
  }

  private async verifyKeyboardAccessibility(): Promise<ActionResult> {
    try {
      // Test basic keyboard navigation
      const navigationResult = await this.keyboardSimulator.simulateTabForward();
      
      return {
        success: navigationResult.success && navigationResult.focusChanged,
        duration: 0,
        output: {
          navigationWorking: navigationResult.success,
          focusChanged: navigationResult.focusChanged,
          previousFocus: navigationResult.previousFocus?.elementSelector,
          currentFocus: navigationResult.currentFocus?.elementSelector
        }
      };

    } catch (error) {
      return {
        success: false,
        duration: 0,
        error: {
          code: 'VERIFICATION_ERROR',
          message: 'Failed to verify keyboard accessibility',
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          context: {
            component: 'action-engine',
            action: 'verify-keyboard-accessibility'
          },
          recoverable: true,
          retryable: true
        }
      };
    }
  }

  private async performGeneralVerification(): Promise<ActionResult> {
    try {
      const verifications = await Promise.all([
        this.verifyFocusVisibility(),
        this.verifyKeyboardAccessibility()
      ]);

      return {
        success: verifications.every(v => v.success),
        duration: 0,
        output: {
          focusVisibility: verifications[0].output,
          keyboardAccessibility: verifications[1].output
        }
      };

    } catch (error) {
      return {
        success: false,
        duration: 0,
        error: {
          code: 'VERIFICATION_ERROR',
          message: 'Failed to perform general verification',
          details: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          context: {
            component: 'action-engine',
            action: 'perform-general-verification'
          },
          recoverable: true,
          retryable: true
        }
      };
    }
  }
}

/**
 * Factory function to create Action Engine
 */
export function createActionEngine(
  cdpInterface: CDPInterface,
  keyboardSimulator: KeyboardInteractionSimulator,
  mouseSimulator: MouseTouchInteractionSimulator
): ActionEngine {
  return new ActionEngine(cdpInterface, keyboardSimulator, mouseSimulator);
}

/**
 * Action Engine utilities
 */
export class ActionEngineUtils {
  /**
   * Create standard action patterns for testing
   */
  static createStandardActions(): Action[] {
    return [
      {
        type: 'analyze',
        parameters: { analysisType: 'focus-visibility' },
        description: 'Analyze focus visibility of all elements',
        estimatedDuration: 1000
      },
      {
        type: 'keyboard',
        parameters: { key: 'Tab', direction: 'forward' },
        description: 'Navigate forward with Tab key',
        estimatedDuration: 500
      },
      {
        type: 'verify',
        parameters: { criteria: 'keyboard-accessible' },
        description: 'Verify keyboard accessibility',
        estimatedDuration: 800
      },
      {
        type: 'expand-component',
        description: 'Expand all detected UI components',
        estimatedDuration: 2000
      }
    ];
  }

  /**
   * Validate action parameters
   */
  static validateAction(action: Action): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!action.type) {
      errors.push('Action type is required');
    }

    if (!action.description) {
      errors.push('Action description is required');
    }

    if (action.estimatedDuration <= 0) {
      errors.push('Estimated duration must be positive');
    }

    // Type-specific validation
    switch (action.type) {
      case 'focus':
      case 'expand-component':
        if (!action.target) {
          errors.push(`${action.type} action requires a target selector`);
        }
        break;
      
      case 'keyboard':
        if (!action.parameters?.key) {
          errors.push('Keyboard action requires a key parameter');
        }
        break;
      
      case 'mouse':
        if (!action.target && (!action.parameters?.x || !action.parameters?.y)) {
          errors.push('Mouse action requires either target selector or coordinates');
        }
        break;
      
      case 'inject-css':
        if (!action.parameters?.css) {
          errors.push('Inject CSS action requires css parameter');
        }
        break;
      
      case 'navigate':
        if (!action.parameters?.url && !action.parameters?.direction) {
          errors.push('Navigate action requires either url or direction parameter');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Estimate action execution time based on type and complexity
   */
  static estimateActionDuration(action: Action): number {
    const baseDurations: Record<ActionType, number> = {
      'analyze': 1000,
      'keyboard': 300,
      'mouse': 200,
      'focus': 100,
      'verify': 500,
      'expand-component': 1500,
      'navigate': 2000,
      'inject-css': 300,
      'capture-screenshot': 800
    };

    let duration = baseDurations[action.type] || 1000;

    // Adjust based on complexity
    if (action.parameters) {
      const paramCount = Object.keys(action.parameters).length;
      duration += paramCount * 50;
    }

    return duration;
  }
}