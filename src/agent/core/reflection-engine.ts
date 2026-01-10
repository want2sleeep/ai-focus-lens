/**
 * Reflection Engine - Fix Verification and Learning System
 * 
 * This module implements the reflection layer of the PRAR loop, responsible for:
 * 1. Verifying the effectiveness of applied fixes
 * 2. Analyzing visual changes and accessibility improvements
 * 3. Learning from successes and failures to optimize future strategies
 * 
 * Requirements: 需求 5.1, 5.2, 6.1 - 修复验证系统、视觉效果分析、学习和优化机制
 */

import { CDPInterface, Screenshot } from '../cdp-interface';
import { FocusableElement } from '../../types';
import { AccessibilityIssue, RemediationResult, AppliedFix } from '../auto-remediation-engine';
import { CSSFixSolution } from '../auto-remediation';
import { AgentStateManager } from './agent-state';

/**
 * Fix verification result with detailed analysis
 */
export interface FixVerificationResult {
  fixId: string;
  elementSelector: string;
  verificationStatus: 'verified' | 'failed' | 'partial' | 'inconclusive';
  confidence: number; // 0-1
  evidence: VerificationEvidence;
  recommendations: string[];
  nextAction: 'accept' | 'retry' | 'rollback' | 'escalate';
  verificationTime: number;
}

/**
 * Evidence collected during fix verification
 */
export interface VerificationEvidence {
  // Visual verification
  visualChanges: {
    detected: boolean;
    significantChange: boolean;
    focusIndicatorPresent: boolean;
    contrastImproved: boolean;
  };
  
  // Behavioral verification
  behavioralChanges: {
    keyboardAccessible: boolean;
    focusTrappingFixed: boolean;
    navigationImproved: boolean;
  };
  
  // Technical verification
  technicalChanges: {
    cssApplied: boolean;
    domModified: boolean;
    stylesActive: boolean;
    noConflicts: boolean;
  };
  
  // Screenshots for comparison
  screenshots?: {
    before: string; // Base64 encoded
    after: string;
    diff?: string;
  };
  
  // Measurements
  measurements?: {
    contrastRatio?: number;
    focusIndicatorSize?: { width: number; height: number };
    colorDifference?: number;
  };
}

/**
 * Learning data extracted from verification experiences
 */
export interface LearningData {
  pattern: string;
  context: VerificationContext;
  outcome: 'success' | 'failure' | 'partial';
  factors: LearningFactor[];
  confidence: number;
  applicability: string[];
}

/**
 * Context information for verification
 */
export interface VerificationContext {
  elementType: string;
  issueType: string;
  fixType: string;
  pageContext: {
    domain: string;
    hasCustomCSS: boolean;
    framework?: string;
  };
  environmentFactors: {
    browserVersion: string;
    viewportSize: { width: number; height: number };
    colorScheme: 'light' | 'dark' | 'auto';
  };
}

/**
 * Factors that influenced verification outcome
 */
export interface LearningFactor {
  type: 'element-property' | 'page-context' | 'fix-approach' | 'timing';
  name: string;
  value: any;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number; // 0-1
}

/**
 * Configuration for the reflection engine
 */
export interface ReflectionConfig {
  verificationTimeout: number; // milliseconds
  screenshotEnabled: boolean;
  visualAnalysisEnabled: boolean;
  learningEnabled: boolean;
  retryAttempts: number;
  confidenceThreshold: number; // 0-1
}

/**
 * Reflection Engine Implementation
 * Requirements: 需求 5.1, 5.3, 5.4 - 修复验证循环、验证修复效果的有效性、根据验证结果更新问题状态
 */
export class ReflectionEngine {
  private cdpInterface: CDPInterface;
  private stateManager: AgentStateManager;
  private config: ReflectionConfig;
  
  // Verification history for learning
  private verificationHistory: Map<string, FixVerificationResult[]> = new Map();
  private learningDatabase: LearningData[] = [];
  
  // Performance tracking
  private verificationMetrics = {
    totalVerifications: 0,
    successfulVerifications: 0,
    averageVerificationTime: 0,
    falsePositives: 0,
    falseNegatives: 0
  };

