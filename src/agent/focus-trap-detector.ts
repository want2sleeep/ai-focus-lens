// Focus Trap Detector for Accessibility Testing Agent
// Implements comprehensive focus trap detection and reporting
// Requirements: 需求 1.5 - 检测"按 Tab 无反应"模式，记录焦点陷阱行为，生成焦点陷阱报告

import { CDPInterface, CDPSession, FocusState } from './cdp-interface';
import { KeyboardInteractionSimulator, FocusNavigationResult } from './keyboard-interaction';

/**
 * Types of focus traps that can be detected
 */
export type FocusTrapType = 
  | 'infinite-loop'     // Focus cycles between same elements indefinitely
  | 'no-escape'         // Focus cannot leave a specific area
  | 'skip-content'      // Focus skips over important content
  | 'modal-trap'        // Modal dialog traps focus without escape
  | 'keyboard-trap'     // Keyboard navigation is completely blocked
  | 'partial-trap';     // Some elements are unreachable via keyboard

/**
 * Focus trap detection result
 */
export interface FocusTrapDetectionResult {
  trapFound: boolean;
  trapType: FocusTrapType;
  severity: 'critical' | 'major' | 'minor';
  startElement: string;
  endElement: string;
  trapSequence: FocusTraceElement[];
  description: string;
  wcagViolations: string[];
  escapeMethod?: string;
  affectedElements: string[];
  detectionMethod: string;
  confidence: number; // 0-1 scale
}

/**
 * Focus trace element for detailed analysis
 */
export interface FocusTraceElement {
  selector: string;
  timestamp: number;
  tabIndex: number;
  isVisible: boolean;
  focusRingVisible: boolean;
  visitCount: number;
  keyPressed: string;
  navigationSuccess: boolean;
}

/**
 * Focus trap report containing all detected traps
 */
export interface FocusTrapReport {
  pageUrl: string;
  scanTimestamp: number;
  totalTraps: number;
  criticalTraps: number;
  majorTraps: number;
  minorTraps: number;
  traps: FocusTrapDetectionResult[];
  overallScore: number; // 0-100, higher is better
  recommendations: string[];
  testDuration: number;
}

/**
 * Configuration for focus trap detection
 */
export interface FocusTrapDetectionConfig {
  maxTabPresses: number;
  maxLoopDetection: number;
  timeoutMs: number;
  includeModalTests: boolean;
  includeComponentTests: boolean;
  skipHiddenElements: boolean;
  detectionSensitivity: 'low' | 'medium' | 'high';
}

/**
 * Focus Trap Detector Implementation
 * Requirements: 需求 1.5 - 检测"按 Tab 无反应"模式，记录焦点陷阱行为
 */
export class FocusTrapDetector {
  private cdpInterface: CDPInterface;
  private keyboardSimulator: KeyboardInteractionSimulator;
  private currentSession: CDPSession | null = null;
  private config: FocusTrapDetectionConfig;
  private focusTrace: FocusTraceElement[] = [];
  private elementVisitCount: Map<string, number> = new Map();

  constructor(
    cdpInterface: CDPInterface,
    keyboardSimulator: KeyboardInteractionSimulator,
    config?: Partial<FocusTrapDetectionConfig>
  ) {
    this.cdpInterface = cdpInterface;
    this.keyboardSimulator = keyboardSimulator;
    this.config = {
      maxTabPresses: 100,
      maxLoopDetection: 5,
      timeoutMs: 30000,
      includeModalTests: true,
      includeComponentTests: true,
      skipHiddenElements: true,
      detectionSensitivity: 'medium',
      ...config
    };
  }

