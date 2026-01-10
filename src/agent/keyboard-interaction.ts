// Keyboard Interaction Simulation for Accessibility Testing Agent
// Implements Tab navigation, focus management, and keyboard event simulation via CDP

import { CDPInterface, CDPSession, FocusState, NavigationResult, KeyModifier } from './cdp-interface';

/**
 * Keyboard navigation patterns for accessibility testing
 * Requirements: 需求 1.1 - 通过 CDP 模拟 Tab 键导航
 */
export interface KeyboardNavigationPattern {
  type: 'tab-forward' | 'tab-backward' | 'arrow-keys' | 'custom';
  steps: KeyboardStep[];
  expectedFocusPath?: string[];
  description: string;
}

export interface KeyboardStep {
  key: string;
  modifiers?: KeyModifier[];
  delay?: number; // milliseconds
  expectedResult?: 'focus-change' | 'no-change' | 'action-trigger';
}

/**
 * Focus navigation results and analysis
 */
export interface FocusNavigationResult {
  success: boolean;
  startFocus: FocusState | null;
  endFocus: FocusState | null;
  focusPath: FocusState[];
  focusTraps: FocusTrappedArea[];
  navigationTime: number;
  errors: string[];
}

export interface FocusTrappedArea {
  startSelector: string;
  endSelector: string;
  trapType: 'infinite-loop' | 'no-escape' | 'skip-content';
  description: string;
  severity: 'critical' | 'major' | 'minor';
}

/**
 * Keyboard accessibility test scenarios
 */
export interface KeyboardTestScenario {
  name: string;
  description: string;
  pattern: KeyboardNavigationPattern;
  expectedBehavior: string;
  wcagCriteria: string[];
}

/**
 * Keyboard Interaction Simulator
 * Requirements: 需求 1.1 - 实现键盘交互模拟，包括 Tab 键导航和焦点状态捕获
 */
export class KeyboardInteractionSimulator {
  private cdpInterface: CDPInterface;
  private currentSession: CDPSession | null = null;
  private focusHistory: FocusState[] = [];
  private navigationInProgress = false;

  constructor(cdpInterface: CDPInterface) {
    this.cdpInterface = cdpInterface;
  }

  /**
   * Initialize keyboard interaction simulation for a tab
   * Requirements: 需求 1.1 - 建立 CDP 连接并启用必要的域
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
        this.cdpInterface.enablePage(this.currentSession.sessionId)
      ]);

      // Set up event listeners
      this.setupEventListeners();

      console.log(`Keyboard interaction simulator initialized for tab ${tabId}`);
      return true;

    } catch (error) {
      console.error('Failed to initialize keyboard interaction simulator:', error);
      return false;
    }
  }

  /**
   * Simulate Tab key navigation (forward)
   * Requirements: 需求 1.1 - 通过 CDP 模拟真实的 Tab 键按下
   */
  async simulateTabForward(): Promise<NavigationResult> {
    if (!this.currentSession) {
      throw new Error('Keyboard simulator not initialized');
    }

    return this.cdpInterface.simulateTabNavigation(this.currentSession.sessionId, 'forward');
  }

  /**
   * Simulate Shift+Tab navigation (backward)
   * Requirements: 需求 1.1 - 实现 Shift+Tab 反向导航
   */
  async simulateTabBackward(): Promise<NavigationResult> {
    if (!this.currentSession) {
      throw new Error('Keyboard simulator not initialized');
    }

    return this.cdpInterface.simulateTabNavigation(this.currentSession.sessionId, 'backward');
  }

  /**
   * Simulate Tab navigation in a specific direction
   */
  async simulateTabNavigation(direction: 'forward' | 'backward' = 'forward'): Promise<NavigationResult> {
    if (direction === 'backward') {
      return this.simulateTabBackward();
    }
    return this.simulateTabForward();
  }

