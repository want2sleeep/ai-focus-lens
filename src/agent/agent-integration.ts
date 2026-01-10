// Agent Integration Module for Accessibility Testing Agent
// Integrates CDP interface with keyboard and mouse/touch simulators

import { 
  CDPInterface, 
  CDPSession, 
  CDPUtils, 
  createCDPInterface 
} from './cdp-interface';
import { 
  KeyboardInteractionSimulator, 
  createKeyboardInteractionSimulator,
  KeyboardTestResult,
  FocusNavigationResult
} from './keyboard-interaction';
import { 
  MouseTouchInteractionSimulator, 
  createMouseTouchInteractionSimulator,
  MouseTouchTestResult,
  InteractionResult
} from './mouse-touch-interaction';

/**
 * Agent capabilities and status
 * Requirements: 需求 1.1, 1.2 - 集成 CDP 功能并提供统一的智能体接口
 */
export interface AgentCapabilities {
  cdpAvailable: boolean;
  debuggerPermission: boolean;
  keyboardSimulation: boolean;
  mouseSimulation: boolean;
  touchSimulation: boolean;
  screenshotCapture: boolean;
  cssInjection: boolean;
  domManipulation: boolean;
}

export interface AgentStatus {
  initialized: boolean;
  connected: boolean;
  tabId: number | null;
  sessionId: string | null;
  capabilities: AgentCapabilities;
  lastError: string | null;
}

/**
 * Comprehensive interaction test results
 */
export interface ComprehensiveTestResult {
  tabId: number;
  pageUrl: string;
  testDuration: number;
  keyboardTests: KeyboardTestResult[];
  mouseTests: MouseTouchTestResult[];
  touchTests: MouseTouchTestResult[];
  overallCompliance: number;
  criticalIssues: string[];
  recommendations: string[];
  wcagViolations: string[];
}

/**
 * Main Agent Integration Class
 * Requirements: 需求 1.1, 1.2 - 提供统一的智能体接口，集成所有交互模拟功能
 */
export class AccessibilityTestingAgent {
  private cdpInterface: CDPInterface;
  private keyboardSimulator: KeyboardInteractionSimulator;
  private mouseTouchSimulator: MouseTouchInteractionSimulator;
  private currentSession: CDPSession | null = null;
  private status: AgentStatus;

  constructor() {
    this.cdpInterface = createCDPInterface();
    this.keyboardSimulator = createKeyboardInteractionSimulator(this.cdpInterface);
    this.mouseTouchSimulator = createMouseTouchInteractionSimulator(this.cdpInterface);
    
    this.status = {
      initialized: false,
      connected: false,
      tabId: null,
      sessionId: null,
      capabilities: {
        cdpAvailable: false,
        debuggerPermission: false,
        keyboardSimulation: false,
        mouseSimulation: false,
        touchSimulation: false,
        screenshotCapture: false,
        cssInjection: false,
        domManipulation: false
      },
      lastError: null
    };
  }

  /**
   * Initialize the agent for a specific tab
   * Requirements: 需求 1.1, 1.2 - 初始化智能体并建立 CDP 连接
   */
  async initialize(tabId: number): Promise<boolean> {
    try {
      console.log(`Initializing Accessibility Testing Agent for tab ${tabId}`);

      // Check CDP availability
      if (!CDPUtils.isCDPAvailable()) {
        throw new Error('Chrome DevTools Protocol not available');
      }

      // Check debugger permission
      const hasPermission = await CDPUtils.hasDebuggerPermission();
      if (!hasPermission) {
        const granted = await CDPUtils.requestDebuggerPermission();
        if (!granted) {
          throw new Error('Debugger permission not granted');
        }
      }

      // Validate tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTab = tabs.find(tab => tab.id === tabId);
      if (!targetTab || !CDPUtils.isValidTabForCDP(targetTab)) {
        throw new Error('Invalid tab for CDP operations');
      }

      // Initialize CDP connection
      this.currentSession = await this.cdpInterface.connect(tabId);
      
      // Initialize simulators
      const [keyboardInit, mouseInit] = await Promise.all([
        this.keyboardSimulator.initialize(tabId),
        this.mouseTouchSimulator.initialize(tabId)
      ]);

      if (!keyboardInit || !mouseInit) {
        throw new Error('Failed to initialize interaction simulators');
      }

      // Update capabilities
      await this.updateCapabilities();

      // Update status
      this.status = {
        initialized: true,
        connected: true,
        tabId,
        sessionId: this.currentSession.sessionId,
        capabilities: this.status.capabilities,
        lastError: null
      };

      console.log('Accessibility Testing Agent initialized successfully');
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.status.lastError = errorMessage;
      console.error('Failed to initialize Accessibility Testing Agent:', errorMessage);
      return false;
    }
  }

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus {
    return { ...this.status };
  }

