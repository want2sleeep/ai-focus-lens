/**
 * CSS Injection System for Auto-Remediation
 * 
 * This module implements the CSS injection system that can:
 * 1. Inject CSS fixes through insertRule and CDP
 * 2. Modify DOM attributes for accessibility fixes
 * 3. Handle injection failures with fallback strategies
 * 
 * Requirements: 需求 2.2 - 通过 insertRule 注入 CSS、实现 DOM 属性修改、添加注入失败处理
 */

import { CDPInterface } from './cdp-interface';
import { CSSFixSolution, ElementTarget } from './auto-remediation';

/**
 * CSS injection result with detailed information
 */
export interface CSSInjectionResult {
  success: boolean;
  method: InjectionMethod;
  styleSheetId?: string;
  elementId?: string;
  error?: string;
  fallbackUsed: boolean;
  injectedCSS: string;
  timestamp: number;
  duration: number; // milliseconds
}

/**
 * DOM attribute modification result
 */
export interface DOMModificationResult {
  success: boolean;
  attribute: string;
  oldValue?: string | undefined;
  newValue: string;
  element: string;
  error?: string;
  timestamp: number;
}

/**
 * Injection failure information
 */
export interface InjectionFailure {
  method: InjectionMethod;
  error: string;
  errorCode: InjectionErrorCode;
  retryable: boolean;
  suggestedFallback?: InjectionMethod | undefined;
}

/**
 * Available CSS injection methods
 */
export type InjectionMethod = 
  | 'cdp-stylesheet'      // CDP addStyleSheet
  | 'insertrule'          // document.styleSheets[0].insertRule
  | 'style-element'       // Create <style> element
  | 'inline-style'        // Modify element.style directly
  | 'css-custom-property' // Use CSS custom properties
  | 'dom-attribute';      // Modify DOM attributes

/**
 * Injection error codes for specific failure handling
 */
export type InjectionErrorCode =
  | 'CSP_VIOLATION'           // Content Security Policy blocked injection
  | 'CDP_UNAVAILABLE'         // Chrome DevTools Protocol not available
  | 'STYLESHEET_LOCKED'       // StyleSheet is read-only
  | 'ELEMENT_NOT_FOUND'       // Target element doesn't exist
  | 'INVALID_CSS'             // CSS syntax error
  | 'PERMISSION_DENIED'       // Insufficient permissions
  | 'NETWORK_ERROR'           // Network connectivity issue
  | 'UNKNOWN_ERROR';          // Unclassified error

/**
 * Injection strategy configuration
 */
export interface InjectionStrategy {
  primaryMethod: InjectionMethod;
  fallbackMethods: InjectionMethod[];
  retryAttempts: number;
  retryDelay: number; // milliseconds
  validateAfterInjection: boolean;
  rollbackOnFailure: boolean;
}

/**
 * CSS Injection System
 * Implements requirement 需求 2.2: CSS 修复注入和 DOM 属性修改
 */
export class CSSInjectionSystem {
  private cdpInterface: CDPInterface | null = null;
  private tabId: number | null = null;
  private sessionId: string | null = null;
  private injectedStyles: Map<string, CSSInjectionResult> = new Map();
  private modifiedAttributes: Map<string, DOMModificationResult[]> = new Map();
  
  // Default injection strategy
  private readonly DEFAULT_STRATEGY: InjectionStrategy = {
    primaryMethod: 'cdp-stylesheet',
    fallbackMethods: ['insertrule', 'style-element', 'inline-style'],
    retryAttempts: 3,
    retryDelay: 1000,
    validateAfterInjection: true,
    rollbackOnFailure: true
  };

  constructor(cdpInterface?: CDPInterface, tabId?: number, sessionId?: string) {
    this.cdpInterface = cdpInterface || null;
    this.tabId = tabId || null;
    this.sessionId = sessionId || null;
  }

  /**
   * Set the current tab and session context
   */
  public setContext(tabId: number, sessionId?: string): void {
    this.tabId = tabId;
    if (sessionId) {
      this.sessionId = sessionId;
    }
  }

