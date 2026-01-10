/**
 * Tests for Auto-Remediation System
 * 
 * Basic functional tests to validate the CSS fix generation and injection system
 */

import { CSSFixGenerator, CSSFixUtils } from '../src/agent/auto-remediation';
import { CSSInjectionSystem, CSSInjectionUtils } from '../src/agent/css-injection-system';
import { AutoRemediationEngine, AutoRemediationUtils } from '../src/agent/auto-remediation-engine';
import { FocusableElement, ComputedStyleData } from '../src/types';

describe('Auto-Remediation System', () => {
  let fixGenerator: CSSFixGenerator;
  let injectionSystem: CSSInjectionSystem;
  let remediationEngine: AutoRemediationEngine;

  beforeEach(() => {
    fixGenerator = CSSFixGenerator.getInstance();
    injectionSystem = new CSSInjectionSystem();
    remediationEngine = new AutoRemediationEngine();
  });

  describe('CSSFixGenerator', () => {
    const mockElement: FocusableElement = {
      selector: 'button.test-button',
      tagName: 'BUTTON',
      tabIndex: 0,
      computedStyle: {
        outline: 'none',
        outlineColor: 'rgb(0, 0, 0)',
        outlineWidth: '0px',
        outlineStyle: 'none',
        outlineOffset: '0px',
        boxShadow: 'none',
        border: '0px none rgb(0, 0, 0)',
        borderColor: 'rgb(0, 0, 0)',
        borderWidth: '0px',
        borderStyle: 'none',
        borderRadius: '0px',
        backgroundColor: 'rgb(255, 255, 255)',
        color: 'rgb(0, 0, 0)',
        opacity: '1',
        visibility: 'visible',
        display: 'block',
        position: 'static',
        zIndex: 'auto'
      } as ComputedStyleData,
      boundingRect: {
        x: 0, y: 0, width: 100, height: 30,
        top: 0, right: 100, bottom: 30, left: 0,
        toJSON: () => ({})
      } as DOMRect,
      isSequentialFocusElement: true,
      isInViewport: true,
      elementId: 'test-button',
      className: 'test-button'
    };

    const mockContext = {
      parentSelector: 'form',
      siblingCount: 3,
      isInForm: true,
      isInNavigation: false,
      hasCustomStyles: false,
      existingFocusStyles: {},
      pageTheme: {
        primaryColor: { hue: 210, saturation: 100, lightness: 50 },
        backgroundColor: { hue: 0, saturation: 0, lightness: 100 },
        textColor: { hue: 0, saturation: 0, lightness: 0 },
        isDarkTheme: false,
        hasHighContrast: false
      }
    };

    test('should generate focus style fix', () => {
      const fix = fixGenerator.generateFocusStyleFix(mockElement, mockContext);
      
      expect(fix).toBeDefined();
      expect(fix.type).toBe('focus-visible');
      expect(fix.target.selector).toBe('button.test-button');
      expect(fix.css).toContain(':focus');
      expect(fix.css).toContain('outline');
      expect(fix.confidence).toBeGreaterThan(0);
      expect(fix.wcagCriteria).toContain('2.4.7');
    });

    test('should generate color contrast fix', () => {
      const currentContrast = 3.0;
      const fix = fixGenerator.generateColorContrastFix(
        mockElement, 
        currentContrast, 
        mockContext,
        { targetRatio: 4.5 }
      );
      
      expect(fix).toBeDefined();
      expect(fix.type).toBe('color-contrast');
      expect(fix.description).toContain('3.0:1');
      expect(fix.description).toContain('4.5:1');
      expect(fix.wcagCriteria).toContain('1.4.3');
    });

    test('should generate keyboard navigation fix', () => {
      const issues = ['not-focusable', 'missing-tabindex'];
      const fix = fixGenerator.generateKeyboardNavigationFix(mockElement, mockContext, issues);
      
      expect(fix).toBeDefined();
      expect(fix.type).toBe('keyboard-navigation');
      expect(fix.description).toContain('not-focusable');
      expect(fix.wcagCriteria).toContain('2.1.1');
    });

    test('should generate comprehensive fixes', () => {
      const issues = {
        missingFocus: true,
        lowContrast: { current: 2.5, target: 4.5 },
        keyboardIssues: ['not-focusable']
      };
      
      const fixes = fixGenerator.generateComprehensiveFix(mockElement, mockContext, issues);
      
      expect(fixes).toHaveLength(3);
      expect(fixes.map(f => f.type)).toContain('focus-visible');
      expect(fixes.map(f => f.type)).toContain('color-contrast');
      expect(fixes.map(f => f.type)).toContain('keyboard-navigation');
    });
  });

  describe('CSSFixUtils', () => {
    test('should validate CSS syntax', () => {
      const validCSS = '.test { outline: 2px solid blue; }';
      const invalidCSS = '.test { outline: 2px solid blue; ';
      
      const validResult = CSSFixUtils.validateCSS(validCSS);
      const invalidResult = CSSFixUtils.validateCSS(invalidCSS);
      
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
      
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    test('should estimate visual impact', () => {
      const minimalFix = {
        id: 'test',
        type: 'focus-visible' as const,
        css: '.test:focus { outline: 2px solid blue; }',
        target: { selector: '.test' } as any,
        description: 'test',
        confidence: 0.8,
        priority: 'medium' as const,
        reversible: true,
        wcagCriteria: ['2.4.7'],
        estimatedImpact: 'minimal' as const
      };
      
      const impact = CSSFixUtils.estimateVisualImpact(minimalFix);
      expect(impact).toBe('minimal');
    });

    test('should calculate CSS specificity', () => {
      expect(CSSFixUtils.calculateSpecificity('.test')).toBe(10);
      expect(CSSFixUtils.calculateSpecificity('#test')).toBe(100);
      expect(CSSFixUtils.calculateSpecificity('button.test:focus')).toBe(21);
    });
  });

  describe('CSSInjectionUtils', () => {
    test('should estimate performance impact', () => {
      expect(CSSInjectionUtils.estimatePerformanceImpact('cdp-stylesheet')).toBe('low');
      expect(CSSInjectionUtils.estimatePerformanceImpact('insertrule')).toBe('low');
      expect(CSSInjectionUtils.estimatePerformanceImpact('inline-style')).toBe('high');
    });

    test('should generate optimal strategy', () => {
      const strategy = CSSInjectionUtils.generateOptimalStrategy({
        performance: 'high',
        compatibility: 'medium',
        reversibility: true
      });
      
      expect(strategy.primaryMethod).toBe('insertrule');
      expect(strategy.rollbackOnFailure).toBe(true);
      expect(strategy.validateAfterInjection).toBe(true);
    });
  });

  describe('AutoRemediationUtils', () => {
    const mockElement: FocusableElement = {
      selector: 'button',
      tagName: 'BUTTON',
      tabIndex: -1, // Not focusable
      computedStyle: {
        outline: 'none',
        boxShadow: 'none',
        border: 'none'
      } as ComputedStyleData,
      boundingRect: {} as DOMRect,
      isSequentialFocusElement: false,
      isInViewport: true
    };

    test('should analyze element issues', () => {
      const issues = AutoRemediationUtils.analyzeElementIssues(mockElement);
      
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.type === 'missing-focus')).toBe(true);
      expect(issues.some(issue => issue.type === 'keyboard-inaccessible')).toBe(true);
    });

    test('should generate remediation report', () => {
      const mockResults = [{
        taskId: 'test-1',
        success: true,
        appliedFixes: [{ solution: { id: 'fix-1' } } as any],
        failedFixes: [],
        verificationResults: [],
        totalDuration: 1000,
        rollbackAvailable: true
      }];
      
      const report = AutoRemediationUtils.generateRemediationReport(mockResults);
      
      expect(report).toContain('Auto-Remediation Report');
      expect(report).toContain('Total Tasks: 1');
      expect(report).toContain('Successful: 1');
      expect(report).toContain('Failed: 0');
    });
  });

  describe('Integration Tests', () => {
    test('should create instances without errors', () => {
      expect(() => CSSFixGenerator.getInstance()).not.toThrow();
      expect(() => new CSSInjectionSystem()).not.toThrow();
      expect(() => new AutoRemediationEngine()).not.toThrow();
    });

    test('should handle empty inputs gracefully', () => {
      const mockElement: FocusableElement = {
        selector: '',
        tagName: 'DIV',
        tabIndex: 0,
        computedStyle: {} as ComputedStyleData,
        boundingRect: {} as DOMRect,
        isSequentialFocusElement: true,
        isInViewport: true
      };

      const mockContext = {
        siblingCount: 0,
        isInForm: false,
        isInNavigation: false,
        hasCustomStyles: false,
        existingFocusStyles: {},
        pageTheme: {
          primaryColor: { hue: 0, saturation: 0, lightness: 50 },
          backgroundColor: { hue: 0, saturation: 0, lightness: 100 },
          textColor: { hue: 0, saturation: 0, lightness: 0 },
          isDarkTheme: false,
          hasHighContrast: false
        }
      };

      expect(() => {
        fixGenerator.generateFocusStyleFix(mockElement, mockContext);
      }).not.toThrow();
    });
  });
});