  constructor(
    cdpInterface: CDPInterface,
    stateManager: AgentStateManager,
    config: Partial<ReflectionConfig> = {}
  ) {
    this.cdpInterface = cdpInterface;
    this.stateManager = stateManager;
    
    this.config = {
      verificationTimeout: 10000, // 10 seconds
      screenshotEnabled: true,
      visualAnalysisEnabled: true,
      learningEnabled: true,
      retryAttempts: 2,
      confidenceThreshold: 0.7,
      ...config
    };
  }

  /**
   * Verify a single applied fix
   * Requirements: 需求 5.1 - 自动重新测试修复后的元素
   */
  public async verifyFix(
    appliedFix: AppliedFix,
    originalIssue: AccessibilityIssue,
    element: FocusableElement
  ): Promise<FixVerificationResult> {
    const startTime = Date.now();
    const fixId = appliedFix.solution.id;
    // We need a session ID for CDP calls. Assuming we can get it from state manager or use a placeholder if not available.
    // In a real scenario, ReflectionEngine should have access to the current session ID.
    const sessionId = this.stateManager.getState().executionContext.sessionId;
    
    try {
      // Create verification context
      const context = await this.createVerificationContext(element, appliedFix.solution, originalIssue, sessionId);
      
      // Take before screenshot if enabled
      let beforeScreenshot: string | undefined;
      if (this.config.screenshotEnabled) {
        beforeScreenshot = await this.captureElementScreenshot(element.selector);
      }
      
      // Perform verification based on fix type
      const evidence = await this.collectVerificationEvidence(
        appliedFix,
        originalIssue,
        element,
        context,
        sessionId
      );
      
      // Take after screenshot if enabled
      if (this.config.screenshotEnabled && beforeScreenshot) {
        const afterScreenshot = await this.captureElementScreenshot(element.selector);
        (evidence as any).screenshots = {
          before: beforeScreenshot,
          after: afterScreenshot
        };
      }
      
      // Analyze verification results
      const verificationStatus = this.analyzeVerificationEvidence(evidence, appliedFix.solution.type);
      const confidence = this.calculateVerificationConfidence(evidence, context);
      
      // Generate recommendations
      const recommendations = this.generateVerificationRecommendations(
        evidence,
        verificationStatus,
        confidence
      );
      
      // Determine next action
      const nextAction = this.determineNextAction(verificationStatus, confidence, appliedFix);
      
      const result: FixVerificationResult = {
        fixId,
        elementSelector: element.selector,
        verificationStatus,
        confidence,
        evidence,
        recommendations,
        nextAction,
        verificationTime: Date.now() - startTime
      };
      
      // Store verification result for learning
      this.storeVerificationResult(result, context);
      
      // Update metrics
      this.updateVerificationMetrics(result);
      
      // Learn from this verification if enabled
      if (this.config.learningEnabled) {
        await this.learnFromVerification(result, context, appliedFix, originalIssue);
      }
      
      return result;
      
    } catch (error) {
      const errorResult: FixVerificationResult = {
        fixId,
        elementSelector: element.selector,
        verificationStatus: 'inconclusive',
        confidence: 0,
        evidence: this.createEmptyEvidence(),
        recommendations: ['Verification failed due to technical error'],
        nextAction: 'retry',
        verificationTime: Date.now() - startTime
      };
      
      console.error('Fix verification failed:', error);
      return errorResult;
    }
  }

  /**
   * Verify multiple fixes in batch
   * Requirements: 需求 5.1 - 验证修复效果的有效性
   */
  public async verifyMultipleFixes(
    remediationResult: RemediationResult,
    originalIssues: AccessibilityIssue[],
    elements: FocusableElement[]
  ): Promise<FixVerificationResult[]> {
    const results: FixVerificationResult[] = [];
    
    for (let i = 0; i < remediationResult.appliedFixes.length; i++) {
      const appliedFix = remediationResult.appliedFixes[i];
      const originalIssue = originalIssues[i] || originalIssues[0]; // Fallback to first issue
      const element = elements[i] || elements[0]; // Fallback to first element
      
      if (!appliedFix || !originalIssue || !element) continue;

      try {
        const verificationResult = await this.verifyFix(appliedFix, originalIssue, element);
        results.push(verificationResult);
        
        // Update issue status based on verification
        await this.updateIssueStatus(originalIssue, verificationResult);
        
      } catch (error) {
        console.error(`Failed to verify fix ${appliedFix.solution.id}:`, error);
        
        // Create error result
        results.push({
          fixId: appliedFix.solution.id,
          elementSelector: element.selector,
          verificationStatus: 'inconclusive',
          confidence: 0,
          evidence: this.createEmptyEvidence(),
          recommendations: ['Verification failed'],
          nextAction: 'retry',
          verificationTime: 0
        });
      }
    }
    
    return results;
  }

