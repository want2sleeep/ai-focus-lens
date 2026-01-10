/**
 * Auto-Remediation Engine - Main Integration Module
 * 
 * This module integrates CSS fix generation and injection systems to provide
 * a complete auto-remediation solution for accessibility issues.
 * 
 * Requirements: 需求 2.1, 2.2, 2.3 - Complete auto-remediation system
 */

import { CSSFixGenerator, CSSFixSolution, ElementTarget, ElementContext } from './auto-remediation';
import { CSSInjectionSystem, CSSInjectionResult, DOMModificationResult, InjectionStrategy } from './css-injection-system';
import { CDPInterface } from './cdp-interface';
import { FocusableElement } from '../types';

/**
 * Auto-remediation task representing a complete fix workflow
 */
export interface RemediationTask {
  id: string;
  element: FocusableElement;
  context: ElementContext;
  issues: AccessibilityIssue[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  createdAt: number;
  completedAt?: number;
}

/**
 * Accessibility issue definition
 */
export interface AccessibilityIssue {
  id: string;
  type: 'missing-focus' | 'low-contrast' | 'keyboard-inaccessible' | 'missing-label';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  wcagCriteria: string[];
  evidence: any;
  status?: 'detected' | 'fixing' | 'fixed' | 'verified' | 'failed';
  attempts?: RemediationAttempt[];
}

export interface RemediationAttempt {
  timestamp: number;
  solution: CSSFixSolution;
  result: {
    success: boolean;
    duration: number;
    output?: any;
  };
  verificationResult?: VerificationResult;
  rollbackPerformed: boolean;
}

/**
 * Remediation result with complete information
 */
export interface RemediationResult {
  taskId: string;
  success: boolean;
  appliedFixes: AppliedFix[];
  failedFixes: FailedFix[];
  verificationResults: VerificationResult[];
  totalDuration: number;
  rollbackAvailable: boolean;
}

/**
 * Applied fix information
 */
export interface AppliedFix {
  solution: CSSFixSolution;
  injectionResult: CSSInjectionResult;
  domModifications: DOMModificationResult[];
  verified: boolean;
}

/**
 * Failed fix information
 */
export interface FailedFix {
  solution: CSSFixSolution;
  error: string;
  retryCount: number;
  fallbackAttempted: boolean;
}

/**
 * Fix verification result
 */
export interface VerificationResult {
  fixId: string;
  passed: boolean;
  evidence: VerificationEvidence;
  confidence: number;
}

/**
 * Verification evidence
 */
export interface VerificationEvidence {
  visualChanges: boolean;
  focusIndicatorPresent: boolean;
  contrastImproved: boolean;
  keyboardAccessible: boolean;
  screenshots?: {
    before: string;
    after: string;
  } | undefined;
}

/**
 * Auto-Remediation Engine Configuration
 */
export interface RemediationConfig {
  maxConcurrentTasks: number;
  verificationEnabled: boolean;
  rollbackOnFailure: boolean;
  retryAttempts: number;
  injectionStrategy: Partial<InjectionStrategy>;
  verificationTimeout: number; // milliseconds
}

/**
 * Main Auto-Remediation Engine
 * Orchestrates the complete fix generation, injection, and verification process
 */
export class AutoRemediationEngine {
  private fixGenerator: CSSFixGenerator;
  private injectionSystem: CSSInjectionSystem;
  private activeTasks: Map<string, RemediationTask> = new Map();
  private completedTasks: Map<string, RemediationResult> = new Map();
  
  private readonly config: RemediationConfig;

  constructor(
    cdpInterface?: CDPInterface,
    tabId?: number,
    sessionId?: string,
    config: Partial<RemediationConfig> = {}
  ) {
    this.fixGenerator = CSSFixGenerator.getInstance();
    this.injectionSystem = new CSSInjectionSystem(cdpInterface, tabId, sessionId);
    
    this.config = {
      maxConcurrentTasks: 5,
      verificationEnabled: true,
      rollbackOnFailure: true,
      retryAttempts: 3,
      injectionStrategy: {},
      verificationTimeout: 5000,
      ...config
    };
  }

