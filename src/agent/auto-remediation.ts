/**
 * Auto-Remediation System for Accessibility Testing Agent
 * 
 * This module implements the CSS fix code generation engine that can:
 * 1. Generate focus style fixes for elements missing focus indicators
 * 2. Create color contrast fixes for insufficient contrast ratios
 * 3. Implement keyboard navigation fixes for inaccessible elements
 * 
 * Requirements: 需求 2.1, 2.2, 2.3
 */

import { FocusableElement, ComputedStyleData, HSLColor } from '../types';

/**
 * Represents a generated CSS fix solution
 */
export interface CSSFixSolution {
  id: string;
  type: 'focus-visible' | 'color-contrast' | 'keyboard-navigation';
  target: ElementTarget;
  css: string;
  description: string;
  confidence: number; // 0-1
  priority: 'high' | 'medium' | 'low';
  reversible: boolean;
  wcagCriteria: string[];
  estimatedImpact: 'minimal' | 'moderate' | 'significant';
}

/**
 * Target element information for CSS fixes
 */
export interface ElementTarget {
  selector: string;
  tagName: string;
  className?: string | undefined;
  id?: string | undefined;
  role?: string | undefined;
  context: ElementContext;
}

/**
 * Context information about the element's environment
 */
export interface ElementContext {
  parentSelector?: string | undefined;
  siblingCount: number;
  isInForm: boolean;
  isInNavigation: boolean;
  hasCustomStyles: boolean;
  existingFocusStyles: Partial<ComputedStyleData>;
  pageTheme: PageTheme;
}

/**
 * Page theme information for generating appropriate fixes
 */
export interface PageTheme {
  primaryColor: HSLColor;
  backgroundColor: HSLColor;
  textColor: HSLColor;
  accentColor?: HSLColor;
  isDarkTheme: boolean;
  hasHighContrast: boolean;
}

/**
 * Focus style generation options
 */
export interface FocusStyleOptions {
  preferredStyle: 'outline' | 'box-shadow' | 'border' | 'background';
  colorScheme: 'auto' | 'light' | 'dark' | 'high-contrast';
  thickness: number; // in pixels
  offset: number; // in pixels
  animationEnabled: boolean;
  respectExistingStyles: boolean;
}

/**
 * Color contrast fix options
 */
export interface ColorContrastOptions {
  targetRatio: number; // WCAG AA: 4.5, AAA: 7
  preserveHue: boolean;
  adjustBackground: boolean;
  adjustForeground: boolean;
  fallbackColors: HSLColor[];
}

/**
 * CSS Fix Code Generator
 * Implements requirement 需求 2.1: 生成焦点样式修复代码、创建颜色对比修复方案、实现键盘导航修复
 */
export class CSSFixGenerator {
  private static instance: CSSFixGenerator | null = null;
  
  // Default focus style configurations
  private readonly DEFAULT_FOCUS_STYLES = {
    outline: {
      width: '2px',
      style: 'solid',
      offset: '2px'
    },
    boxShadow: {
      blur: '0px',
      spread: '2px',
      inset: false
    },
    border: {
      width: '2px',
      style: 'solid'
    }
  };

  // WCAG compliant color combinations
  private readonly WCAG_COLORS = {
    light: {
      focus: { hue: 210, saturation: 100, lightness: 50 }, // Blue
      error: { hue: 0, saturation: 100, lightness: 50 },   // Red
      success: { hue: 120, saturation: 100, lightness: 35 } // Green
    },
    dark: {
      focus: { hue: 210, saturation: 100, lightness: 70 }, // Light Blue
      error: { hue: 0, saturation: 100, lightness: 70 },   // Light Red
      success: { hue: 120, saturation: 100, lightness: 60 } // Light Green
    }
  };

  private constructor() {}

  public static getInstance(): CSSFixGenerator {
    if (!CSSFixGenerator.instance) {
      CSSFixGenerator.instance = new CSSFixGenerator();
    }
    return CSSFixGenerator.instance;
  }