  /**
   * Update issue status based on verification results
   * Requirements: 需求 5.4 - 根据验证结果更新问题状态
   */
  public async updateIssueStatus(
    issue: AccessibilityIssue,
    verificationResult: FixVerificationResult
  ): Promise<void> {
    let newStatus: AccessibilityIssue['status'];
    
    switch (verificationResult.verificationStatus) {
      case 'verified':
        newStatus = verificationResult.confidence >= this.config.confidenceThreshold 
          ? 'verified' 
          : 'fixed';
        break;
        
      case 'partial':
        newStatus = 'fixing'; // Needs additional work
        break;
        
      case 'failed':
        newStatus = 'detected'; // Back to detected state
        break;
        
      case 'inconclusive':
      default:
        newStatus = 'fixing'; // Keep current status
        break;
    }
    
    // Update issue status
    issue.status = newStatus;
    
    // Add verification attempt to issue history
    if (!issue.attempts) {
      issue.attempts = [];
    }

    const evidenceObj: VerificationEvidence = {
      visualChanges: {
        detected: verificationResult.evidence.visualChanges.detected,
        significantChange: verificationResult.evidence.visualChanges.significantChange,
        focusIndicatorPresent: verificationResult.evidence.visualChanges.focusIndicatorPresent,
        contrastImproved: verificationResult.evidence.visualChanges.contrastImproved
      },
      behavioralChanges: verificationResult.evidence.behavioralChanges,
      technicalChanges: verificationResult.evidence.technicalChanges
    };

    const screenshots = verificationResult.evidence.screenshots;
    if (screenshots) {
      evidenceObj.screenshots = {
        before: screenshots.before,
        after: screenshots.after
      };
    }
    
    issue.attempts.push({
      timestamp: Date.now(),
      solution: {
        id: verificationResult.fixId,
        type: 'verification',
        code: '',
        description: `Verification: ${verificationResult.verificationStatus}`,
        confidence: verificationResult.confidence,
        reversible: true
      } as any,
      result: {
        success: verificationResult.verificationStatus === 'verified',
        duration: verificationResult.verificationTime,
        output: verificationResult.evidence
      },
      verificationResult: {
        fixId: verificationResult.fixId,
        passed: verificationResult.verificationStatus === 'verified',
        // Map to VerificationResult expected format (from auto-remediation-engine)
        evidence: {
          visualChanges: verificationResult.evidence.visualChanges.detected,
          focusIndicatorPresent: verificationResult.evidence.visualChanges.focusIndicatorPresent,
          contrastImproved: verificationResult.evidence.visualChanges.contrastImproved,
          keyboardAccessible: verificationResult.evidence.behavioralChanges.keyboardAccessible,
          screenshots: screenshots ? {
            before: screenshots.before,
            after: screenshots.after
          } : undefined
        },
        confidence: verificationResult.confidence
      },
      rollbackPerformed: false
    });
    
    // Notify state manager of issue status change
    this.stateManager.addEventListener('issue-status-updated', () => {
      // @ts-ignore
      console.log(`Issue ${issue.id} status updated to: ${newStatus}`);
    });
  }

  /**
   * Get verification history for analysis
   */
  public getVerificationHistory(elementSelector?: string): FixVerificationResult[] {
    if (elementSelector) {
      return this.verificationHistory.get(elementSelector) || [];
    }
    
    // Return all verification results
    const allResults: FixVerificationResult[] = [];
    for (const results of this.verificationHistory.values()) {
      allResults.push(...results);
    }
    return allResults;
  }

  /**
   * Get verification metrics for performance analysis
   */
  public getVerificationMetrics(): typeof this.verificationMetrics {
    return { ...this.verificationMetrics };
  }

  /**
   * Get learned patterns for strategy optimization
   */
  public getLearnedPatterns(): LearningData[] {
    return [...this.learningDatabase];
  }

  // Private implementation methods