  /**
   * Run comprehensive accessibility tests
   * Requirements: 需求 1.1, 1.2 - 执行完整的无障碍测试流程
   */
  async runComprehensiveTests(): Promise<ComprehensiveTestResult> {
    if (!this.status.initialized || !this.status.connected) {
      throw new Error('Agent not initialized or connected');
    }

    const startTime = Date.now();
    let pageUrl = '';

    try {
      // Get page URL
      if (this.status.tabId) {
        const tab = await chrome.tabs.get(this.status.tabId);
        pageUrl = tab.url || '';
      }

      console.log('Starting comprehensive accessibility tests...');

      // Run keyboard accessibility tests
      const keyboardTests = await this.runKeyboardTests();
      
      // Run mouse accessibility tests
      const mouseTests = await this.runMouseTests();
      
      // Run touch accessibility tests (if supported)
      const touchTests = await this.runTouchTests();

      // Calculate overall compliance
      const allTests = [...keyboardTests, ...mouseTests, ...touchTests];
      const passedTests = allTests.filter(test => test.passed).length;
      const overallCompliance = allTests.length > 0 ? (passedTests / allTests.length) * 100 : 0;

      // Extract critical issues and recommendations
      const criticalIssues = this.extractCriticalIssues(keyboardTests, mouseTests, touchTests);
      const recommendations = this.extractRecommendations(keyboardTests, mouseTests, touchTests);
      const wcagViolations = this.extractWCAGViolations(keyboardTests, mouseTests, touchTests);

      const result: ComprehensiveTestResult = {
        tabId: this.status.tabId!,
        pageUrl,
        testDuration: Date.now() - startTime,
        keyboardTests,
        mouseTests,
        touchTests,
        overallCompliance,
        criticalIssues,
        recommendations,
        wcagViolations
      };

      console.log('Comprehensive accessibility tests completed:', result);
      return result;

    } catch (error) {
      console.error('Comprehensive tests failed:', error);
      throw error;
    }
  }

  /**
   * Run keyboard-specific accessibility tests
   */
  async runKeyboardTests(): Promise<KeyboardTestResult[]> {
    if (!this.status.capabilities.keyboardSimulation) {
      console.warn('Keyboard simulation not available');
      return [];
    }

    try {
      console.log('Running keyboard accessibility tests...');
      return await this.keyboardSimulator.runKeyboardAccessibilityTests();
    } catch (error) {
      console.error('Keyboard tests failed:', error);
      return [];
    }
  }

  /**
   * Run mouse-specific accessibility tests
   */
  async runMouseTests(): Promise<MouseTouchTestResult[]> {
    if (!this.status.capabilities.mouseSimulation) {
      console.warn('Mouse simulation not available');
      return [];
    }

    try {
      console.log('Running mouse accessibility tests...');
      return await this.mouseTouchSimulator.runMouseTouchAccessibilityTests();
    } catch (error) {
      console.error('Mouse tests failed:', error);
      return [];
    }
  }

  /**
   * Run touch-specific accessibility tests
   */
  async runTouchTests(): Promise<MouseTouchTestResult[]> {
    if (!this.status.capabilities.touchSimulation) {
      console.warn('Touch simulation not available');
      return [];
    }

    try {
      console.log('Running touch accessibility tests...');
      // Touch tests are part of the mouse/touch simulator
      // Filter for touch-specific tests
      const allTests = await this.mouseTouchSimulator.runMouseTouchAccessibilityTests();
      return allTests.filter(test => test.interactionType.includes('touch'));
    } catch (error) {
      console.error('Touch tests failed:', error);
      return [];
    }
  }

  /**
   * Test for focus traps specifically
   * Requirements: 需求 1.5 - 检测焦点陷阱
   */
  async testForFocusTraps(): Promise<FocusNavigationResult> {
    if (!this.status.capabilities.keyboardSimulation) {
      throw new Error('Keyboard simulation not available for focus trap testing');
    }

    try {
      console.log('Testing for focus traps...');
      
      const focusTraps = await this.keyboardSimulator.testForFocusTraps(50);
      
      return {
        success: focusTraps.length === 0,
        startFocus: null,
        endFocus: null,
        focusPath: [],
        focusTraps,
        navigationTime: 0,
        errors: focusTraps.length > 0 ? [`Found ${focusTraps.length} focus trap(s)`] : []
      };

    } catch (error) {
      console.error('Focus trap testing failed:', error);
      throw error;
    }
  }

