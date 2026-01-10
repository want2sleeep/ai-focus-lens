import { ReflectionEngine } from '../src/agent/core/reflection-engine';
import { AgentStateManager } from '../src/agent/core/agent-state';
import { CDPInterface } from '../src/agent/cdp-interface';
import { AppliedFix, AccessibilityIssue } from '../src/agent/auto-remediation-engine';
import { FocusableElement } from '../src/types';

describe('ReflectionEngine', () => {
  let reflectionEngine: ReflectionEngine;
  let mockCdp: any;
  let mockStateManager: any;

  beforeEach(() => {
    mockCdp = {
      getViewportSize: jest.fn().mockResolvedValue({ width: 1024, height: 768 }),
      captureElementScreenshot: jest.fn().mockResolvedValue('base64-image'),
      focusElement: jest.fn().mockResolvedValue(undefined),
      blurElement: jest.fn().mockResolvedValue(undefined),
      getComputedStyles: jest.fn().mockResolvedValue({ outline: '2px solid red' }),
      getElementBoundingRect: jest.fn().mockResolvedValue({ width: 100, height: 50 })
    };
    
    mockStateManager = {
      addEventListener: jest.fn()
    };

    reflectionEngine = new ReflectionEngine(mockCdp as CDPInterface, mockStateManager as AgentStateManager);
  });

  test('verifyFix should return verified for successful focus visible fix', async () => {
    const element: FocusableElement = {
      selector: '#btn',
      tagName: 'BUTTON',
      tabIndex: 0,
      computedStyle: { outline: 'none' } as any,
      boundingRect: {} as any,
      isSequentialFocusElement: true,
      isInViewport: true
    };

    const solution: any = {
      id: 'fix-1',
      type: 'focus-visible',
      target: { selector: '#btn' },
      css: 'outline: 2px solid red'
    };

    const appliedFix: AppliedFix = {
      solution,
      injectionResult: { success: true } as any,
      domModifications: [],
      verified: false
    };

    const issue: AccessibilityIssue = {
      type: 'missing-focus',
      severity: 'major',
      description: 'Missing focus',
      wcagCriteria: [],
      evidence: {}
    } as any;

    // Mock verification internals
    (reflectionEngine as any).verifyCSSApplication = jest.fn().mockResolvedValue(true);
    (reflectionEngine as any).verifyStylesActive = jest.fn().mockResolvedValue(true);
    (reflectionEngine as any).checkStyleConflicts = jest.fn().mockResolvedValue(true);

    const result = await reflectionEngine.verifyFix(appliedFix, issue, element);

    expect(result.verificationStatus).toBe('verified');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(mockCdp.focusElement).toHaveBeenCalledWith(element.selector);
  });

  test('verifyFix should return failed if CSS application fails', async () => {
    const element = { selector: '#btn', tagName: 'BUTTON' } as FocusableElement;
    const appliedFix = { 
      solution: { id: 'fix-1', type: 'focus-visible', target: { selector: '#btn' } } 
    } as AppliedFix;
    const issue = { type: 'missing-focus' } as AccessibilityIssue;

    // Mock internal failure
    (reflectionEngine as any).verifyCSSApplication = jest.fn().mockResolvedValue(false);

    const result = await reflectionEngine.verifyFix(appliedFix, issue, element);

    expect(result.verificationStatus).toBe('failed');
  });
});