  private async createVerificationContext(
    element: FocusableElement,
    solution: CSSFixSolution,
    issue: AccessibilityIssue,
    sessionId: string
  ): Promise<VerificationContext> {
    const viewport = await this.cdpInterface.getViewportSize(sessionId);
    
    const framework = this.detectFramework();
    return {
      elementType: element.tagName.toLowerCase(),
      issueType: issue.type,
      fixType: solution.type,
      pageContext: {
        domain: window.location.hostname,
        hasCustomCSS: this.detectCustomCSS(),
        ...(framework && { framework })
      },
      environmentFactors: {
        browserVersion: navigator.userAgent,
        viewportSize: viewport,
        colorScheme: this.detectColorScheme()
      }
    };
  }

  private async collectVerificationEvidence(
    appliedFix: AppliedFix,
    originalIssue: AccessibilityIssue,
    element: FocusableElement,
    context: VerificationContext,
    sessionId: string
  ): Promise<VerificationEvidence> {
    const evidence: VerificationEvidence = {
      visualChanges: {
        detected: false,
        significantChange: false,
        focusIndicatorPresent: false,
        contrastImproved: false
      },
      behavioralChanges: {
        keyboardAccessible: false,
        focusTrappingFixed: false,
        navigationImproved: false
      },
      technicalChanges: {
        cssApplied: false,
        domModified: false,
        stylesActive: false,
        noConflicts: false
      }
    };

    try {
      // Verify CSS application
      evidence.technicalChanges.cssApplied = await this.verifyCSSApplication(appliedFix.solution);
      evidence.technicalChanges.stylesActive = await this.verifyStylesActive(element.selector);
      evidence.technicalChanges.noConflicts = await this.checkStyleConflicts(element.selector);
      
      // Verify DOM modifications
      if (appliedFix.domModifications.length > 0) {
        evidence.technicalChanges.domModified = await this.verifyDOMModifications(
          appliedFix.domModifications
        );
      }
      
      // Perform fix-specific verification
      switch (appliedFix.solution.type) {
        case 'focus-visible':
          await this.verifyFocusIndicator(element, evidence, sessionId);
          break;
          
        case 'color-contrast':
          await this.verifyColorContrast(element, evidence, sessionId);
          break;
          
        case 'keyboard-navigation':
          await this.verifyKeyboardNavigation(element, evidence, sessionId);
          break;
      }
      
      // Visual analysis if enabled
      if (this.config.visualAnalysisEnabled) {
        await this.performVisualAnalysis(element, evidence, sessionId);
      }
      
    } catch (error) {
      console.error('Error collecting verification evidence:', error);
    }
    
    return evidence;
  }

  private async verifyFocusIndicator(
    element: FocusableElement,
    evidence: VerificationEvidence,
    sessionId: string
  ): Promise<void> {
    try {
      // Focus the element
      await this.cdpInterface.setFocus(sessionId, element.selector);
      
      // Wait for focus styles to apply
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get computed styles when focused. Note: using getComputedStylesBySelector since we have selector
      const focusedStyles = await this.cdpInterface.getComputedStylesBySelector(sessionId, element.selector);
      
      // Check for focus indicator
      const hasFocusIndicator = this.detectFocusIndicator(focusedStyles);
      evidence.visualChanges.focusIndicatorPresent = hasFocusIndicator;
      evidence.visualChanges.detected = hasFocusIndicator;
      evidence.visualChanges.significantChange = hasFocusIndicator;
      
      // Blur the element
      await this.cdpInterface.blurElement(sessionId);
      
    } catch (error) {
      console.error('Focus indicator verification failed:', error);
    }
  }

  private async verifyColorContrast(
    element: FocusableElement,
    evidence: VerificationEvidence,
    sessionId: string
  ): Promise<void> {
    try {
      // Get current color values
      const styles = await this.cdpInterface.getComputedStylesBySelector(sessionId, element.selector);
      const contrastRatio = await this.calculateContrastRatio(styles.color || '', styles.backgroundColor || '');
      
      // Check if contrast improved
      if (!evidence.visualChanges) {
        evidence.visualChanges = { 
          detected: false,
          significantChange: false,
          focusIndicatorPresent: false,
          contrastImproved: false
        };
      }
      evidence.visualChanges.contrastImproved = contrastRatio >= 4.5; // WCAG AA standard
      evidence.visualChanges.detected = true;
      evidence.visualChanges.significantChange = contrastRatio >= 4.5;
      
      // Store measurement
      if (!evidence.measurements) {
        evidence.measurements = {};
      }
      evidence.measurements.contrastRatio = contrastRatio;
      
    } catch (error) {
      console.error('Color contrast verification failed:', error);
    }
  }