  /**
   * Initialize the focus trap detector
   */
  async initialize(tabId: number): Promise<boolean> {
    try {
      this.currentSession = await this.cdpInterface.connect(tabId);
      
      await Promise.all([
        this.cdpInterface.enableRuntime(this.currentSession.sessionId),
        this.cdpInterface.enableDOM(this.currentSession.sessionId),
        this.cdpInterface.enableInput(this.currentSession.sessionId)
      ]);

      console.log(`Focus Trap Detector initialized for tab ${tabId}`);
      return true;

    } catch (error) {
      console.error('Failed to initialize Focus Trap Detector:', error);
      return false;
    }
  }

  /**
   * Perform comprehensive focus trap detection
   * Requirements: 需求 1.5 - 检测"按 Tab 无反应"模式
   */
  async detectFocusTraps(): Promise<FocusTrapReport> {
    if (!this.currentSession) {
      throw new Error('Focus Trap Detector not initialized');
    }

    const startTime = Date.now();
    const traps: FocusTrapDetectionResult[] = [];

    try {
      console.log('Starting comprehensive focus trap detection...');

      // Reset detection state
      this.resetDetectionState();

      // Get page URL for report
      const pageUrl = await this.getCurrentPageUrl();

      // Method 1: Sequential tab navigation analysis
      console.log('Running sequential tab navigation analysis...');
      const sequentialTraps = await this.detectSequentialNavigationTraps();
      traps.push(...sequentialTraps);

      // Method 2: Modal and dialog trap detection
      if (this.config.includeModalTests) {
        console.log('Running modal trap detection...');
        const modalTraps = await this.detectModalFocusTraps();
        traps.push(...modalTraps);
      }

      // Method 3: Component-specific trap detection
      if (this.config.includeComponentTests) {
        console.log('Running component trap detection...');
        const componentTraps = await this.detectComponentFocusTraps();
        traps.push(...componentTraps);
      }

      // Method 4: Reverse navigation trap detection
      console.log('Running reverse navigation analysis...');
      const reverseTraps = await this.detectReverseNavigationTraps();
      traps.push(...reverseTraps);

      // Method 5: Keyboard accessibility coverage analysis
      console.log('Running keyboard accessibility coverage analysis...');
      const coverageTraps = await this.detectKeyboardAccessibilityCoverage();
      traps.push(...coverageTraps);

      // Generate comprehensive report
      const report = this.generateFocusTrapReport(pageUrl, traps, Date.now() - startTime);
      
      console.log(`Focus trap detection completed. Found ${traps.length} traps in ${Date.now() - startTime}ms`);
      return report;

    } catch (error) {
      console.error('Focus trap detection failed:', error);
      
      // Return error report
      return {
        pageUrl: await this.getCurrentPageUrl(),
        scanTimestamp: Date.now(),
        totalTraps: 0,
        criticalTraps: 0,
        majorTraps: 0,
        minorTraps: 0,
        traps: [],
        overallScore: 0,
        recommendations: [`Detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        testDuration: Date.now() - startTime
      };
    }
  }

  /**
   * Detect focus traps through sequential tab navigation
   * Requirements: 需求 1.5 - 检测"按 Tab 无反应"模式
   */
  private async detectSequentialNavigationTraps(): Promise<FocusTrapDetectionResult[]> {
    const traps: FocusTrapDetectionResult[] = [];
    
    try {
      // Reset focus to beginning of page
      await this.resetFocusToStart();
      
      let consecutiveFailures = 0;
      let lastFocusedElement: string | null = null;
      
      for (let i = 0; i < this.config.maxTabPresses; i++) {
        const navigationResult = await this.keyboardSimulator.simulateTabForward();
        
        if (navigationResult.success && navigationResult.currentFocus?.elementSelector) {
          const currentElement = navigationResult.currentFocus.elementSelector;
          
          // Record focus trace
          this.recordFocusTrace(currentElement, 'Tab', navigationResult);
          
          // Check for infinite loop
          const loopTrap = this.checkForInfiniteLoop(currentElement);
          if (loopTrap) {
            traps.push(loopTrap);
            break;
          }
          
          // Check for no-escape pattern
          const noEscapeTrap = this.checkForNoEscapePattern(currentElement);
          if (noEscapeTrap) {
            traps.push(noEscapeTrap);
            break;
          }
          
          lastFocusedElement = currentElement;
          consecutiveFailures = 0;
          
        } else {
          consecutiveFailures++;
          
          // If navigation fails multiple times, might be a keyboard trap
          if (consecutiveFailures >= 5) {
            traps.push({
              trapFound: true,
              trapType: 'keyboard-trap',
              severity: 'critical',
              startElement: lastFocusedElement || 'unknown',
              endElement: lastFocusedElement || 'unknown',
              trapSequence: this.focusTrace.slice(-5),
              description: 'Keyboard navigation completely blocked - Tab key has no effect',
              wcagViolations: ['2.1.1', '2.4.3'],
              affectedElements: [lastFocusedElement || 'unknown'],
              detectionMethod: 'sequential-navigation',
              confidence: 0.9
            });
            break;
          }
        }
        
        // Small delay between tab presses
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
    } catch (error) {
      console.error('Sequential navigation trap detection failed:', error);
    }
    
    return traps;
  }

  /**
   * Detect modal-specific focus traps
   */
  private async detectModalFocusTraps(): Promise<FocusTrapDetectionResult[]> {
    const traps: FocusTrapDetectionResult[] = [];
    
    try {
      // Find all modal elements
      const modals = await this.findModalElements();
      
      for (const modal of modals) {
        const modalTrap = await this.testModalFocusTrap(modal);
        if (modalTrap) {
          traps.push(modalTrap);
        }
      }
      
    } catch (error) {
      console.error('Modal focus trap detection failed:', error);
    }
    
    return traps;
  }

  /**
   * Detect component-specific focus traps
   */
  private async detectComponentFocusTraps(): Promise<FocusTrapDetectionResult[]> {
    const traps: FocusTrapDetectionResult[] = [];
    
    try {
      // Find expandable components
      const components = await this.findExpandableComponents();
      
      for (const component of components) {
        const componentTrap = await this.testComponentFocusTrap(component);
        if (componentTrap) {
          traps.push(componentTrap);
        }
      }
      
    } catch (error) {
      console.error('Component focus trap detection failed:', error);
    }
    
    return traps;
  }

  /**
   * Detect traps in reverse navigation (Shift+Tab)
   */
  private async detectReverseNavigationTraps(): Promise<FocusTrapDetectionResult[]> {
    const traps: FocusTrapDetectionResult[] = [];
    
    try {
      // Start from end of page
      await this.focusLastElement();
      
      let consecutiveFailures = 0;
      let lastFocusedElement: string | null = null;
      
      for (let i = 0; i < Math.min(this.config.maxTabPresses, 20); i++) {
        const navigationResult = await this.keyboardSimulator.simulateTabBackward();
        
        if (navigationResult.success && navigationResult.currentFocus?.elementSelector) {
          const currentElement = navigationResult.currentFocus.elementSelector;
          
          // Record reverse navigation trace
          this.recordFocusTrace(currentElement, 'Shift+Tab', navigationResult);
          
          lastFocusedElement = currentElement;
          consecutiveFailures = 0;
          
        } else {
          consecutiveFailures++;
          
          if (consecutiveFailures >= 3) {
            traps.push({
              trapFound: true,
              trapType: 'partial-trap',
              severity: 'major',
              startElement: lastFocusedElement || 'unknown',
              endElement: lastFocusedElement || 'unknown',
              trapSequence: this.focusTrace.slice(-3),
              description: 'Reverse navigation (Shift+Tab) blocked or inconsistent',
              wcagViolations: ['2.1.1', '2.4.3'],
              affectedElements: [lastFocusedElement || 'unknown'],
              detectionMethod: 'reverse-navigation',
              confidence: 0.8
            });
            break;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
    } catch (error) {
      console.error('Reverse navigation trap detection failed:', error);
    }
    
    return traps;
  }

  /**
   * Detect keyboard accessibility coverage issues
   */
  private async detectKeyboardAccessibilityCoverage(): Promise<FocusTrapDetectionResult[]> {
    const traps: FocusTrapDetectionResult[] = [];
    
    try {
      // Get all interactive elements
      const interactiveElements = await this.findAllInteractiveElements();
      
      // Get elements that were actually focused during navigation
      const focusedElements = new Set(this.focusTrace.map(trace => trace.selector));
      
      // Find elements that are interactive but never received focus
      const unreachableElements = interactiveElements.filter(
        element => !focusedElements.has(element.selector)
      );
      
      if (unreachableElements.length > 0) {
        traps.push({
          trapFound: true,
          trapType: 'skip-content',
          severity: unreachableElements.length > 5 ? 'critical' : 'major',
          startElement: 'page-start',
          endElement: 'page-end',
          trapSequence: [],
          description: `${unreachableElements.length} interactive elements are not reachable via keyboard navigation`,
          wcagViolations: ['2.1.1', '2.4.3'],
          affectedElements: unreachableElements.map(el => el.selector),
          detectionMethod: 'coverage-analysis',
          confidence: 0.95
        });
      }
      
    } catch (error) {
      console.error('Keyboard accessibility coverage detection failed:', error);
    }
    
    return traps;
  }

  // Helper methods for focus trap detection

  private resetDetectionState(): void {
    this.focusTrace = [];
    this.elementVisitCount.clear();
  }

  private recordFocusTrace(selector: string, keyPressed: string, navigationResult: any): void {
    const visitCount = (this.elementVisitCount.get(selector) || 0) + 1;
    this.elementVisitCount.set(selector, visitCount);
    
    const focus = navigationResult.currentFocus || navigationResult.endFocus;
    
    this.focusTrace.push({
      selector,
      timestamp: Date.now(),
      tabIndex: focus?.tabIndex || -1,
      isVisible: focus?.isVisible || false,
      focusRingVisible: focus?.focusRingVisible || false,
      visitCount,
      keyPressed,
      navigationSuccess: navigationResult.success
    });
  }

  private checkForInfiniteLoop(currentElement: string): FocusTrapDetectionResult | null {
    const visitCount = this.elementVisitCount.get(currentElement) || 0;
    
    if (visitCount > this.config.maxLoopDetection) {
      const loopStart = this.focusTrace.findIndex(trace => trace.selector === currentElement);
      const loopSequence = this.focusTrace.slice(loopStart);
      
      return {
        trapFound: true,
        trapType: 'infinite-loop',
        severity: 'critical',
        startElement: currentElement,
        endElement: currentElement,
        trapSequence: loopSequence,
        description: `Focus trapped in infinite loop at ${currentElement} (visited ${visitCount} times)`,
        wcagViolations: ['2.1.1', '2.4.3'],
        escapeMethod: 'Escape key or alternative navigation method needed',
        affectedElements: [currentElement],
        detectionMethod: 'loop-detection',
        confidence: 0.95
      };
    }
    
    return null;
  }

  private checkForNoEscapePattern(currentElement: string): FocusTrapDetectionResult | null {
    // Check if focus has been stuck on the same element for multiple consecutive attempts
    const recentTrace = this.focusTrace.slice(-5);
    const allSameElement = recentTrace.length >= 5 && 
                          recentTrace.every(trace => trace.selector === currentElement);
    
    if (allSameElement) {
      return {
        trapFound: true,
        trapType: 'no-escape',
        severity: 'critical',
        startElement: currentElement,
        endElement: currentElement,
        trapSequence: recentTrace,
        description: `Focus cannot escape from ${currentElement} - Tab key has no effect`,
        wcagViolations: ['2.1.1', '2.4.3'],
        escapeMethod: 'Alternative navigation method required',
        affectedElements: [currentElement],
        detectionMethod: 'no-escape-detection',
        confidence: 0.9
      };
    }
    
    return null;
  }

  private async testModalFocusTrap(modal: any): Promise<FocusTrapDetectionResult | null> {
    try {
      // Focus the modal
      await this.cdpInterface.setFocus(this.currentSession!.sessionId, modal.selector);
      
      // Try to escape with Escape key
      await this.cdpInterface.simulateKeyPress(this.currentSession!.sessionId, 'Escape');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check if modal is still visible and focused
      const stillTrapped = await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const modal = document.querySelector('${modal.selector}');
          const activeElement = document.activeElement;
          
          return {
            modalVisible: modal && getComputedStyle(modal).display !== 'none',
            focusStillInModal: modal && activeElement && modal.contains(activeElement),
            hasCloseButton: modal && !!modal.querySelector('[aria-label*="close"], .close, .modal-close, [data-dismiss]'),
            hasEscapeHandler: modal && (modal.hasAttribute('data-keyboard') || modal.hasAttribute('data-escape'))
          };
        })()
      `);
      
      if (stillTrapped.modalVisible && stillTrapped.focusStillInModal && !stillTrapped.hasEscapeHandler) {
        return {
          trapFound: true,
          trapType: 'modal-trap',
          severity: stillTrapped.hasCloseButton ? 'major' : 'critical',
          startElement: modal.selector,
          endElement: modal.selector,
          trapSequence: [{
            selector: modal.selector,
            timestamp: Date.now(),
            tabIndex: 0,
            isVisible: true,
            focusRingVisible: false,
            visitCount: 1,
            keyPressed: 'Escape',
            navigationSuccess: false
          }],
          description: `Modal ${modal.selector} traps focus without proper escape mechanism`,
          wcagViolations: ['2.1.2', '2.4.3'],
          escapeMethod: stillTrapped.hasCloseButton ? 'Close button available but Escape key not supported' : 'No escape method found',
          affectedElements: [modal.selector],
          detectionMethod: 'modal-escape-test',
          confidence: 0.9
        };
      }
      
      return null;
      
    } catch (error) {
      console.error(`Failed to test modal focus trap: ${error}`);
      return null;
    }
  }

  private async testComponentFocusTrap(component: any): Promise<FocusTrapDetectionResult | null> {
    try {
      // Focus the component
      await this.cdpInterface.setFocus(this.currentSession!.sessionId, component.selector);
      
      const initialFocus = await this.cdpInterface.getCurrentFocus(this.currentSession!.sessionId);
      let trapDetected = false;
      let consecutiveSameElement = 0;
      
      // Try to navigate out of the component
      for (let i = 0; i < 10; i++) {
        const navigationResult = await this.keyboardSimulator.simulateTabForward();
        
        if (navigationResult.success && navigationResult.currentFocus?.elementSelector) {
          const currentElement = navigationResult.currentFocus.elementSelector;
          
          // Check if still in component
          const stillInComponent = await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
            (function() {
              const component = document.querySelector('${component.selector}');
              const focusedElement = document.querySelector('${currentElement}');
              return component && focusedElement && component.contains(focusedElement);
            })()
          `);
          
          if (!stillInComponent) {
            // Successfully escaped
            return null;
          }
          
          // Check for same element focus
          if (initialFocus?.elementSelector === currentElement) {
            consecutiveSameElement++;
            if (consecutiveSameElement >= 3) {
              trapDetected = true;
              break;
            }
          } else {
            consecutiveSameElement = 0;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      if (trapDetected) {
        return {
          trapFound: true,
          trapType: 'skip-content',
          severity: 'major',
          startElement: component.selector,
          endElement: component.selector,
          trapSequence: this.focusTrace.slice(-10),
          description: `Component ${component.selector} may trap focus or cause navigation issues`,
          wcagViolations: ['2.1.1', '2.4.3'],
          escapeMethod: 'Alternative navigation method may be needed',
          affectedElements: [component.selector],
          detectionMethod: 'component-navigation-test',
          confidence: 0.7
        };
      }
      
      return null;
      
    } catch (error) {
      console.error(`Failed to test component focus trap: ${error}`);
      return null;
    }
  }

  // Utility methods

  private async getCurrentPageUrl(): Promise<string> {
    try {
      return await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, 'window.location.href');
    } catch (error) {
      return 'unknown';
    }
  }

  private async resetFocusToStart(): Promise<void> {
    try {
      await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          // Remove focus from current element
          if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
          }
          
          // Focus the first focusable element or body
          const focusableElements = document.querySelectorAll(
            'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          } else {
            document.body.focus();
          }
        })()
      `);
    } catch (error) {
      console.error('Failed to reset focus to start:', error);
    }
  }

  private async focusLastElement(): Promise<void> {
    try {
      await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const focusableElements = document.querySelectorAll(
            'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          
          if (focusableElements.length > 0) {
            focusableElements[focusableElements.length - 1].focus();
          }
        })()
      `);
    } catch (error) {
      console.error('Failed to focus last element:', error);
    }
  }

  private async findModalElements(): Promise<any[]> {
    try {
      return await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const modals = [];
          document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"], .popup').forEach(modal => {
            const rect = modal.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && getComputedStyle(modal).display !== 'none';
            
            if (isVisible) {
              modals.push({
                selector: modal.id ? '#' + modal.id : modal.tagName.toLowerCase() + (modal.className ? '.' + modal.className.split(' ')[0] : ''),
                hasCloseButton: !!modal.querySelector('[aria-label*="close"], .close, .modal-close'),
                hasEscapeHandler: modal.hasAttribute('data-keyboard') || modal.hasAttribute('data-escape')
              });
            }
          });
          
          return modals;
        })()
      `);
    } catch (error) {
      console.error('Failed to find modal elements:', error);
      return [];
    }
  }