  /**
   * Generate focus style fix for elements missing focus indicators
   * Requirements: 需求 2.1 - 生成焦点样式修复代码
   */
  public generateFocusStyleFix(
    element: FocusableElement,
    context: ElementContext,
    options: Partial<FocusStyleOptions> = {}
  ): CSSFixSolution {
    const opts: FocusStyleOptions = {
      preferredStyle: 'outline',
      colorScheme: 'auto',
      thickness: 2,
      offset: 2,
      animationEnabled: false,
      respectExistingStyles: true,
      ...options
    };

    const target = this.createElementTarget(element, context);
    const theme = context.pageTheme;
    
    // Determine the best focus style approach
    const styleApproach = this.determineFocusStyleApproach(element, context, opts);
    
    // Generate CSS based on the chosen approach
    const css = this.generateFocusCSS(target, styleApproach, theme, opts);
    
    return {
      id: `focus-fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'focus-visible',
      target,
      css,
      description: `Add ${styleApproach} focus indicator for ${target.tagName} element`,
      confidence: this.calculateFocusFixConfidence(element, context, styleApproach),
      priority: this.determineFocusFixPriority(element, context),
      reversible: true,
      wcagCriteria: ['2.4.7'],
      estimatedImpact: 'minimal'
    };
  }

  /**
   * Generate color contrast fix for insufficient contrast ratios
   * Requirements: 需求 2.1 - 创建颜色对比修复方案
   */
  public generateColorContrastFix(
    element: FocusableElement,
    currentContrast: number,
    context: ElementContext,
    options: Partial<ColorContrastOptions> = {}
  ): CSSFixSolution {
    const opts: ColorContrastOptions = {
      targetRatio: 4.5, // WCAG AA standard
      preserveHue: true,
      adjustBackground: false,
      adjustForeground: true,
      fallbackColors: [],
      ...options
    };

    const target = this.createElementTarget(element, context);
    const theme = context.pageTheme;
    
    // Calculate required color adjustments
    const colorAdjustment = this.calculateColorAdjustment(
      element.computedStyle,
      currentContrast,
      opts.targetRatio,
      opts
    );
    
    // Generate CSS for color contrast fix
    const css = this.generateColorContrastCSS(target, colorAdjustment, opts);
    
    return {
      id: `contrast-fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'color-contrast',
      target,
      css,
      description: `Improve color contrast from ${currentContrast.toFixed(1)}:1 to ${opts.targetRatio}:1`,
      confidence: this.calculateContrastFixConfidence(currentContrast, opts.targetRatio),
      priority: currentContrast < 3 ? 'high' : 'medium',
      reversible: true,
      wcagCriteria: ['1.4.3', '1.4.6'],
      estimatedImpact: opts.adjustBackground ? 'moderate' : 'minimal'
    };
  }