  /**
   * Execute a complete keyboard navigation pattern
   * Requirements: 需求 1.1 - 执行复杂的键盘导航模式
   */
  async executeNavigationPattern(pattern: KeyboardNavigationPattern): Promise<FocusNavigationResult> {
    if (!this.currentSession) {
      throw new Error('Keyboard simulator not initialized');
    }

    if (this.navigationInProgress) {
      throw new Error('Navigation already in progress');
    }

    this.navigationInProgress = true;
    const startTime = Date.now();
    const focusPath: FocusState[] = [];
    const errors: string[] = [];

    try {
      // Capture initial focus state
      const startFocus = await this.captureFocusState();
      if (startFocus) {
        focusPath.push(startFocus);
      }

      // Execute each step in the pattern
      for (const step of pattern.steps) {
        try {
          // Simulate the key press
          await this.cdpInterface.simulateKeyPress(
            this.currentSession.sessionId,
            step.key,
            step.modifiers || []
          );

          // Wait for the specified delay or default
          const delay = step.delay || 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          // Capture focus state after the key press
          const focusState = await this.captureFocusState();
          if (focusState) {
            focusPath.push(focusState);
          }

          // Validate expected result if specified
          if (step.expectedResult) {
            const validationResult = this.validateStepResult(step, focusPath);
            if (!validationResult.valid) {
              errors.push(validationResult.error);
            }
          }

        } catch (stepError) {
          const errorMessage = `Failed to execute step ${step.key}: ${stepError}`;
          errors.push(errorMessage);
          console.error(errorMessage);
        }
      }

      // Analyze focus path for traps and issues
      const focusTraps = this.analyzeFocusTraps(focusPath);

      const result: FocusNavigationResult = {
        success: errors.length === 0,
        startFocus: focusPath[0] || null,
        endFocus: focusPath[focusPath.length - 1] || null,
        focusPath,
        focusTraps,
        navigationTime: Date.now() - startTime,
        errors
      };

      console.log(`Navigation pattern "${pattern.type}" completed:`, result);
      return result;

    } finally {
      this.navigationInProgress = false;
    }
  }