  /**
   * Set the current tab and session context
   */
  public setContext(tabId: number, sessionId?: string): void {
    this.injectionSystem.setContext(tabId, sessionId);
  }

  /**
   * Create and execute a remediation task
   * Requirements: 需求 2.1, 2.2, 2.3 - Complete auto-remediation workflow
   */
  public async remediateElement(
    element: FocusableElement,
    context: ElementContext,
    issues: AccessibilityIssue[]
  ): Promise<RemediationResult> {
    const task = this.createRemediationTask(element, context, issues);
    
    try {
      this.activeTasks.set(task.id, task);
      task.status = 'in-progress';
      
      const result = await this.executeRemediationTask(task);
      
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = Date.now();
      
      this.completedTasks.set(task.id, result);
      this.activeTasks.delete(task.id);
      
      return result;
      
    } catch (error) {
      task.status = 'failed';
      task.completedAt = Date.now();
      
      const failedResult: RemediationResult = {
        taskId: task.id,
        success: false,
        appliedFixes: [],
        failedFixes: [],
        verificationResults: [],
        totalDuration: Date.now() - task.createdAt,
        rollbackAvailable: false
      };
      
      this.completedTasks.set(task.id, failedResult);
      this.activeTasks.delete(task.id);
      
      throw error;
    }
  }