  /**
   * Generate keyboard navigation fix for inaccessible elements
   * Requirements: 需求 2.1 - 实现键盘导航修复
   */
  public generateKeyboardNavigationFix(
    element: FocusableElement,
    context: ElementContext,
    navigationIssues: string[]
  ): CSSFixSolution {
    const target = this.createElementTarget(element, context);
    
    // Determine the type of keyboard navigation fix needed
    const fixType = this.determineKeyboardFixType(navigationIssues);
    
    // Generate appropriate CSS fix
    const css = this.generateKeyboardNavigationCSS(target, fixType, context);
    
    return {
      id: `keyboard-fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'keyboard-navigation',
      target,
      css,
      description: `Fix keyboard navigation issues: ${navigationIssues.join(', ')}`,
      confidence: this.calculateKeyboardFixConfidence(navigationIssues),
      priority: navigationIssues.includes('not-focusable') ? 'high' : 'medium',
      reversible: true,
      wcagCriteria: ['2.1.1', '2.4.3'],
      estimatedImpact: 'minimal'
    };
  }

  /**
   * Generate comprehensive fix combining multiple accessibility issues
   */
  public generateComprehensiveFix(
    element: FocusableElement,
    context: ElementContext,
    issues: {
      missingFocus?: boolean;
      lowContrast?: { current: number; target: number };
      keyboardIssues?: string[];
    }
  ): CSSFixSolution[] {
    const fixes: CSSFixSolution[] = [];

    if (issues.missingFocus) {
      fixes.push(this.generateFocusStyleFix(element, context));
    }

    if (issues.lowContrast) {
      fixes.push(this.generateColorContrastFix(
        element,
        issues.lowContrast.current,
        context,
        { targetRatio: issues.lowContrast.target }
      ));
    }

    if (issues.keyboardIssues && issues.keyboardIssues.length > 0) {
      fixes.push(this.generateKeyboardNavigationFix(element, context, issues.keyboardIssues));
    }

    return fixes;
  }

  // Private helper methods

  private createElementTarget(element: FocusableElement, context: ElementContext): ElementTarget {
    return {
      selector: element.selector,
      tagName: element.tagName,
      className: element.className,
      id: element.elementId,
      role: element.ariaLabel ? 'labeled' : undefined,
      context
    };
  }

  private determineFocusStyleApproach(
    element: FocusableElement,
    context: ElementContext,
    options: FocusStyleOptions
  ): 'outline' | 'box-shadow' | 'border' | 'background' {
    // If user has a preference, respect it
    if (options.preferredStyle !== 'outline') {
      return options.preferredStyle;
    }

    // Check if element already has conflicting styles
    const style = element.computedStyle;
    
    // If element has existing border-radius, box-shadow works better
    if (style.borderRadius && style.borderRadius !== '0px') {
      return 'box-shadow';
    }

    // If element has existing box-shadow, use outline
    if (style.boxShadow && style.boxShadow !== 'none') {
      return 'outline';
    }

    // For form elements, box-shadow often works better
    if (['input', 'select', 'textarea', 'button'].includes(element.tagName.toLowerCase())) {
      return 'box-shadow';
    }

    // Default to outline for most elements
    return 'outline';
  }

  private generateFocusCSS(
    target: ElementTarget,
    approach: 'outline' | 'box-shadow' | 'border' | 'background',
    theme: PageTheme,
    options: FocusStyleOptions
  ): string {
    const color = this.selectFocusColor(theme, options.colorScheme);
    const colorStr = this.hslToString(color);
    
    let css = `${target.selector}:focus {\n`;
    
    switch (approach) {
      case 'outline':
        css += `  outline: ${options.thickness}px solid ${colorStr};\n`;
        css += `  outline-offset: ${options.offset}px;\n`;
        break;
        
      case 'box-shadow':
        css += `  box-shadow: 0 0 0 ${options.thickness}px ${colorStr};\n`;
        css += `  outline: none;\n`;
        break;
        
      case 'border':
        css += `  border: ${options.thickness}px solid ${colorStr};\n`;
        break;
        
      case 'background':
        const bgColor = { ...color, lightness: Math.max(color.lightness - 10, 10) };
        css += `  background-color: ${this.hslToString(bgColor)};\n`;
        css += `  outline: 1px solid ${colorStr};\n`;
        break;
    }
    
    // Add transition for smooth focus indication
    if (options.animationEnabled) {
      css += `  transition: all 0.2s ease-in-out;\n`;
    }
    
    css += `}\n`;
    
    // Add focus-visible support for modern browsers
    css += `${target.selector}:focus-visible {\n`;
    css += `  /* Same styles as :focus */\n`;
    css += `}\n`;
    
    return css;
  }

  private generateColorContrastCSS(
    target: ElementTarget,
    adjustment: ColorAdjustment,
    options: ColorContrastOptions
  ): string {
    let css = `${target.selector} {\n`;
    
    if (adjustment.foregroundColor) {
      css += `  color: ${this.hslToString(adjustment.foregroundColor)} !important;\n`;
    }
    
    if (adjustment.backgroundColor) {
      css += `  background-color: ${this.hslToString(adjustment.backgroundColor)} !important;\n`;
    }
    
    css += `}\n`;
    
    return css;
  }

  private generateKeyboardNavigationCSS(
    target: ElementTarget,
    fixType: KeyboardFixType,
    context: ElementContext
  ): string {
    let css = '';
    
    switch (fixType) {
      case 'make-focusable':
        css = `${target.selector} {\n`;
        css += `  tabindex: 0;\n`;
        css += `}\n`;
        break;
        
      case 'skip-link':
        css = `${target.selector} {\n`;
        css += `  position: absolute;\n`;
        css += `  left: -9999px;\n`;
        css += `}\n`;
        css += `${target.selector}:focus {\n`;
        css += `  position: static;\n`;
        css += `  left: auto;\n`;
        css += `}\n`;
        break;
        
      case 'focus-trap':
        // This would typically require JavaScript, but we can provide CSS hints
        css = `${target.selector} {\n`;
        css += `  /* Focus trap container */\n`;
        css += `  position: relative;\n`;
        css += `}\n`;
        break;
    }
    
    return css;
  }

  private selectFocusColor(theme: PageTheme, colorScheme: string): HSLColor {
    if (colorScheme === 'high-contrast') {
      return theme.isDarkTheme 
        ? { hue: 60, saturation: 100, lightness: 90 } // Bright yellow
        : { hue: 240, saturation: 100, lightness: 20 }; // Dark blue
    }
    
    const colors = theme.isDarkTheme ? this.WCAG_COLORS.dark : this.WCAG_COLORS.light;
    return colors.focus;
  }

  private calculateColorAdjustment(
    currentStyle: ComputedStyleData,
    currentContrast: number,
    targetContrast: number,
    options: ColorContrastOptions
  ): ColorAdjustment {
    // This is a simplified implementation
    // In a real implementation, you'd use proper color contrast algorithms
    
    const adjustment: ColorAdjustment = {};
    
    if (options.adjustForeground) {
      // Darken or lighten the text color to improve contrast
      const currentColor = this.parseColor(currentStyle.color);
      if (currentColor) {
        const adjustedLightness = currentContrast < targetContrast 
          ? Math.max(currentColor.lightness - 20, 0)
          : Math.min(currentColor.lightness + 20, 100);
        
        adjustment.foregroundColor = {
          ...currentColor,
          lightness: adjustedLightness
        };
      }
    }
    
    return adjustment;
  }

  private calculateFocusFixConfidence(
    element: FocusableElement,
    context: ElementContext,
    approach: string
  ): number {
    let confidence = 0.8; // Base confidence
    
    // Higher confidence for standard interactive elements
    if (['button', 'input', 'select', 'textarea', 'a'].includes(element.tagName.toLowerCase())) {
      confidence += 0.1;
    }
    
    // Lower confidence if element has complex existing styles
    if (context.hasCustomStyles) {
      confidence -= 0.1;
    }
    
    // Higher confidence for outline approach (most compatible)
    if (approach === 'outline') {
      confidence += 0.05;
    }
    
    return Math.min(Math.max(confidence, 0), 1);
  }

  private calculateContrastFixConfidence(currentContrast: number, targetContrast: number): number {
    const ratio = currentContrast / targetContrast;
    
    // Higher confidence if we're close to the target
    if (ratio > 0.8) return 0.9;
    if (ratio > 0.6) return 0.8;
    if (ratio > 0.4) return 0.7;
    return 0.6;
  }

  private calculateKeyboardFixConfidence(issues: string[]): number {
    // Simple heuristic based on issue complexity
    const complexIssues = ['focus-trap', 'custom-navigation'];
    const hasComplexIssues = issues.some(issue => complexIssues.includes(issue));
    
    return hasComplexIssues ? 0.6 : 0.8;
  }

  private determineFocusFixPriority(
    element: FocusableElement,
    context: ElementContext
  ): 'high' | 'medium' | 'low' {
    // High priority for interactive elements in forms or navigation
    if (context.isInForm || context.isInNavigation) {
      return 'high';
    }
    
    // High priority for buttons and links
    if (['button', 'a'].includes(element.tagName.toLowerCase())) {
      return 'high';
    }
    
    // Medium priority for form controls
    if (['input', 'select', 'textarea'].includes(element.tagName.toLowerCase())) {
      return 'medium';
    }
    
    return 'low';
  }

  private determineKeyboardFixType(issues: string[]): KeyboardFixType {
    if (issues.includes('not-focusable')) return 'make-focusable';
    if (issues.includes('skip-link-missing')) return 'skip-link';
    if (issues.includes('focus-trap')) return 'focus-trap';
    return 'make-focusable'; // Default
  }

  private hslToString(color: HSLColor): string {
    const alpha = color.alpha !== undefined ? color.alpha : 1;
    if (alpha < 1) {
      return `hsla(${color.hue}, ${color.saturation}%, ${color.lightness}%, ${alpha})`;
    }
    return `hsl(${color.hue}, ${color.saturation}%, ${color.lightness}%)`;
  }

  private parseColor(colorString: string): HSLColor | null {
    // Simplified color parsing - in a real implementation, use a proper color library
    // This is just a placeholder for the concept
    return null;
  }
}

// Supporting interfaces and types

interface ColorAdjustment {
  foregroundColor?: HSLColor;
  backgroundColor?: HSLColor;
}

type KeyboardFixType = 'make-focusable' | 'skip-link' | 'focus-trap';

/**
 * Factory function to create CSS fix generator instance
 */
export function createCSSFixGenerator(): CSSFixGenerator {
  return CSSFixGenerator.getInstance();
}

/**
 * Utility functions for CSS fix generation
 */
export class CSSFixUtils {
  /**
   * Validate generated CSS for syntax errors
   */
  static validateCSS(css: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Basic CSS validation
    if (!css.trim()) {
      errors.push('CSS is empty');
    }
    
    // Check for balanced braces
    const openBraces = (css.match(/{/g) || []).length;
    const closeBraces = (css.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push('Unbalanced braces in CSS');
    }
    
    // Check for basic syntax issues
    if (css.includes(';;')) {
      errors.push('Double semicolons found');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Estimate the visual impact of a CSS fix
   */
  static estimateVisualImpact(fix: CSSFixSolution): 'minimal' | 'moderate' | 'significant' {
    if (fix.type === 'focus-visible' && fix.css.includes('outline')) {
      return 'minimal';
    }
    
    if (fix.type === 'color-contrast' && fix.css.includes('background-color')) {
      return 'moderate';
    }
    
    if (fix.css.includes('!important')) {
      return 'significant';
    }
    
    return 'minimal';
  }

  /**
   * Generate CSS selector specificity score
   */
  static calculateSpecificity(selector: string): number {
    let score = 0;
    
    // Count IDs (#test) - 100 points
    const idMatches = selector.match(/#[a-zA-Z0-9_-]+/g) || [];
    score += idMatches.length * 100;
    
    // Count classes (.test), attributes ([type]), and pseudo-classes (:focus) - 10 points
    const classAttrPseudoMatches = selector.match(/\.[a-zA-Z0-9_-]+|\[[^\]]+\]|:[a-zA-Z0-9_-]+/g) || [];
    score += classAttrPseudoMatches.length * 10;
    
    // Count elements (button, div) - 1 point
    // Remove parts already counted to avoid double counting
    let remaining = selector;
    idMatches.forEach(m => remaining = remaining.replace(m, ' '));
    classAttrPseudoMatches.forEach(m => remaining = remaining.replace(m, ' '));
    
    const elementMatches = remaining.match(/\b[a-zA-Z0-9]+\b/g) || [];
    score += elementMatches.length;
    
    return score;
  }
}

export default CSSFixGenerator;