  /**
   * Capture screenshot for visual analysis
   */
  async captureScreenshot(): Promise<string | null> {
    if (!this.status.capabilities.screenshotCapture || !this.currentSession) {
      console.warn('Screenshot capture not available');
      return null;
    }

    try {
      const screenshot = await this.cdpInterface.captureScreenshot(this.currentSession.sessionId);
      return screenshot.data;
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return null;
    }
  }

  /**
   * Inject CSS for testing or fixes
   */
  async injectCSS(css: string): Promise<string | null> {
    if (!this.status.capabilities.cssInjection || !this.currentSession) {
      console.warn('CSS injection not available');
      return null;
    }

    try {
      const styleSheetId = await this.cdpInterface.addStyleSheet(this.currentSession.sessionId, css);
      console.log('CSS injected successfully:', styleSheetId);
      return styleSheetId;
    } catch (error) {
      console.error('CSS injection failed:', error);
      return null;
    }
  }

  /**
   * Remove injected CSS
   */
  async removeCSS(styleSheetId: string): Promise<boolean> {
    if (!this.status.capabilities.cssInjection || !this.currentSession) {
      console.warn('CSS removal not available');
      return false;
    }

    try {
      await this.cdpInterface.removeStyleSheet(this.currentSession.sessionId, styleSheetId);
      console.log('CSS removed successfully:', styleSheetId);
      return true;
    } catch (error) {
      console.error('CSS removal failed:', error);
      return false;
    }
  }

  /**
   * Get interaction history from simulators
   */
  getInteractionHistory(): {
    keyboard: any[];
    mouseTouchInteractions: InteractionResult[];
  } {
    return {
      keyboard: this.keyboardSimulator.getFocusHistory(),
      mouseTouchInteractions: this.mouseTouchSimulator.getInteractionHistory()
    };
  }

  /**
   * Clear all interaction history
   */
  clearInteractionHistory(): void {
    this.keyboardSimulator.clearFocusHistory();
    this.mouseTouchSimulator.clearInteractionHistory();
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    try {
      console.log('Cleaning up Accessibility Testing Agent...');

      // Cleanup simulators
      await Promise.all([
        this.keyboardSimulator.cleanup(),
        this.mouseTouchSimulator.cleanup()
      ]);

      // Disconnect CDP
      if (this.currentSession) {
        await this.cdpInterface.disconnect(this.currentSession.sessionId);
        this.currentSession = null;
      }

      // Reset status
      this.status = {
        initialized: false,
        connected: false,
        tabId: null,
        sessionId: null,
        capabilities: {
          cdpAvailable: false,
          debuggerPermission: false,
          keyboardSimulation: false,
          mouseSimulation: false,
          touchSimulation: false,
          screenshotCapture: false,
          cssInjection: false,
          domManipulation: false
        },
        lastError: null
      };

      console.log('Accessibility Testing Agent cleaned up successfully');

    } catch (error) {
      console.error('Failed to cleanup Accessibility Testing Agent:', error);
    }
  }

  // Private helper methods

  private async updateCapabilities(): Promise<void> {
    if (!this.currentSession) return;

    this.status.capabilities = {
      cdpAvailable: CDPUtils.isCDPAvailable(),
      debuggerPermission: await CDPUtils.hasDebuggerPermission(),
      keyboardSimulation: this.currentSession.capabilities.canSimulateInput,
      mouseSimulation: this.currentSession.capabilities.canSimulateInput,
      touchSimulation: this.currentSession.capabilities.canSimulateInput,
      screenshotCapture: this.currentSession.capabilities.canCaptureScreenshots,
      cssInjection: this.currentSession.capabilities.canInjectCSS,
      domManipulation: this.currentSession.capabilities.canModifyDOM
    };
  }

  private extractCriticalIssues(
    keyboardTests: KeyboardTestResult[],
    mouseTests: MouseTouchTestResult[],
    touchTests: MouseTouchTestResult[]
  ): string[] {
    const criticalIssues: string[] = [];

    // Extract critical issues from keyboard tests
    keyboardTests.forEach(test => {
      if (!test.passed && test.wcagCriteria.includes('2.4.7')) {
        criticalIssues.push(`Critical keyboard issue: ${test.scenario}`);
      }
    });

    // Extract critical issues from mouse tests
    mouseTests.forEach(test => {
      if (!test.passed && test.wcagCriteria.includes('2.1.1')) {
        criticalIssues.push(`Critical mouse issue: ${test.testName} on ${test.element}`);
      }
    });

    // Extract critical issues from touch tests
    touchTests.forEach(test => {
      if (!test.passed && test.wcagCriteria.includes('2.1.1')) {
        criticalIssues.push(`Critical touch issue: ${test.testName} on ${test.element}`);
      }
    });

    return criticalIssues;
  }