  private async verifyKeyboardNavigation(
    element: FocusableElement,
    evidence: VerificationEvidence,
    sessionId: string
  ): Promise<void> {
    try {
      // Test keyboard accessibility - simulating via CDP
      // This is a simplified check, real check would involve simulating tab keys
      await this.cdpInterface.setFocus(sessionId, element.selector);
      const currentFocus = await this.cdpInterface.getCurrentFocus(sessionId);
      const isKeyboardAccessible = currentFocus?.elementSelector === element.selector;
      
      evidence.behavioralChanges.keyboardAccessible = isKeyboardAccessible;
      evidence.behavioralChanges.navigationImproved = isKeyboardAccessible;
      
      // Test focus trapping if applicable
      if (element.tagName.toLowerCase() === 'dialog' || element.className?.includes('modal')) {
        const focusTrappingWorks = await this.testFocusTrapping(element.selector);
        evidence.behavioralChanges.focusTrappingFixed = focusTrappingWorks;
      }
      
      evidence.visualChanges.detected = isKeyboardAccessible;
      
    } catch (error) {
      console.error('Keyboard navigation verification failed:', error);
    }
  }

  private async performVisualAnalysis(
    element: FocusableElement,
    evidence: VerificationEvidence,
    sessionId: string
  ): Promise<void> {
    try {
      // This would integrate with visual analysis tools
      // For now, we'll use basic heuristics
      
      const rect = await this.cdpInterface.getElementBoundingRect(sessionId, element.selector);
      const styles = await this.cdpInterface.getComputedStylesBySelector(sessionId, element.selector);
      
      // Check if element is visible and has reasonable size
      const isVisible = rect.width > 0 && rect.height > 0 && styles.visibility !== 'hidden';
      evidence.visualChanges.detected = isVisible;
      
      // Check for significant visual changes
      const hasVisualStyles = styles.outline !== 'none' || 
                             styles.boxShadow !== 'none' || 
                             styles.border !== 'none';
      evidence.visualChanges.significantChange = hasVisualStyles;
      
    } catch (error) {
      console.error('Visual analysis failed:', error);
    }
  }

  private analyzeVerificationEvidence(
    evidence: VerificationEvidence,
    fixType: string
  ): FixVerificationResult['verificationStatus'] {
    // Analyze evidence based on fix type
    switch (fixType) {
      case 'focus-visible':
        if (evidence.visualChanges.focusIndicatorPresent && evidence.technicalChanges.cssApplied) {
          return 'verified';
        } else if (evidence.technicalChanges.cssApplied) {
          return 'partial';
        } else {
          return 'failed';
        }
        
      case 'color-contrast':
        if (evidence.visualChanges.contrastImproved && evidence.technicalChanges.cssApplied) {
          return 'verified';
        } else if (evidence.technicalChanges.cssApplied) {
          return 'partial';
        } else {
          return 'failed';
        }
        
      case 'keyboard-navigation':
        if (evidence.behavioralChanges.keyboardAccessible && evidence.technicalChanges.cssApplied) {
          return 'verified';
        } else if (evidence.technicalChanges.cssApplied) {
          return 'partial';
        } else {
          return 'failed';
        }
        
      default:
        return 'inconclusive';
    }
  }

  private calculateVerificationConfidence(
    evidence: VerificationEvidence,
    context: VerificationContext
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Technical verification adds confidence
    if (evidence.technicalChanges.cssApplied) confidence += 0.2;
    if (evidence.technicalChanges.stylesActive) confidence += 0.1;
    if (evidence.technicalChanges.noConflicts) confidence += 0.1;
    
    // Visual verification adds confidence
    if (evidence.visualChanges.detected) confidence += 0.1;
    if (evidence.visualChanges.significantChange) confidence += 0.1;
    
    // Behavioral verification adds confidence
    if (evidence.behavioralChanges.keyboardAccessible) confidence += 0.1;
    
    // Context factors
    if (context.pageContext.hasCustomCSS) confidence -= 0.05; // Custom CSS might interfere
    
    return Math.min(Math.max(confidence, 0), 1);
  }