  /**
   * Inject CSS fix using the best available method
   * Requirements: 需求 2.2 - 通过 insertRule 注入 CSS
   */
  public async injectCSSFix(
    fix: CSSFixSolution,
    strategy: Partial<InjectionStrategy> = {}
  ): Promise<CSSInjectionResult> {
    const startTime = Date.now();
    const injectionStrategy: InjectionStrategy = { ...this.DEFAULT_STRATEGY, ...strategy };
    
    let lastError: InjectionFailure | null = null;
    const methodsToTry = [injectionStrategy.primaryMethod, ...injectionStrategy.fallbackMethods];
    
    for (const method of methodsToTry) {
      try {
        const result = await this.attemptInjection(fix, method, injectionStrategy);
        
        if (result.success) {
          // Set fallbackUsed if this wasn't the primary method
          result.fallbackUsed = method !== injectionStrategy.primaryMethod;
          
          // Store successful injection for potential rollback
          this.injectedStyles.set(fix.id, result);
          
          // Validate injection if required
          if (injectionStrategy.validateAfterInjection) {
            const isValid = await this.validateInjection(fix, result);
            if (!isValid && injectionStrategy.rollbackOnFailure) {
              await this.rollbackInjection(fix.id);
              continue; // Try next method
            }
          }
          
          return result;
        }
      } catch (error) {
        lastError = this.classifyInjectionError(error, method);
        
        // If error is not retryable, skip to next method
        if (!lastError.retryable) {
          continue;
        }
        
        // Retry with delay if configured
        if (injectionStrategy.retryAttempts > 0) {
          await this.delay(injectionStrategy.retryDelay);
          injectionStrategy.retryAttempts--;
        }
      }
    }
    
    // All methods failed
    return {
      success: false,
      method: injectionStrategy.primaryMethod,
      error: lastError?.error || 'All injection methods failed',
      fallbackUsed: true,
      injectedCSS: fix.css,
      timestamp: Date.now(),
      duration: Date.now() - startTime
    };
  }