  private extractRecommendations(
    keyboardTests: KeyboardTestResult[],
    mouseTests: MouseTouchTestResult[],
    touchTests: MouseTouchTestResult[]
  ): string[] {
    const recommendations = new Set<string>();

    // Extract recommendations from all tests
    [...keyboardTests, ...mouseTests, ...touchTests].forEach(test => {
      if ('recommendations' in test) {
        test.recommendations.forEach(rec => recommendations.add(rec));
      }
    });

    return Array.from(recommendations);
  }

  private extractWCAGViolations(
    keyboardTests: KeyboardTestResult[],
    mouseTests: MouseTouchTestResult[],
    touchTests: MouseTouchTestResult[]
  ): string[] {
    const violations = new Set<string>();

    // Extract WCAG violations from failed tests
    [...keyboardTests, ...mouseTests, ...touchTests].forEach(test => {
      if (!test.passed) {
        test.wcagCriteria.forEach(criteria => violations.add(criteria));
      }
    });

    return Array.from(violations);
  }
}

/**
 * Factory function to create accessibility testing agent
 */
export function createAccessibilityTestingAgent(): AccessibilityTestingAgent {
  return new AccessibilityTestingAgent();
}

/**
 * Utility functions for agent integration
 */
export class AgentIntegrationUtils {
  /**
   * Check if agent can be initialized for a tab
   */
  static async canInitializeForTab(tabId: number): Promise<boolean> {
    try {
      if (!CDPUtils.isCDPAvailable()) {
        return false;
      }

      const hasPermission = await CDPUtils.hasDebuggerPermission();
      if (!hasPermission) {
        return false;
      }

      const tab = await chrome.tabs.get(tabId);
      return CDPUtils.isValidTabForCDP(tab);

    } catch (error) {
      console.error('Failed to check tab compatibility:', error);
      return false;
    }
  }

  /**
   * Get recommended test configuration based on page type
   */
  static getRecommendedTestConfig(pageUrl: string): {
    includeKeyboardTests: boolean;
    includeMouseTests: boolean;
    includeTouchTests: boolean;
    focusTrapTesting: boolean;
  } {
    const url = new URL(pageUrl);
    const domain = url.hostname;

    // Default configuration
    let config = {
      includeKeyboardTests: true,
      includeMouseTests: true,
      includeTouchTests: false,
      focusTrapTesting: true
    };

    // Adjust based on domain or page type
    if (domain.includes('mobile') || url.searchParams.has('mobile')) {
      config.includeTouchTests = true;
    }

    if (pageUrl.includes('form') || pageUrl.includes('checkout')) {
      config.focusTrapTesting = true;
    }

    return config;
  }

  /**
   * Format test results for reporting
   */
  static formatTestResults(results: ComprehensiveTestResult): string {
    const lines: string[] = [];
    
    lines.push(`# Accessibility Test Results`);
    lines.push(`Page: ${results.pageUrl}`);
    lines.push(`Overall Compliance: ${results.overallCompliance.toFixed(1)}%`);
    lines.push(`Test Duration: ${results.testDuration}ms`);
    lines.push('');

    if (results.criticalIssues.length > 0) {
      lines.push('## Critical Issues');
      results.criticalIssues.forEach(issue => lines.push(`- ${issue}`));
      lines.push('');
    }

    if (results.wcagViolations.length > 0) {
      lines.push('## WCAG Violations');
      results.wcagViolations.forEach(violation => lines.push(`- ${violation}`));
      lines.push('');
    }

    if (results.recommendations.length > 0) {
      lines.push('## Recommendations');
      results.recommendations.forEach(rec => lines.push(`- ${rec}`));
      lines.push('');
    }

    lines.push(`## Test Summary`);
    lines.push(`- Keyboard Tests: ${results.keyboardTests.length} (${results.keyboardTests.filter(t => t.passed).length} passed)`);
    lines.push(`- Mouse Tests: ${results.mouseTests.length} (${results.mouseTests.filter(t => t.passed).length} passed)`);
    lines.push(`- Touch Tests: ${results.touchTests.length} (${results.touchTests.filter(t => t.passed).length} passed)`);

    return lines.join('\n');
  }
}

/**
 * Export types for external use
 */
export type {
  AgentCapabilities as AccessibilityAgentCapabilities,
  AgentStatus as AccessibilityAgentStatus,
  ComprehensiveTestResult as AccessibilityTestResult
};