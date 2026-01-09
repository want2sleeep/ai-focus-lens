/**
 * ACT Rule oj04fd specific types and utilities
 * Requirements: 需求 2.1 - 构建符合 ACT 规则 oj04fd 的 System Prompt
 */

import { HSLColor, ComputedStyleData } from './index';

/**
 * ACT Rule oj04fd test procedure implementation
 */
export interface ACTRuleTestProcedure {
  step1_checkApplicability(element: Element): ACTApplicabilityResult;
  step2_checkExpectation(
    element: Element, 
    focusedStyle: ComputedStyleData, 
    unfocusedStyle: ComputedStyleData
  ): ACTExpectationResult;
  step3_determineOutcome(
    applicability: ACTApplicabilityResult, 
    expectation: ACTExpectationResult
  ): ACTOutcome;
}

/**
 * ACT Rule applicability check result
 */
export interface ACTApplicabilityResult {
  isApplicable: boolean;
  reasons: string[];
  checks: {
    isSequentialFocusElement: boolean;
    isInViewport: boolean;
    isVisible: boolean;
    hasValidTabIndex: boolean;
    isInteractiveElement: boolean;
  };
}

/**
 * ACT Rule expectation check result
 */
export interface ACTExpectationResult {
  hasVisibleFocusIndicator: boolean;
  colorDifference: {
    focusedHSL: HSLColor;
    unfocusedHSL: HSLColor;
    threshold: number;
    actualDifference: number;
    meetsThreshold: boolean;
  };
  focusIndicatorProperties: {
    hasOutline: boolean;
    hasBoxShadow: boolean;
    hasBorderChange: boolean;
    hasBackgroundChange: boolean;
    hasColorChange: boolean;
  };
  details: string[];
}

/**
 * ACT Rule test outcome
 */
export type ACTOutcome = 'passed' | 'failed' | 'inapplicable' | 'cantell';

/**
 * ACT Rule oj04fd System Prompt template data
 */
export interface ACTPromptData {
  ruleId: string;
  ruleName: string;
  ruleDescription: string;
  applicabilityCriteria: string[];
  expectationCriteria: string[];
  testProcedure: string[];
  examples: {
    passed: string[];
    failed: string[];
    inapplicable: string[];
  };
}

/**
 * Default ACT Rule oj04fd configuration
 */
export const ACT_RULE_OJ04FD_CONFIG: Readonly<ACTPromptData> = {
  ruleId: 'oj04fd',
  ruleName: 'Focus visible',
  ruleDescription: 'Each element in sequential focus order has some visible focus indicator',
  applicabilityCriteria: [
    'Element is part of sequential focus navigation',
    'Element is in the viewport',
    'Element is visible (not hidden)',
    'Element has valid tabindex',
    'Element is interactive'
  ],
  expectationCriteria: [
    'At least one device pixel in the viewport has a different HSL color value when focused vs unfocused',
    'Color difference meets minimum threshold of 3 units',
    'Focus indicator is visually perceivable'
  ],
  testProcedure: [
    '1. Check if element meets applicability criteria',
    '2. Capture element styles in unfocused state',
    '3. Focus the element programmatically',
    '4. Capture element styles in focused state',
    '5. Compare HSL color values for visual differences',
    '6. Determine if differences meet visibility threshold'
  ],
  examples: {
    passed: [
      'Button with visible outline on focus',
      'Link with background color change on focus',
      'Input field with border color change on focus'
    ],
    failed: [
      'Button with no visible focus indicator',
      'Link with insufficient color contrast change',
      'Input field with focus indicator same as unfocused state'
    ],
    inapplicable: [
      'Hidden elements',
      'Elements with tabindex="-1"',
      'Elements outside viewport'
    ]
  }
} as const;

/**
 * Utility functions for ACT Rule oj04fd
 */