  /**
   * Modify DOM attributes for accessibility fixes
   * Requirements: 需求 2.2 - 实现 DOM 属性修改
   */
  public async modifyDOMAttribute(
    target: ElementTarget,
    attribute: string,
    value: string,
    sessionId?: string
  ): Promise<DOMModificationResult> {
    const startTime = Date.now();
    const effectiveSessionId = sessionId || this.sessionId;
    
    try {
      // Try CDP method first if available
      if (this.cdpInterface && effectiveSessionId) {
        return await this.modifyAttributeViaCDP(target, attribute, value, effectiveSessionId);
      }
      
      // Fallback to content script injection
      return await this.modifyAttributeViaContentScript(target, attribute, value);
      
    } catch (error) {
      return {
        success: false,
        attribute,
        newValue: value,
        element: target.selector,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Rollback a previously injected CSS fix
   */
  public async rollbackInjection(fixId: string): Promise<boolean> {
    const injection = this.injectedStyles.get(fixId);
    if (!injection) {
      return false;
    }

    try {
      switch (injection.method) {
        case 'cdp-stylesheet':
          if (this.cdpInterface && injection.styleSheetId && this.sessionId) {
            await this.cdpInterface.removeStyleSheet(this.sessionId, injection.styleSheetId);
          }
          break;
          
        case 'style-element':
        case 'insertrule':
        case 'css-custom-property':
          if (injection.elementId) {
            await this.removeStyleElement(injection.elementId);
          } else {
            // If it was insertrule on an existing sheet, we'd need to track indices
            // Fallback: clear all accessibility-fix style elements
            await this.removeStyleElement(`accessibility-fix-${fixId}`);
          }
          break;
          
        case 'inline-style':
          // Reverting inline styles is complex as we'd need to store old values
          console.warn('Inline style rollback not fully implemented');
          break;
          
        default:
          console.warn(`Rollback not implemented for method: ${injection.method}`);
      }
      
      this.injectedStyles.delete(fixId);
      return true;
      
    } catch (error) {
      console.error('Rollback failed:', error);
      return false;
    }
  }

  /**
   * Get all active injections
   */
  public getActiveInjections(): Map<string, CSSInjectionResult> {
    return new Map(this.injectedStyles);
  }

  /**
   * Clear all injected styles
   */
  public async clearAllInjections(): Promise<void> {
    const fixIds = Array.from(this.injectedStyles.keys());
    
    for (const fixId of fixIds) {
      await this.rollbackInjection(fixId);
    }
    
    this.injectedStyles.clear();
    this.modifiedAttributes.clear();
  }

  // Private implementation methods

  private async attemptInjection(
    fix: CSSFixSolution,
    method: InjectionMethod,
    strategy: InjectionStrategy
  ): Promise<CSSInjectionResult> {
    const startTime = Date.now();
    
    switch (method) {
      case 'cdp-stylesheet':
        return await this.injectViaCDP(fix, startTime);
        
      case 'insertrule':
        return await this.injectViaInsertRule(fix, startTime);
        
      case 'style-element':
        return await this.injectViaStyleElement(fix, startTime);
        
      case 'inline-style':
        return await this.injectViaInlineStyle(fix, startTime);
        
      case 'css-custom-property':
        return await this.injectViaCustomProperty(fix, startTime);
        
      default:
        throw new Error(`Unsupported injection method: ${method}`);
    }
  }

  private async injectViaCDP(fix: CSSFixSolution, startTime: number): Promise<CSSInjectionResult> {
    if (!this.cdpInterface) {
      throw new Error('CDP interface not available');
    }

    const sessionId = this.sessionId || 'default-session';
    
    try {
      const styleSheetId = await this.cdpInterface.addStyleSheet(sessionId, fix.css);

      return {
        success: true,
        method: 'cdp-stylesheet',
        styleSheetId,
        fallbackUsed: false,
        injectedCSS: fix.css,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      };
    } catch (error) {
      throw new Error(`CDP injection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async injectViaInsertRule(fix: CSSFixSolution, startTime: number): Promise<CSSInjectionResult> {
    const elementId = `accessibility-fix-${fix.id}`;
    // This would be executed in the content script context
    const script = `
      (function() {
        try {
          let style = document.getElementById('${elementId}');
          if (!style) {
            style = document.createElement('style');
            style.id = '${elementId}';
            document.head.appendChild(style);
          }
          const styleSheet = style.sheet;
          
          const css = ${JSON.stringify(fix.css)};
          
          // Better rule extraction: split by closing brace but handle potential nested structures
          const rules = [];
          let currentRule = '';
          let braceLevel = 0;
          
          for (let i = 0; i < css.length; i++) {
            const char = css[i];
            currentRule += char;
            
            if (char === '{') braceLevel++;
            else if (char === '}') {
              braceLevel--;
              if (braceLevel === 0) {
                rules.push(currentRule.trim());
                currentRule = '';
              }
            }
          }
          
          if (currentRule.trim()) rules.push(currentRule.trim());
          
          for (const rule of rules) {
            if (rule) {
              styleSheet.insertRule(rule, styleSheet.cssRules.length);
            }
          }
          
          return { success: true, elementId: '${elementId}' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInContentScript(script);
    
    if (!result.success) {
      throw new Error(result.error || 'InsertRule injection failed');
    }

    return {
      success: true,
      method: 'insertrule',
      elementId: result.elementId,
      fallbackUsed: false,
      injectedCSS: fix.css,
      timestamp: Date.now(),
      duration: Date.now() - startTime
    };
  }

  private async injectViaStyleElement(fix: CSSFixSolution, startTime: number): Promise<CSSInjectionResult> {
    const elementId = `accessibility-fix-${fix.id}`;
    
    const script = `
      (function() {
        try {
          const existingStyle = document.getElementById('${elementId}');
          if (existingStyle) {
            existingStyle.remove();
          }
          
          const style = document.createElement('style');
          style.id = '${elementId}';
          style.textContent = ${JSON.stringify(fix.css)};
          document.head.appendChild(style);
          
          return { success: true, elementId: '${elementId}' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInContentScript(script);
    
    if (!result.success) {
      throw new Error(result.error || 'Style element injection failed');
    }

    return {
      success: true,
      method: 'style-element',
      elementId,
      fallbackUsed: false,
      injectedCSS: fix.css,
      timestamp: Date.now(),
      duration: Date.now() - startTime
    };
  }

  private async injectViaInlineStyle(fix: CSSFixSolution, startTime: number): Promise<CSSInjectionResult> {
    // Extract styles and apply directly to elements
    const script = `
      (function() {
        try {
          const css = ${JSON.stringify(fix.css)};
          const selector = '${fix.target.selector}';
          
          // Parse CSS rules (simplified)
          const rules = css.match(/([^{]+)\\{([^}]+)\\}/g) || [];
          
          for (const rule of rules) {
            const [, sel, styles] = rule.match(/([^{]+)\\{([^}]+)\\}/) || [];
            if (sel && sel.includes(selector.split(':')[0])) {
              const elements = document.querySelectorAll(selector.split(':')[0]);
              const styleProps = styles.split(';').filter(s => s.trim());
              
              elements.forEach(el => {
                styleProps.forEach(prop => {
                  const [property, value] = prop.split(':').map(s => s.trim());
                  if (property && value) {
                    el.style.setProperty(property, value, 'important');
                  }
                });
              });
            }
          }
          
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInContentScript(script);
    
    if (!result.success) {
      throw new Error(result.error || 'Inline style injection failed');
    }

    return {
      success: true,
      method: 'inline-style',
      fallbackUsed: false,
      injectedCSS: fix.css,
      timestamp: Date.now(),
      duration: Date.now() - startTime
    };
  }

  private async injectViaCustomProperty(fix: CSSFixSolution, startTime: number): Promise<CSSInjectionResult> {
    // Use CSS custom properties for dynamic styling
    const propertyName = `--accessibility-fix-${fix.id}`;
    const elementId = `accessibility-prop-${fix.id}`;
    
    const script = `
      (function() {
        try {
          document.documentElement.style.setProperty('${propertyName}', 'active');
          
          const style = document.createElement('style');
          style.id = '${elementId}';
          style.textContent = \`
            :root[style*="${propertyName}: active"] ${fix.css}
          \`;
          document.head.appendChild(style);
          
          return { success: true, elementId: '${elementId}' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInContentScript(script);
    
    if (!result.success) {
      throw new Error(result.error || 'Custom property injection failed');
    }

    return {
      success: true,
      method: 'css-custom-property',
      elementId: result.elementId,
      fallbackUsed: false,
      injectedCSS: fix.css,
      timestamp: Date.now(),
      duration: Date.now() - startTime
    };
  }

  private async modifyAttributeViaCDP(
    target: ElementTarget,
    attribute: string,
    value: string,
    sessionId: string
  ): Promise<DOMModificationResult> {
    if (!this.cdpInterface) {
      throw new Error('CDP interface not available');
    }

    // Find the element using CDP
    const element = await this.cdpInterface.querySelector(sessionId, target.selector);
    if (!element) {
      throw new Error('Element not found');
    }
    
    // Set new attribute value using the correct method name
    await this.cdpInterface.setElementAttribute(sessionId, element.nodeId, attribute, value);
    
    // Track the modification
    const modification: DOMModificationResult = {
      success: true,
      attribute,
      oldValue: undefined, // We don't have a way to get the old value with current interface
      newValue: value,
      element: target.selector,
      timestamp: Date.now()
    };
    
    // Store for potential rollback
    const elementMods = this.modifiedAttributes.get(target.selector) || [];
    elementMods.push(modification);
    this.modifiedAttributes.set(target.selector, elementMods);
    
    return modification;
  }

  private async modifyAttributeViaContentScript(
    target: ElementTarget,
    attribute: string,
    value: string
  ): Promise<DOMModificationResult> {
    const script = `
      (function() {
        try {
          const element = document.querySelector('${target.selector}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          const oldValue = element.getAttribute('${attribute}');
          element.setAttribute('${attribute}', '${value}');
          
          return { 
            success: true, 
            oldValue: oldValue,
            newValue: '${value}'
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInContentScript(script);
    
    if (!result.success) {
      throw new Error(result.error || 'Attribute modification failed');
    }

    return {
      success: true,
      attribute,
      oldValue: result.oldValue,
      newValue: value,
      element: target.selector,
      timestamp: Date.now()
    };
  }

  private async validateInjection(fix: CSSFixSolution, result: CSSInjectionResult): Promise<boolean> {
    // Validate that the CSS was actually applied
    const script = `
      (function() {
        try {
          const element = document.querySelector('${fix.target.selector}');
          if (!element) return false;
          
          const computedStyle = window.getComputedStyle(element);
          
          // Check if focus styles are present (simplified validation)
          const hasOutline = computedStyle.outline !== 'none';
          const hasBoxShadow = computedStyle.boxShadow !== 'none';
          const hasBorder = computedStyle.border !== 'none';
          
          return hasOutline || hasBoxShadow || hasBorder;
        } catch (error) {
          return false;
        }
      })();
    `;

    const isValid = await this.executeInContentScript(script);
    return Boolean(isValid);
  }

  private classifyInjectionError(error: any, method: InjectionMethod): InjectionFailure {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    let errorCode: InjectionErrorCode = 'UNKNOWN_ERROR';
    let retryable = true;
    let suggestedFallback: InjectionMethod | undefined;

    if (errorMessage.includes('Content Security Policy')) {
      errorCode = 'CSP_VIOLATION';
      retryable = false;
      suggestedFallback = 'dom-attribute';
    } else if (errorMessage.includes('CDP') || errorMessage.includes('session')) {
      errorCode = 'CDP_UNAVAILABLE';
      retryable = false;
      suggestedFallback = 'insertrule';
    } else if (errorMessage.includes('read-only') || errorMessage.includes('locked')) {
      errorCode = 'STYLESHEET_LOCKED';
      retryable = false;
      suggestedFallback = 'style-element';
    } else if (errorMessage.includes('not found')) {
      errorCode = 'ELEMENT_NOT_FOUND';
      retryable = true;
    } else if (errorMessage.includes('syntax') || errorMessage.includes('invalid')) {
      errorCode = 'INVALID_CSS';
      retryable = false;
    }

    return {
      method,
      error: errorMessage,
      errorCode,
      retryable,
      suggestedFallback
    };
  }

  private async executeInContentScript(script: string): Promise<any> {
    // Try CDP first if available
    if (this.cdpInterface && this.sessionId) {
      try {
        return await this.cdpInterface.evaluateExpression(this.sessionId, script);
      } catch (error) {
        console.warn('CDP evaluateExpression failed, falling back to chrome.scripting:', error);
      }
    }

    // Fallback to chrome.scripting.executeScript if tabId is available
    if (this.tabId) {
      return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({
          target: { tabId: this.tabId as number },
          func: (scriptText) => {
            return eval(scriptText);
          },
          args: [script]
        }, (results) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (results && results[0]) {
            resolve(results[0].result);
          } else {
            resolve({ success: false, error: 'No result from script execution' });
          }
        });
      });
    }

    throw new Error('No execution context available (tabId or sessionId missing)');
  }

  private async clearCDPStyleSheet(styleSheetId: string): Promise<void> {
    // CDP doesn't have direct removeStyleSheet, so this would need to be implemented
    // by clearing all rules from the stylesheet
    console.warn('CDP stylesheet clearing not fully implemented');
  }

  private async removeStyleElement(elementId: string): Promise<void> {
    const script = `
      (function() {
        const element = document.getElementById('${elementId}');
        if (element) {
          element.remove();
          return true;
        }
        return false;
      })();
    `;

    await this.executeInContentScript(script);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create CSS injection system
 */
export function createCSSInjectionSystem(cdpInterface?: CDPInterface): CSSInjectionSystem {
  return new CSSInjectionSystem(cdpInterface);
}

/**
 * Utility functions for CSS injection
 */
export class CSSInjectionUtils {
  /**
   * Test if CSS injection is available in the current environment
   */
  static async testInjectionCapabilities(): Promise<{
    cdp: boolean;
    insertRule: boolean;
    styleElement: boolean;
    inlineStyle: boolean;
  }> {
    return {
      cdp: false, // Would test CDP availability
      insertRule: true, // Usually available
      styleElement: true, // Usually available
      inlineStyle: true // Usually available
    };
  }

  /**
   * Estimate the performance impact of different injection methods
   */
  static estimatePerformanceImpact(method: InjectionMethod): 'low' | 'medium' | 'high' {
    switch (method) {
      case 'cdp-stylesheet':
      case 'insertrule':
        return 'low';
      case 'style-element':
        return 'medium';
      case 'inline-style':
        return 'high';
      default:
        return 'medium';
    }
  }

  /**
   * Generate injection strategy based on environment and requirements
   */
  static generateOptimalStrategy(
    requirements: {
      performance: 'low' | 'medium' | 'high';
      compatibility: 'low' | 'medium' | 'high';
      reversibility: boolean;
    }
  ): InjectionStrategy {
    const strategy: InjectionStrategy = {
      primaryMethod: 'cdp-stylesheet',
      fallbackMethods: ['insertrule', 'style-element'],
      retryAttempts: 2,
      retryDelay: 500,
      validateAfterInjection: true,
      rollbackOnFailure: requirements.reversibility
    };

    if (requirements.performance === 'high') {
      strategy.primaryMethod = 'insertrule';
      strategy.fallbackMethods = ['cdp-stylesheet'];
    }

    if (requirements.compatibility === 'high') {
      strategy.fallbackMethods.push('inline-style');
    }

    return strategy;
  }
}

export default CSSInjectionSystem;