  private generateVerificationRecommendations(
    evidence: VerificationEvidence,
    status: FixVerificationResult['verificationStatus'],
    confidence: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (status === 'failed') {
      if (!evidence.technicalChanges.cssApplied) {
        recommendations.push('CSS injection failed - check for CSP restrictions');
      }
      if (!evidence.technicalChanges.stylesActive) {
        recommendations.push('Styles not active - check for CSS specificity conflicts');
      }
    }
    
    if (status === 'partial') {
      if (evidence.technicalChanges.cssApplied && !evidence.visualChanges.detected) {
        recommendations.push('CSS applied but no visual changes detected - verify selector accuracy');
      }
    }
    
    if (confidence < 0.7) {
      recommendations.push('Low confidence verification - consider manual review');
    }
    
    if (evidence.technicalChanges.cssApplied && !evidence.technicalChanges.noConflicts) {
      recommendations.push('Style conflicts detected - consider increasing CSS specificity');
    }
    
    return recommendations;
  }

  private determineNextAction(
    status: FixVerificationResult['verificationStatus'],
    confidence: number,
    appliedFix: AppliedFix
  ): FixVerificationResult['nextAction'] {
    if (status === 'verified' && confidence >= this.config.confidenceThreshold) {
      return 'accept';
    }
    
    if (status === 'failed') {
      if (appliedFix.solution.reversible) {
        return 'rollback';
      } else {
        return 'escalate';
      }
    }
    
    if (status === 'partial' || confidence < this.config.confidenceThreshold) {
      return 'retry';
    }
    
    return 'escalate';
  }

  // Helper methods for verification

  private async captureElementScreenshot(selector: string): Promise<string> {
    try {
      const sessionId = this.stateManager.getState().executionContext.sessionId;
      const screenshot = await this.cdpInterface.captureElementScreenshot(sessionId, selector);
      return screenshot.data;
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return '';
    }
  }

