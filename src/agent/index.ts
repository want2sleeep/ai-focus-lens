// Agent Module Exports
// Main entry point for the Accessibility Testing Agent

// Main Agent Integration Exports
export { AccessibilityTestingAgent, createAccessibilityTestingAgent, AgentIntegrationUtils } from './agent-integration';
export type { AccessibilityAgentCapabilities, AccessibilityAgentStatus, AccessibilityTestResult } from './agent-integration';

// CDP Interface Exports
export { CDPInterface, ChromeCDPInterface, createCDPInterface, CDPUtils } from './cdp-interface';
export type { CDPSession, CDPCapabilities, KeyboardEvent, MouseEvent, TouchEvent, FocusState, NavigationResult } from './cdp-interface';

// Keyboard Interaction Exports
export { KeyboardInteractionSimulator, createKeyboardInteractionSimulator, KeyboardTestUtils } from './keyboard-interaction';
export type { KeyboardNavigationPattern, KeyboardTestResult, FocusNavigationResult } from './keyboard-interaction';

// Mouse/Touch Interaction Exports
export { MouseTouchInteractionSimulator, createMouseTouchInteractionSimulator, MouseTouchTestUtils } from './mouse-touch-interaction';
export type { MouseInteractionPattern, TouchGesturePattern, InteractionResult, MouseTouchTestResult } from './mouse-touch-interaction';

// Action Engine Exports
export { ActionEngine, createActionEngine, ActionEngineUtils } from './action-engine';
export type { Action, ActionResult, ActionType, UIComponent, ComponentExpansionResult, NavigationCapabilities } from './action-engine';

// Focus Trap Detector Exports
export { FocusTrapDetector, createFocusTrapDetector, FocusTrapDetectorUtils } from './focus-trap-detector';
export type { FocusTrapDetectionResult, FocusTrapReport, FocusTrapType, FocusTrapDetectionConfig } from './focus-trap-detector';

// Auto-Remediation System Exports
export { CSSFixGenerator, createCSSFixGenerator, CSSFixUtils } from './auto-remediation';
export type { CSSFixSolution, ElementTarget, ElementContext, PageTheme, FocusStyleOptions, ColorContrastOptions } from './auto-remediation';

export { CSSInjectionSystem, createCSSInjectionSystem, CSSInjectionUtils } from './css-injection-system';
export type { CSSInjectionResult, DOMModificationResult, InjectionMethod, InjectionStrategy, InjectionFailure } from './css-injection-system';

export { AutoRemediationEngine, createAutoRemediationEngine, AutoRemediationUtils } from './auto-remediation-engine';
export type { RemediationTask, RemediationResult, AccessibilityIssue, AppliedFix, FailedFix, VerificationResult, RemediationConfig } from './auto-remediation-engine';

/**
 * Create a basic agent configuration from extension config
 */
export function createBasicAgentConfig(extensionConfig: any): any {
  return {
    cdpEnabled: true,
    keyboardTesting: true,
    mouseTesting: true,
    touchTesting: false,
    screenshotCapture: true,
    cssInjection: true,
    focusTrapDetection: true,
    timeout: extensionConfig.timeout || 30000,
    batchSize: extensionConfig.batchSize || 5,
    ...extensionConfig
  };
}

// Re-export types from other modules for convenience
export type { ExtensionError } from '../types';