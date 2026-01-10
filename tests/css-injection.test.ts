import { ChromeCDPInterface } from '../src/agent/cdp-interface';
import { CSSInjectionSystem } from '../src/agent/css-injection-system';
import { CSSFixSolution } from '../src/agent/auto-remediation';

describe('CSSInjectionSystem', () => {
  let injectionSystem: CSSInjectionSystem;
  let mockCdpInterface: any;

  beforeEach(() => {
    mockCdpInterface = {
      addStyleSheet: jest.fn().mockResolvedValue('sheet-123'),
      removeStyleSheet: jest.fn().mockResolvedValue(undefined),
      setElementAttribute: jest.fn().mockResolvedValue(undefined),
      querySelector: jest.fn().mockResolvedValue({ nodeId: 1 }),
      evaluateExpression: jest.fn().mockResolvedValue({ success: true })
    };
    injectionSystem = new CSSInjectionSystem(mockCdpInterface, 1, 'session-123');
  });

  test('should inject CSS via CDP by default', async () => {
    const fix: CSSFixSolution = {
      id: 'fix-1',
      type: 'focus-visible',
      target: { selector: 'button', tagName: 'BUTTON', context: {} as any },
      css: 'button:focus { outline: 2px solid red; }',
      description: 'Test fix',
      confidence: 1,
      priority: 'high',
      reversible: true,
      wcagCriteria: ['2.4.7'],
      estimatedImpact: 'minimal'
    };

    const result = await injectionSystem.injectCSSFix(fix);
    
    expect(result.success).toBe(true);
    expect(result.method).toBe('cdp-stylesheet');
    expect(mockCdpInterface.addStyleSheet).toHaveBeenCalledWith('session-123', fix.css);
  });

  test('should use fallback if primary method fails', async () => {
    mockCdpInterface.addStyleSheet.mockRejectedValueOnce(new Error('CDP Failed'));
    
    const fix: CSSFixSolution = {
      id: 'fix-1',
      type: 'focus-visible',
      target: { selector: 'button', tagName: 'BUTTON', context: {} as any },
      css: 'button:focus { outline: 2px solid red; }',
      description: 'Test fix',
      confidence: 1,
      priority: 'high',
      reversible: true,
      wcagCriteria: ['2.4.7'],
      estimatedImpact: 'minimal'
    };

    const result = await injectionSystem.injectCSSFix(fix);
    
    expect(result.success).toBe(true);
    expect(result.method).toBe('insertrule');
    expect(result.fallbackUsed).toBe(true);
  });

  test('should modify DOM attributes', async () => {
    const target = { selector: '#target', tagName: 'DIV', context: {} as any };
    const result = await injectionSystem.modifyDOMAttribute(target, 'aria-label', 'new label');
    
    expect(result.success).toBe(true);
    expect(result.attribute).toBe('aria-label');
    expect(result.newValue).toBe('new label');
    expect(mockCdpInterface.setElementAttribute).toHaveBeenCalled();
  });
});