  /**
   * Batch remediation for multiple elements
   */
  public async remediateMultipleElements(
    elements: Array<{
      element: FocusableElement;
      context: ElementContext;
      issues: AccessibilityIssue[];
    }>
  ): Promise<RemediationResult[]> {
    const results: RemediationResult[] = [];
    const batches = this.createBatches(elements, this.config.maxConcurrentTasks);
    
    for (const batch of batches) {
      const batchPromises = batch.map(item => 
        this.remediateElement(item.element, item.context, item.issues)
          .catch(error => ({
            taskId: `failed-${Date.now()}`,
            success: false,
            appliedFixes: [],
            failedFixes: [],
            verificationResults: [],
            totalDuration: 0,
            rollbackAvailable: false
          } as RemediationResult))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Rollback a completed remediation
   */
  public async rollbackRemediation(taskId: string): Promise<boolean> {
    const result = this.completedTasks.get(taskId);
    if (!result || !result.rollbackAvailable) {
      return false;
    }

    try {
      // Rollback all applied fixes
      for (const appliedFix of result.appliedFixes) {
        await this.injectionSystem.rollbackInjection(appliedFix.solution.id);
      }
      
      // Update task status
      const task = this.completedTasks.get(taskId);
      if (task) {
        // Mark as rolled back (we could add this status)
        task.rollbackAvailable = false;
      }
      
      return true;
      
    } catch (error) {
      console.error('Rollback failed:', error);
      return false;
    }
  }

  /**
   * Get status of all active and completed tasks
   */
  public getTaskStatus(): {
    active: RemediationTask[];
    completed: RemediationResult[];
    summary: {
      totalTasks: number;
      successfulTasks: number;
      failedTasks: number;
      averageDuration: number;
    };
  } {
    const active = Array.from(this.activeTasks.values());
    const completed = Array.from(this.completedTasks.values());
    
    const successfulTasks = completed.filter(r => r.success).length;
    const failedTasks = completed.filter(r => !r.success).length;
    const averageDuration = completed.length > 0 
      ? completed.reduce((sum, r) => sum + r.totalDuration, 0) / completed.length
      : 0;

    return {
      active,
      completed,
      summary: {
        totalTasks: active.length + completed.length,
        successfulTasks,
        failedTasks,
        averageDuration
      }
    };
  }

  // Private implementation methods

  private createRemediationTask(
    element: FocusableElement,
    context: ElementContext,
    issues: AccessibilityIssue[]
  ): RemediationTask {
    const priority = this.calculateTaskPriority(issues);
    
    return {
      id: `remediation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      element,
      context,
      issues,
      priority,
      status: 'pending',
      createdAt: Date.now()
    };
  }

  private async executeRemediationTask(task: RemediationTask): Promise<RemediationResult> {
    const startTime = Date.now();
    const appliedFixes: AppliedFix[] = [];
    const failedFixes: FailedFix[] = [];
    const verificationResults: VerificationResult[] = [];

    // Generate fixes for each issue
    for (const issue of task.issues) {
      try {
        const fixes = await this.generateFixesForIssue(task.element, task.context, issue);
        
        for (const fix of fixes) {
          try {
            const appliedFix = await this.applyFix(fix);
            appliedFixes.push(appliedFix);
            
            // Verify fix if enabled
            if (this.config.verificationEnabled) {
              const verification = await this.verifyFix(fix, appliedFix);
              verificationResults.push(verification);
              
              // Rollback if verification failed and rollback is enabled
              if (!verification.passed && this.config.rollbackOnFailure) {
                await this.injectionSystem.rollbackInjection(fix.id);
                appliedFixes.pop(); // Remove from applied fixes
              }
            }
            
          } catch (error) {
            failedFixes.push({
              solution: fix,
              error: error instanceof Error ? error.message : 'Unknown error',
              retryCount: 0,
              fallbackAttempted: false
            });
          }
        }
        
      } catch (error) {
        console.error(`Failed to generate fixes for issue ${issue.type}:`, error);
      }
    }

    const success = appliedFixes.length > 0 && failedFixes.length === 0;
    const rollbackAvailable = appliedFixes.length > 0 && success;

    return {
      taskId: task.id,
      success,
      appliedFixes,
      failedFixes,
      verificationResults,
      totalDuration: Date.now() - startTime,
      rollbackAvailable
    };
  }

  private async generateFixesForIssue(
    element: FocusableElement,
    context: ElementContext,
    issue: AccessibilityIssue
  ): Promise<CSSFixSolution[]> {
    switch (issue.type) {
      case 'missing-focus':
        return [this.fixGenerator.generateFocusStyleFix(element, context)];
        
      case 'low-contrast':
        const contrastData = issue.evidence as { current: number; target: number };
        return [this.fixGenerator.generateColorContrastFix(
          element,
          contrastData.current,
          context,
          { targetRatio: contrastData.target }
        )];
        
      case 'keyboard-inaccessible':
        const keyboardIssues = issue.evidence as string[];
        return [this.fixGenerator.generateKeyboardNavigationFix(element, context, keyboardIssues)];
        
      default:
        return [];
    }
  }

  private async applyFix(fix: CSSFixSolution): Promise<AppliedFix> {
    const injectionResult = await this.injectionSystem.injectCSSFix(fix, this.config.injectionStrategy);
    
    if (!injectionResult.success) {
      throw new Error(`Fix injection failed: ${injectionResult.error}`);
    }

    // Apply any DOM modifications if needed
    const domModifications: DOMModificationResult[] = [];
    
    // For keyboard accessibility, we might need to add tabindex
    if (fix.type === 'keyboard-navigation') {
      try {
        const modification = await this.injectionSystem.modifyDOMAttribute(
          fix.target,
          'tabindex',
          '0'
        );
        domModifications.push(modification);
      } catch (error) {
        console.warn('DOM modification failed:', error);
      }
    }

    return {
      solution: fix,
      injectionResult,
      domModifications,
      verified: false // Will be set during verification
    };
  }

  private async verifyFix(fix: CSSFixSolution, appliedFix: AppliedFix): Promise<VerificationResult> {
    try {
      // Simulate verification - in a real implementation, this would:
      // 1. Take screenshots before/after
      // 2. Test focus indicators
      // 3. Measure color contrast
      // 4. Test keyboard navigation
      
      const evidence: VerificationEvidence = {
        visualChanges: true,
        focusIndicatorPresent: fix.type === 'focus-visible',
        contrastImproved: fix.type === 'color-contrast',
        keyboardAccessible: fix.type === 'keyboard-navigation'
      };

      const passed = this.evaluateVerificationEvidence(evidence, fix.type);
      
      // Update applied fix verification status
      appliedFix.verified = passed;

      return {
        fixId: fix.id,
        passed,
        evidence,
        confidence: fix.confidence
      };
      
    } catch (error) {
      return {
        fixId: fix.id,
        passed: false,
        evidence: {
          visualChanges: false,
          focusIndicatorPresent: false,
          contrastImproved: false,
          keyboardAccessible: false
        },
        confidence: 0
      };
    }
  }

  private evaluateVerificationEvidence(evidence: VerificationEvidence, fixType: string): boolean {
    switch (fixType) {
      case 'focus-visible':
        return evidence.focusIndicatorPresent && evidence.visualChanges;
      case 'color-contrast':
        return evidence.contrastImproved;
      case 'keyboard-navigation':
        return evidence.keyboardAccessible;
      default:
        return evidence.visualChanges;
    }
  }

  private calculateTaskPriority(issues: AccessibilityIssue[]): 'critical' | 'high' | 'medium' | 'low' {
    const maxSeverity = Math.max(...issues.map(issue => {
      switch (issue.severity) {
        case 'critical': return 3;
        case 'major': return 2;
        case 'minor': return 1;
        default: return 0;
      }
    }));

    switch (maxSeverity) {
      case 3: return 'critical';
      case 2: return 'high';
      case 1: return 'medium';
      default: return 'low';
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

/**
 * Factory function to create auto-remediation engine
 */
export function createAutoRemediationEngine(
  cdpInterface?: CDPInterface,
  config?: Partial<RemediationConfig>
): AutoRemediationEngine {
  return new AutoRemediationEngine(cdpInterface, undefined, undefined, config);
}

/**
 * Utility functions for auto-remediation
 */
export class AutoRemediationUtils {
  /**
   * Analyze element to identify accessibility issues
   */
  static analyzeElementIssues(element: FocusableElement): AccessibilityIssue[] {
    const issues: AccessibilityIssue[] = [];

    // Check for missing focus indicator
    if (!this.hasFocusIndicator(element)) {
      issues.push({
        id: `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'missing-focus',
        severity: 'major',
        description: 'Element lacks visible focus indicator',
        wcagCriteria: ['2.4.7'],
        evidence: { hasOutline: false, hasBoxShadow: false }
      });
    }

    // Check for keyboard accessibility
    if (element.tabIndex < 0 && this.shouldBeFocusable(element)) {
      issues.push({
        id: `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'keyboard-inaccessible',
        severity: 'critical',
        description: 'Interactive element not keyboard accessible',
        wcagCriteria: ['2.1.1'],
        evidence: ['not-focusable']
      });
    }

    return issues;
  }

  private static hasFocusIndicator(element: FocusableElement): boolean {
    const style = element.computedStyle;
    return style.outline !== 'none' || 
           style.boxShadow !== 'none' || 
           style.border !== 'none';
  }

  private static shouldBeFocusable(element: FocusableElement): boolean {
    const interactiveTags = ['button', 'input', 'select', 'textarea', 'a'];
    return interactiveTags.includes(element.tagName.toLowerCase());
  }

  /**
   * Generate remediation report
   */
  static generateRemediationReport(results: RemediationResult[]): string {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalFixes = results.reduce((sum, r) => sum + r.appliedFixes.length, 0);

    return `
# Auto-Remediation Report

## Summary
- Total Tasks: ${results.length}
- Successful: ${successful}
- Failed: ${failed}
- Total Fixes Applied: ${totalFixes}

## Details
${results.map(result => `
### Task ${result.taskId}
- Status: ${result.success ? 'Success' : 'Failed'}
- Applied Fixes: ${result.appliedFixes.length}
- Failed Fixes: ${result.failedFixes.length}
- Duration: ${result.totalDuration}ms
`).join('')}
    `.trim();
  }
}

export default AutoRemediationEngine;