  /**
   * Test for focus traps by attempting full page navigation
   * Requirements: 需求 1.5 - 检测焦点陷阱行为
   */
  async testForFocusTraps(maxTabPresses: number = 50): Promise<FocusTrappedArea[]> {
    if (!this.currentSession) {
      throw new Error('Keyboard simulator not initialized');
    }

    const focusPath: FocusState[] = [];
    const visitedElements = new Set<string>();
    const traps: FocusTrappedArea[] = [];

    try {
      // Start from the beginning of the page
      await this.resetFocusToStart();

      for (let i = 0; i < maxTabPresses; i++) {
        // Capture current focus
        const currentFocus = await this.captureFocusState();
        if (currentFocus && currentFocus.elementSelector) {
          focusPath.push(currentFocus);

          // Check for focus trap (element visited before)
          if (visitedElements.has(currentFocus.elementSelector)) {
            const trapStart = focusPath.findIndex(
              state => state.elementSelector === currentFocus.elementSelector
            );
            
            if (trapStart >= 0 && trapStart < focusPath.length - 1) {
              const startElement = focusPath[trapStart];
              if (startElement?.elementSelector) {
                const trap: FocusTrappedArea = {
                  startSelector: startElement.elementSelector,
                  endSelector: currentFocus.elementSelector,
                  trapType: this.determineTrapType(focusPath, trapStart),
                  description: `Focus trapped between ${startElement.elementSelector} and ${currentFocus.elementSelector}`,
                  severity: 'critical'
                };
                traps.push(trap);
                
                console.warn('Focus trap detected:', trap);
                break;
              }
            }
          }

          visitedElements.add(currentFocus.elementSelector);
        }

        // Navigate to next element
        const navigationResult = await this.simulateTabForward();
        if (!navigationResult.success || !navigationResult.focusChanged) {
          // Check if we've reached the end of focusable elements
          if (i > 5) { // Allow some initial navigation
            break;
          }
        }

        // Small delay between tab presses
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      return traps;

    } catch (error) {
      console.error('Focus trap testing failed:', error);
      return [];
    }
  }

  /**
   * Capture current focus state with enhanced information
   * Requirements: 需求 1.1 - 添加焦点状态捕获功能
   */
  async captureFocusState(): Promise<FocusState | null> {
    if (!this.currentSession) {
      return null;
    }

    try {
      const focusState = await this.cdpInterface.getCurrentFocus(this.currentSession.sessionId);
      
      if (focusState) {
        // Add to focus history
        this.focusHistory.push(focusState);
        
        // Keep history manageable
        if (this.focusHistory.length > 100) {
          this.focusHistory = this.focusHistory.slice(-50);
        }
      }

      return focusState;

    } catch (error) {
      console.error('Failed to capture focus state:', error);
      return null;
    }
  }

  /**
   * Get focus history for analysis
   */
  getFocusHistory(): FocusState[] {
    return [...this.focusHistory];
  }

  /**
   * Clear focus history
   */
  clearFocusHistory(): void {
    this.focusHistory = [];
  }

  /**
   * Test keyboard accessibility for common scenarios
   */
  async runKeyboardAccessibilityTests(): Promise<KeyboardTestResult[]> {
    const testScenarios: KeyboardTestScenario[] = [
      {
        name: 'Basic Tab Navigation',
        description: 'Test forward tab navigation through all focusable elements',
        pattern: {
          type: 'tab-forward',
          steps: Array(20).fill(0).map(() => ({ key: 'Tab', delay: 100 })),
          description: 'Navigate forward through focusable elements'
        },
        expectedBehavior: 'All focusable elements should be reachable and have visible focus indicators',
        wcagCriteria: ['2.4.7', '2.1.1']
      },
      {
        name: 'Reverse Tab Navigation',
        description: 'Test backward tab navigation',
        pattern: {
          type: 'tab-backward',
          steps: Array(10).fill(0).map(() => ({ key: 'Tab', modifiers: ['Shift'], delay: 100 })),
          description: 'Navigate backward through focusable elements'
        },
        expectedBehavior: 'Should be able to navigate backward through all elements',
        wcagCriteria: ['2.4.7', '2.1.1']
      },
      {
        name: 'Focus Trap Detection',
        description: 'Detect if focus gets trapped in any area',
        pattern: {
          type: 'custom',
          steps: Array(50).fill(0).map(() => ({ key: 'Tab', delay: 50 })),
          description: 'Extended navigation to detect focus traps'
        },
        expectedBehavior: 'Focus should not get trapped in any area',
        wcagCriteria: ['2.4.3']
      }
    ];

    const results: KeyboardTestResult[] = [];

    for (const scenario of testScenarios) {
      try {
        console.log(`Running keyboard test: ${scenario.name}`);
        
        const navigationResult = await this.executeNavigationPattern(scenario.pattern);
        
        const testResult: KeyboardTestResult = {
          scenario: scenario.name,
          description: scenario.description,
          wcagCriteria: scenario.wcagCriteria,
          passed: navigationResult.success && navigationResult.focusTraps.length === 0,
          navigationResult,
          issues: this.analyzeNavigationIssues(navigationResult, scenario),
          recommendations: this.generateRecommendations(navigationResult, scenario)
        };

        results.push(testResult);

      } catch (error) {
        const testResult: KeyboardTestResult = {
          scenario: scenario.name,
          description: scenario.description,
          wcagCriteria: scenario.wcagCriteria,
          passed: false,
          navigationResult: {
            success: false,
            startFocus: null,
            endFocus: null,
            focusPath: [],
            focusTraps: [],
            navigationTime: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error']
          },
          issues: [`Test execution failed: ${error}`],
          recommendations: ['Fix test execution environment and retry']
        };

        results.push(testResult);
      }
    }

    return results;
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    if (this.currentSession) {
      try {
        await this.cdpInterface.disconnect(this.currentSession.sessionId);
        this.currentSession = null;
        this.focusHistory = [];
        console.log('Keyboard interaction simulator cleaned up');
      } catch (error) {
        console.error('Failed to cleanup keyboard simulator:', error);
      }
    }
  }

  // Private helper methods

  private setupEventListeners(): void {
    if (!this.currentSession) return;

    // Listen for focus changes
    this.cdpInterface.onFocusChanged((sessionId, focusState) => {
      if (sessionId === this.currentSession?.sessionId) {
        console.log('Focus changed:', focusState);
      }
    });

    // Listen for navigation events
    this.cdpInterface.onNavigationCompleted((sessionId, url) => {
      if (sessionId === this.currentSession?.sessionId) {
        console.log('Navigation completed:', url);
        // Clear focus history on navigation
        this.clearFocusHistory();
      }
    });

    // Listen for errors
    this.cdpInterface.onError((sessionId, error) => {
      if (sessionId === this.currentSession?.sessionId) {
        console.error('CDP error in keyboard simulator:', error);
      }
    });
  }

  private validateStepResult(step: KeyboardStep, focusPath: FocusState[]): { valid: boolean; error: string } {
    if (focusPath.length < 2) {
      return { valid: false, error: 'Insufficient focus history for validation' };
    }

    const previousFocus = focusPath[focusPath.length - 2];
    const currentFocus = focusPath[focusPath.length - 1];

    switch (step.expectedResult) {
      case 'focus-change':
        if (previousFocus?.elementSelector === currentFocus?.elementSelector) {
          return { valid: false, error: `Expected focus change but focus remained on ${currentFocus?.elementSelector || 'unknown'}` };
        }
        break;

      case 'no-change':
        if (previousFocus?.elementSelector !== currentFocus?.elementSelector) {
          return { valid: false, error: `Expected no focus change but focus moved from ${previousFocus?.elementSelector || 'unknown'} to ${currentFocus?.elementSelector || 'unknown'}` };
        }
        break;

      case 'action-trigger':
        // This would require additional context about what action was expected
        // For now, just check that focus is still valid
        if (!currentFocus?.elementSelector) {
          return { valid: false, error: 'Expected action trigger but lost focus' };
        }
        break;
    }

    return { valid: true, error: '' };
  }

  private analyzeFocusTraps(focusPath: FocusState[]): FocusTrappedArea[] {
    const traps: FocusTrappedArea[] = [];
    const elementCounts = new Map<string, number>();

    // Count occurrences of each element in the focus path
    focusPath.forEach(state => {
      if (state.elementSelector) {
        const count = elementCounts.get(state.elementSelector) || 0;
        elementCounts.set(state.elementSelector, count + 1);
      }
    });

    // Identify elements that appear multiple times (potential traps)
    elementCounts.forEach((count, selector) => {
      if (count > 2) { // Element visited more than twice
        const trap: FocusTrappedArea = {
          startSelector: selector,
          endSelector: selector,
          trapType: 'infinite-loop',
          description: `Element ${selector} was focused ${count} times, indicating a potential focus trap`,
          severity: count > 5 ? 'critical' : 'major'
        };
        traps.push(trap);
      }
    });

    return traps;
  }

  private determineTrapType(focusPath: FocusState[], trapStart: number): 'infinite-loop' | 'no-escape' | 'skip-content' {
    const trapLength = focusPath.length - trapStart;
    
    if (trapLength <= 3) {
      return 'infinite-loop';
    } else if (trapLength > 10) {
      return 'skip-content';
    } else {
      return 'no-escape';
    }
  }

  private async resetFocusToStart(): Promise<void> {
    if (!this.currentSession) return;

    try {
      // Try to focus the first focusable element or body
      await this.cdpInterface.evaluateExpression(this.currentSession.sessionId, `
        (function() {
          // Remove focus from current element
          if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
          }
          
          // Focus the first focusable element
          const focusableElements = document.querySelectorAll(
            'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
            return true;
          }
          
          // Fallback to body
          document.body.focus();
          return false;
        })()
      `);
    } catch (error) {
      console.error('Failed to reset focus to start:', error);
    }
  }

  private analyzeNavigationIssues(result: FocusNavigationResult, scenario: KeyboardTestScenario): string[] {
    const issues: string[] = [];

    // Check for focus traps
    if (result.focusTraps.length > 0) {
      issues.push(`Found ${result.focusTraps.length} focus trap(s)`);
    }

    // Check for elements without visible focus
    const elementsWithoutFocus = result.focusPath.filter(state => !state.focusRingVisible);
    if (elementsWithoutFocus.length > 0) {
      issues.push(`${elementsWithoutFocus.length} elements lack visible focus indicators`);
    }

    // Check for navigation errors
    if (result.errors.length > 0) {
      issues.push(`${result.errors.length} navigation errors occurred`);
    }

    // Check navigation time (performance issue)
    if (result.navigationTime > 10000) { // 10 seconds
      issues.push('Navigation took longer than expected (performance issue)');
    }

    return issues;
  }

  private generateRecommendations(result: FocusNavigationResult, scenario: KeyboardTestScenario): string[] {
    const recommendations: string[] = [];

    // Recommendations for focus traps
    if (result.focusTraps.length > 0) {
      recommendations.push('Implement proper focus management to prevent focus traps');
      recommendations.push('Ensure modal dialogs and dropdowns have proper escape mechanisms');
    }

    // Recommendations for missing focus indicators
    const elementsWithoutFocus = result.focusPath.filter(state => !state.focusRingVisible);
    if (elementsWithoutFocus.length > 0) {
      recommendations.push('Add visible focus indicators (outline, border, or background change) to all focusable elements');
      recommendations.push('Ensure focus indicators meet WCAG color contrast requirements');
    }

    // General recommendations
    if (result.focusPath.length === 0) {
      recommendations.push('Ensure page has focusable elements for keyboard navigation');
    }

    if (result.errors.length > 0) {
      recommendations.push('Fix JavaScript errors that may interfere with keyboard navigation');
    }

    return recommendations;
  }
}

/**
 * Keyboard test result interface
 */
export interface KeyboardTestResult {
  scenario: string;
  description: string;
  wcagCriteria: string[];
  passed: boolean;
  navigationResult: FocusNavigationResult;
  issues: string[];
  recommendations: string[];
}

/**
 * Factory function to create keyboard interaction simulator
 */
export function createKeyboardInteractionSimulator(cdpInterface: CDPInterface): KeyboardInteractionSimulator {
  return new KeyboardInteractionSimulator(cdpInterface);
}

/**
 * Utility functions for keyboard interaction testing
 */
export class KeyboardTestUtils {
  /**
   * Generate standard keyboard navigation patterns
   */
  static generateStandardPatterns(): KeyboardNavigationPattern[] {
    return [
      {
        type: 'tab-forward',
        steps: Array(10).fill(0).map(() => ({ key: 'Tab', delay: 100 })),
        description: 'Standard forward tab navigation'
      },
      {
        type: 'tab-backward',
        steps: Array(5).fill(0).map(() => ({ key: 'Tab', modifiers: ['Shift'], delay: 100 })),
        description: 'Standard backward tab navigation'
      },
      {
        type: 'arrow-keys',
        steps: [
          { key: 'ArrowDown', delay: 100 },
          { key: 'ArrowUp', delay: 100 },
          { key: 'ArrowRight', delay: 100 },
          { key: 'ArrowLeft', delay: 100 }
        ],
        description: 'Arrow key navigation for menus and lists'
      }
    ];
  }

  /**
   * Validate focus state for accessibility compliance
   */
  static validateFocusState(focusState: FocusState): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!focusState.isVisible) {
      issues.push('Focused element is not visible');
    }

    if (!focusState.focusRingVisible) {
      issues.push('Focus indicator is not visible');
    }

    if (focusState.tabIndex < 0) {
      issues.push('Element has negative tab index but received focus');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate focus trap test scenarios
   */
  static generateFocusTrapTests(): KeyboardNavigationPattern[] {
    return [
      {
        type: 'custom',
        steps: Array(30).fill(0).map(() => ({ key: 'Tab', delay: 50 })),
        description: 'Extended tab navigation to detect focus traps'
      },
      {
        type: 'custom',
        steps: [
          ...Array(15).fill(0).map(() => ({ key: 'Tab', delay: 50 })),
          ...Array(15).fill(0).map(() => ({ key: 'Tab', modifiers: ['Shift'], delay: 50 }))
        ],
        description: 'Bidirectional navigation to test focus trap escape'
      }
    ];
  }
}