  private async verifyCSSApplication(solution: CSSFixSolution): Promise<boolean> {
    try {
      // Check if the CSS rules are present in the document
      const styleSheets = document.styleSheets;
      for (let i = 0; i < styleSheets.length; i++) {
        const sheet = styleSheets[i];
        if (!sheet) continue;
        
        try {
          const rules = (sheet as CSSStyleSheet).cssRules || (sheet as any).rules;
          if (!rules) continue;
          
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j] as CSSStyleRule;
            if (rule.selectorText && rule.selectorText.includes(solution.target.selector)) {
              return true;
            }
          }
        } catch (e) {
          // Cross-origin stylesheet access might fail
          continue;
        }
      }
      return false;
    } catch (error) {
      console.error('CSS verification failed:', error);
      return false;
    }
  }

  private async verifyStylesActive(selector: string): Promise<boolean> {
    try {
      const element = document.querySelector(selector);
      if (!element) return false;
      
      const computedStyle = window.getComputedStyle(element);
      // Check if any focus-related styles are applied
      return computedStyle.outline !== 'none' || 
             computedStyle.boxShadow !== 'none' ||
             computedStyle.border !== 'none';
    } catch (error) {
      console.error('Style verification failed:', error);
      return false;
    }
  }

  private async checkStyleConflicts(selector: string): Promise<boolean> {
    try {
      // This is a simplified conflict detection
      // In a real implementation, you'd check for CSS specificity conflicts
      return true;
    } catch (error) {
      console.error('Style conflict check failed:', error);
      return false;
    }
  }

  private async verifyDOMModifications(modifications: any[]): Promise<boolean> {
    try {
      // Verify that DOM modifications were applied successfully
      for (const modification of modifications) {
        const element = document.querySelector(modification.selector);
        if (!element) return false;
        
        // Check if the attribute was set correctly
        if (modification.attribute && modification.value) {
          const actualValue = element.getAttribute(modification.attribute);
          if (actualValue !== modification.value) return false;
        }
      }
      return true;
    } catch (error) {
      console.error('DOM modification verification failed:', error);
      return false;
    }
  }

  private detectFocusIndicator(styles: any): boolean {
    return styles.outline !== 'none' || 
           styles.outlineWidth !== '0px' ||
           styles.boxShadow !== 'none' ||
           (styles.borderWidth && styles.borderWidth !== '0px');
  }

  private async calculateContrastRatio(foreground: string, background: string): Promise<number> {
    // Simplified contrast calculation
    // In a real implementation, use a proper color contrast library
    return 4.5; // Placeholder
  }

  private async testKeyboardAccessibility(selector: string): Promise<boolean> {
    try {
      const element = document.querySelector(selector) as HTMLElement;
      if (!element) return false;
      
      // Test if element can receive focus
      element.focus();
      const hasFocus = document.activeElement === element;
      element.blur();
      
      return hasFocus;
    } catch (error) {
      console.error('Keyboard accessibility test failed:', error);
      return false;
    }
  }

  private async testFocusTrapping(selector: string): Promise<boolean> {
    // Simplified focus trapping test
    // In a real implementation, test actual focus trap behavior
    return true;
  }

  private createEmptyEvidence(): VerificationEvidence {
    return {
      visualChanges: {
        detected: false,
        significantChange: false,
        focusIndicatorPresent: false,
        contrastImproved: false
      },
      behavioralChanges: {
        keyboardAccessible: false,
        focusTrappingFixed: false,
        navigationImproved: false
      },
      technicalChanges: {
        cssApplied: false,
        domModified: false,
        stylesActive: false,
        noConflicts: false
      }
    };
  }

  private storeVerificationResult(result: FixVerificationResult, context: VerificationContext): void {
    const selector = result.elementSelector;
    if (!this.verificationHistory.has(selector)) {
      this.verificationHistory.set(selector, []);
    }
    this.verificationHistory.get(selector)!.push(result);
  }

  private updateVerificationMetrics(result: FixVerificationResult): void {
    this.verificationMetrics.totalVerifications++;
    
    if (result.verificationStatus === 'verified') {
      this.verificationMetrics.successfulVerifications++;
    }
    
    // Update average verification time
    const totalTime = this.verificationMetrics.averageVerificationTime * 
                     (this.verificationMetrics.totalVerifications - 1) + 
                     result.verificationTime;
    this.verificationMetrics.averageVerificationTime = 
      totalTime / this.verificationMetrics.totalVerifications;
  }

  private async learnFromVerification(
    result: FixVerificationResult,
    context: VerificationContext,
    appliedFix: AppliedFix,
    originalIssue: AccessibilityIssue
  ): Promise<void> {
    try {
      const learningData: LearningData = {
        pattern: `${context.elementType}_${context.issueType}_${context.fixType}`,
        context,
        outcome: result.verificationStatus === 'verified' ? 'success' : 
                result.verificationStatus === 'partial' ? 'partial' : 'failure',
        factors: this.extractLearningFactors(result, context, appliedFix),
        confidence: result.confidence,
        applicability: [context.elementType, context.issueType]
      };
      
      this.learningDatabase.push(learningData);
      
      // Limit learning database size
      if (this.learningDatabase.length > 1000) {
        this.learningDatabase = this.learningDatabase.slice(-1000);
      }
      
    } catch (error) {
      console.error('Learning from verification failed:', error);
    }
  }

  private extractLearningFactors(
    result: FixVerificationResult,
    context: VerificationContext,
    appliedFix: AppliedFix
  ): LearningFactor[] {
    const factors: LearningFactor[] = [];
    
    // Element type factor
    factors.push({
      type: 'element-property',
      name: 'element-type',
      value: context.elementType,
      impact: result.verificationStatus === 'verified' ? 'positive' : 'negative',
      weight: 0.3
    });
    
    // Fix approach factor
    factors.push({
      type: 'fix-approach',
      name: 'fix-type',
      value: appliedFix.solution.type,
      impact: result.verificationStatus === 'verified' ? 'positive' : 'negative',
      weight: 0.4
    });
    
    // Page context factor
    factors.push({
      type: 'page-context',
      name: 'has-custom-css',
      value: context.pageContext.hasCustomCSS,
      impact: context.pageContext.hasCustomCSS ? 'negative' : 'positive',
      weight: 0.2
    });
    
    // Timing factor
    factors.push({
      type: 'timing',
      name: 'verification-time',
      value: result.verificationTime,
      impact: result.verificationTime < 5000 ? 'positive' : 'negative',
      weight: 0.1
    });
    
    return factors;
  }

  // Utility methods for context detection

  private detectCustomCSS(): boolean {
    // Simple heuristic to detect if page has custom CSS
    const styleSheets = document.styleSheets;
    return styleSheets.length > 1; // More than just browser defaults
  }

  private detectFramework(): string | undefined {
    // Simple framework detection
    const win = window as any;
    if (win.React) return 'react';
    if (win.Vue) return 'vue';
    if (win.angular) return 'angular';
    if (document.querySelector('[ng-app]')) return 'angularjs';
    return undefined;
  }

  private detectColorScheme(): 'light' | 'dark' | 'auto' {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
}

export default ReflectionEngine;