export class ACTRuleOJ04FDUtils {
  /**
   * Calculate HSL color difference
   */
  static calculateHSLDifference(color1: HSLColor, color2: HSLColor): number {
    const hueDiff = Math.abs(color1.hue - color2.hue);
    const satDiff = Math.abs(color1.saturation - color2.saturation);
    const lightDiff = Math.abs(color1.lightness - color2.lightness);
    
    // Use weighted formula for perceptual color difference
    return Math.sqrt(
      Math.pow(hueDiff * 0.3, 2) + 
      Math.pow(satDiff * 0.59, 2) + 
      Math.pow(lightDiff * 0.11, 2)
    );
  }

  /**
   * Convert RGB to HSL
   */
  static rgbToHsl(r: number, g: number, b: number): HSLColor {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h: number, s: number;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        default: h = 0;
      }
      h /= 6;
    }

    return {
      hue: Math.round(h * 360),
      saturation: Math.round(s * 100),
      lightness: Math.round(l * 100)
    };
  }

  /**
   * Parse CSS color value to RGB
   */
  static parseColorToRgb(colorValue: string): { r: number; g: number; b: number } | null {
    // Handle rgb() format
    const rgbMatch = colorValue.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
      return {
        r: parseInt(rgbMatch[1], 10),
        g: parseInt(rgbMatch[2], 10),
        b: parseInt(rgbMatch[3], 10)
      };
    }

    // Handle hex format
    const hexMatch = colorValue.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (hexMatch && hexMatch[1] && hexMatch[2] && hexMatch[3]) {
      return {
        r: parseInt(hexMatch[1], 16),
        g: parseInt(hexMatch[2], 16),
        b: parseInt(hexMatch[3], 16)
      };
    }

    // Handle named colors (basic set)
    const namedColors: Record<string, { r: number; g: number; b: number }> = {
      'black': { r: 0, g: 0, b: 0 },
      'white': { r: 255, g: 255, b: 255 },
      'red': { r: 255, g: 0, b: 0 },
      'green': { r: 0, g: 128, b: 0 },
      'blue': { r: 0, g: 0, b: 255 },
      'transparent': { r: 0, g: 0, b: 0 }
    };

    return namedColors[colorValue.toLowerCase()] || null;
  }

  /**
   * Extract HSL values from computed style
   */
  static extractHSLFromStyle(style: ComputedStyleData): {
    outline: HSLColor;
    border: HSLColor;
    boxShadow: HSLColor;
    background: HSLColor;
  } {
    const parseAndConvert = (colorValue: string): HSLColor => {
      const rgb = this.parseColorToRgb(colorValue);
      if (rgb) {
        return this.rgbToHsl(rgb.r, rgb.g, rgb.b);
      }
      return { hue: 0, saturation: 0, lightness: 0 }; // Default to black
    };

    return {
      outline: parseAndConvert(style.outlineColor),
      border: parseAndConvert(style.borderColor),
      boxShadow: parseAndConvert(style.boxShadow.split(' ')[3] || 'transparent'),
      background: parseAndConvert(style.backgroundColor)
    };
  }

  /**
   * Check if element is in sequential focus navigation
   */
  static isSequentialFocusElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const tabIndex = element.getAttribute('tabindex');
    
    // Elements that are naturally focusable
    const naturallyFocusable = [
      'a', 'button', 'input', 'select', 'textarea', 'details'
    ];
    
    if (naturallyFocusable.includes(tagName)) {
      // Check if explicitly removed from tab order
      return tabIndex !== '-1';
    }
    
    // Elements with positive or zero tabindex
    if (tabIndex !== null) {
      const tabIndexNum = parseInt(tabIndex, 10);
      return !isNaN(tabIndexNum) && tabIndexNum >= 0;
    }
    
    // Contenteditable elements
    if (element.getAttribute('contenteditable') === 'true') {
      return tabIndex !== '-1';
    }
    
    return false;
  }

  /**
   * Check if element is in viewport
   */
  static isInViewport(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  /**
   * Check if element is visible
   */
  static isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }
}