  private async findExpandableComponents(): Promise<any[]> {
    try {
      return await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const components = [];
          
          // Find dropdowns, accordions, and other expandable components
          document.querySelectorAll('[aria-expanded], .dropdown, .accordion, details').forEach(component => {
            const rect = component.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              components.push({
                selector: component.id ? '#' + component.id : component.tagName.toLowerCase() + (component.className ? '.' + component.className.split(' ')[0] : ''),
                type: component.tagName === 'DETAILS' ? 'details' : 'component',
                isExpanded: component.getAttribute('aria-expanded') === 'true' || component.open
              });
            }
          });
          
          return components;
        })()
      `);
    } catch (error) {
      console.error('Failed to find expandable components:', error);
      return [];
    }
  }

  private async findAllInteractiveElements(): Promise<any[]> {
    try {
      return await this.cdpInterface.evaluateExpression(this.currentSession!.sessionId, `
        (function() {
          const elements = [];
          const selectors = [
            'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
            '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]',
            '[onclick]', '[onkeydown]', '[onkeyup]'
          ];
          
          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                elements.push({
                  selector: el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
                  tagName: el.tagName,
                  tabIndex: el.tabIndex,
                  visible: true
                });
              }
            });
          });
          
          return elements;
        })()
      `);
    } catch (error) {
      console.error('Failed to find interactive elements:', error);
      return [];
    }
  }

  private generateFocusTrapReport(pageUrl: string, traps: FocusTrapDetectionResult[], testDuration: number): FocusTrapReport {
    const criticalTraps = traps.filter(trap => trap.severity === 'critical').length;
    const majorTraps = traps.filter(trap => trap.severity === 'major').length;
    const minorTraps = traps.filter(trap => trap.severity === 'minor').length;
    
    // Calculate overall score (0-100, higher is better)
    let score = 100;
    score -= criticalTraps * 30;
    score -= majorTraps * 15;
    score -= minorTraps * 5;
    score = Math.max(0, score);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(traps);
    
    return {
      pageUrl,
      scanTimestamp: Date.now(),
      totalTraps: traps.length,
      criticalTraps,
      majorTraps,
      minorTraps,
      traps,
      overallScore: score,
      recommendations,
      testDuration
    };
  }

  private generateRecommendations(traps: FocusTrapDetectionResult[]): string[] {
    const recommendations: string[] = [];
    
    if (traps.some(trap => trap.trapType === 'infinite-loop')) {
      recommendations.push('Fix infinite focus loops by implementing proper focus management');
    }
    
    if (traps.some(trap => trap.trapType === 'modal-trap')) {
      recommendations.push('Ensure modals can be closed with Escape key and have proper focus management');
    }
    
    if (traps.some(trap => trap.trapType === 'keyboard-trap')) {
      recommendations.push('Implement keyboard event handlers for all interactive elements');
    }
    
    if (traps.some(trap => trap.trapType === 'skip-content')) {
      recommendations.push('Ensure all interactive content is reachable via keyboard navigation');
    }
    
    if (traps.some(trap => trap.trapType === 'no-escape')) {
      recommendations.push('Provide escape mechanisms for all focus containers');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('No focus traps detected - good keyboard accessibility!');
    }
    
    return recommendations;
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    if (this.currentSession) {
      try {
        await this.cdpInterface.disconnect(this.currentSession.sessionId);
        this.currentSession = null;
        this.resetDetectionState();
        console.log('Focus Trap Detector cleaned up');
      } catch (error) {
        console.error('Failed to cleanup Focus Trap Detector:', error);
      }
    }
  }
}

/**
 * Factory function to create Focus Trap Detector
 */
export function createFocusTrapDetector(
  cdpInterface: CDPInterface,
  keyboardSimulator: KeyboardInteractionSimulator,
  config?: Partial<FocusTrapDetectionConfig>
): FocusTrapDetector {
  return new FocusTrapDetector(cdpInterface, keyboardSimulator, config);
}

/**
 * Focus Trap Detector utilities
 */
export class FocusTrapDetectorUtils {
  /**
   * Analyze focus trap severity
   */
  static analyzeTrapSeverity(trap: FocusTrapDetectionResult): string {
    switch (trap.severity) {
      case 'critical':
        return 'Critical: Completely blocks keyboard navigation';
      case 'major':
        return 'Major: Significantly impairs keyboard navigation';
      case 'minor':
        return 'Minor: Minor keyboard navigation issue';
      default:
        return 'Unknown severity';
    }
  }

  /**
   * Generate WCAG compliance summary
   */
  static generateWCAGSummary(traps: FocusTrapDetectionResult[]): string[] {
    const violations = new Set<string>();
    
    traps.forEach(trap => {
      trap.wcagViolations.forEach(violation => violations.add(violation));
    });
    
    return Array.from(violations).sort();
  }

  /**
   * Create focus trap detection configuration for different sensitivity levels
   */
  static createConfig(sensitivity: 'low' | 'medium' | 'high'): FocusTrapDetectionConfig {
    const configs = {
      low: {
        maxTabPresses: 30,
        maxLoopDetection: 8,
        timeoutMs: 15000,
        includeModalTests: true,
        includeComponentTests: false,
        skipHiddenElements: true,
        detectionSensitivity: 'low' as const
      },
      medium: {
        maxTabPresses: 50,
        maxLoopDetection: 5,
        timeoutMs: 25000,
        includeModalTests: true,
        includeComponentTests: true,
        skipHiddenElements: true,
        detectionSensitivity: 'medium' as const
      },
      high: {
        maxTabPresses: 100,
        maxLoopDetection: 3,
        timeoutMs: 45000,
        includeModalTests: true,
        includeComponentTests: true,
        skipHiddenElements: false,
        detectionSensitivity: 'high' as const
      }
    };
    
    return configs[sensitivity];
  }
}