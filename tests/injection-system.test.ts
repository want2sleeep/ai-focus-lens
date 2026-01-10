/**
 * Tests for CSS Injection System
 * 
 * Validates the injection logic, fallback mechanisms, and script execution
 */

import { CSSInjectionSystem } from '../src/agent/css-injection-system';
import { CDPInterface } from '../src/agent/cdp-interface';

describe('CSSInjectionSystem', () => {
  let injectionSystem: CSSInjectionSystem;
  let mockCDP: jest.Mocked<CDPInterface>;

  beforeEach(() => {
    mockCDP = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn(),
      getSession: jest.fn(),
      enableRuntime: jest.fn(),
      enableDOM: jest.fn(),
      enableInput: jest.fn(),
      enablePage: jest.fn(),
      simulateTabNavigation: jest.fn(),
      simulateKeyPress: jest.fn(),
      simulateKeySequence: jest.fn(),
      simulateMouseClick: jest.fn(),
      simulateMouseMove: jest.fn(),
      simulateDragAndDrop: jest.fn(),
      simulateTouchGesture: jest.fn(),
      getCurrentFocus: jest.fn(),
      setFocus: jest.fn(),
      captureFocusState: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(),
      getElementInfo: jest.fn(),
      getComputedStyle: jest.fn(),
      addStyleSheet: jest.fn(),
      removeStyleSheet: jest.fn(),
      setElementAttribute: jest.fn(),
      captureScreenshot: jest.fn(),
      captureElementScreenshot: jest.fn(),
      evaluateExpression: jest.fn(),
      onFocusChanged: jest.fn(),
      onNavigationCompleted: jest.fn(),
      onError: jest.fn(),
    } as any;

    injectionSystem = new CSSInjectionSystem(mockCDP, 1, 'test-session');
  });

  test('should use CDP for injection when available', async () => {
    const fix = {
      id: 'fix-1',
      type: 'focus-visible' as const,
      css: '.test { outline: 2px solid red; }',
      target: { selector: '.test' } as any,
      description: 'test',
      confidence: 1,
      priority: 'high' as const,
      reversible: true,
      wcagCriteria: ['2.4.7'],
      estimatedImpact: 'minimal' as const
    };

    mockCDP.addStyleSheet.mockResolvedValue('sheet-1');
    // Mock validateInjection success
    mockCDP.evaluateExpression.mockResolvedValue(true);

    const result = await injectionSystem.injectCSSFix(fix, {
      primaryMethod: 'cdp-stylesheet'
    });

    expect(result.success).toBe(true);
    expect(result.method).toBe('cdp-stylesheet');
    expect(mockCDP.addStyleSheet).toHaveBeenCalledWith('test-session', fix.css);
  });

  test('should fallback to insertRule if CDP fails', async () => {
    const fix = {
      id: 'fix-2',
      type: 'focus-visible' as const,
      css: '.test { outline: 2px solid blue; }',
      target: { selector: '.test' } as any,
      description: 'test',
      confidence: 1,
      priority: 'high' as const,
      reversible: true,
      wcagCriteria: ['2.4.7'],
      estimatedImpact: 'minimal' as const
    };

    mockCDP.addStyleSheet.mockRejectedValue(new Error('CDP Failed'));
    mockCDP.evaluateExpression.mockResolvedValue({ success: true });

    const result = await injectionSystem.injectCSSFix(fix, {
      primaryMethod: 'cdp-stylesheet',
      fallbackMethods: ['insertrule'],
      validateAfterInjection: false
    });

    expect(result.success).toBe(true);
    expect(result.method).toBe('insertrule');
    expect(mockCDP.evaluateExpression).toHaveBeenCalled();
  });

  test('should handle DOM attribute modification via CDP', async () => {
    const target = { selector: '.test' } as any;
    mockCDP.querySelector.mockResolvedValue({ nodeId: 1 } as any);
    mockCDP.setElementAttribute.mockResolvedValue(undefined);

    const result = await injectionSystem.modifyDOMAttribute(target, 'aria-label', 'test label', 'test-session');

    expect(result.success).toBe(true);
    expect(mockCDP.setElementAttribute).toHaveBeenCalledWith('test-session', 1, 'aria-label', 'test label');
  });
});