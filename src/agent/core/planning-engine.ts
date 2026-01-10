// Planning Engine for Accessibility Testing Agent
// Implements multi-step reasoning, task decomposition, and decision making

import { PerceptionData, AccessibilityIssue } from './perception-engine';
import { ExtensionError } from '../../types';

/**
 * High-level task that the agent needs to accomplish
 * Requirements: 需求 3.1, 3.3 - 任务分解和决策制定
 */
export interface HighLevelTask {
  id: string;
  type: 'full-site-audit' | 'workflow-test' | 'component-test' | 'focus-navigation-test';
  description: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  priority: 'low' | 'medium' | 'high' | 'critical';
  scope: {
    urls?: string[];
    selectors?: string[];
    workflows?: WorkflowStep[][];
  };
  constraints: {
    timeLimit?: number;
    maxElements?: number;
    skipHidden?: boolean;
  };
}

export interface WorkflowStep {
  action: 'navigate' | 'click' | 'type' | 'tab' | 'wait' | 'verify';
  target?: string;
  value?: string;
  timeout?: number;
  description: string;
}

/**
 * Sub-task created from task decomposition
 */
export interface SubTask {
  id: string;
  parentId: string;
  type: 'element-analysis' | 'interaction-test' | 'navigation-test' | 'verification';
  description: string;
  target?: string | undefined;
  expectedOutcome: string;
  dependencies: string[];
  estimatedTime: number;
  retryable: boolean;
}

/**
 * Action plan with primary and fallback actions
 * Requirements: 需求 3.1, 3.3 - 决策制定逻辑
 */
export interface ActionPlan {
  id: string;
  primaryAction: Action;
  fallbackActions: Action[];
  expectedOutcome: string;
  successCriteria: SuccessCriteria;
  timeoutMs: number;
  context: PlanningContext;
}

export interface Action {
  type: 'navigate' | 'focus' | 'click' | 'keyboard' | 'analyze' | 'verify' | 'wait';
  target?: string;
  parameters?: Record<string, any>;
  description: string;
  estimatedDuration: number;
}

export interface SuccessCriteria {
  focusChanged?: boolean;
  elementVisible?: boolean;
  styleChanged?: boolean;
  noErrors?: boolean;
  customValidation?: (result: any) => boolean;
}

export interface PlanningContext {
  currentUrl: string;
  availableElements: string[];
  previousActions: string[];
  knownIssues: AccessibilityIssue[];
  timeRemaining: number;
}

/**
 * Test strategy configuration
 * Requirements: 需求 3.3 - 策略调整机制
 */
export interface TestStrategy {
  approach: 'breadth-first' | 'depth-first' | 'priority-based' | 'adaptive';
  interactionPattern: 'sequential' | 'random' | 'user-like' | 'systematic';
  verificationLevel: 'basic' | 'comprehensive' | 'visual' | 'interactive';
  retryPolicy: RetryPolicy;
  adaptationRules: AdaptationRule[];
}

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'adaptive';
  retryableErrors: string[];
  escalationThreshold: number;
}

export interface AdaptationRule {
  condition: string;
  action: 'reduce-scope' | 'change-strategy' | 'increase-timeout' | 'skip-element';
  parameters: Record<string, any>;
}

/**
 * Failure history for learning and adaptation
 */
export interface FailureHistory {
  taskId: string;
  action: Action;
  error: ExtensionError;
  timestamp: number;
  context: PlanningContext;
  resolution?: string;
}

/**
 * Planning Engine implementation
 * Requirements: 需求 3.1, 3.3 - 创建任务分解算法，实现基础决策制定逻辑，建立策略调整机制
 */
export class PlanningEngine {
  private currentStrategy: TestStrategy;
  private taskQueue: SubTask[] = [];
  private completedTasks: SubTask[] = [];
  private failureHistory: FailureHistory[] = [];
  private knowledgeBase: PlanningKnowledgeBase;
  private reasoningChain: ReasoningStep[] = [];

  constructor(initialStrategy?: TestStrategy) {
    this.currentStrategy = initialStrategy || this.getDefaultStrategy();
    this.knowledgeBase = new PlanningKnowledgeBase();
  }

  /**
   * Decompose high-level task into executable sub-tasks
   * Requirements: 需求 3.1 - 创建任务分解算法
   */
  decomposeTask(task: HighLevelTask): SubTask[] {
    this.addReasoningStep('task-decomposition', `Decomposing task: ${task.description}`, {
      taskType: task.type,
      scope: task.scope,
      constraints: task.constraints
    });

    const subTasks: SubTask[] = [];

    switch (task.type) {
      case 'full-site-audit':
        subTasks.push(...this.decomposeFullSiteAudit(task));
        break;
      case 'workflow-test':
        subTasks.push(...this.decomposeWorkflowTest(task));
        break;
      case 'component-test':
        subTasks.push(...this.decomposeComponentTest(task));
        break;
      case 'focus-navigation-test':
        subTasks.push(...this.decomposeFocusNavigationTest(task));
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    // Apply constraints and optimization
    const optimizedTasks = this.optimizeTaskSequence(subTasks, task.constraints);
    
    this.addReasoningStep('task-optimization', `Optimized ${subTasks.length} tasks to ${optimizedTasks.length}`, {
      originalCount: subTasks.length,
      optimizedCount: optimizedTasks.length,
      constraints: task.constraints
    });

    this.taskQueue.push(...optimizedTasks);
    return optimizedTasks;
  }

  /**
   * Make decision based on current context and available options
   * Requirements: 需求 3.1, 3.3 - 实现基础决策制定逻辑
   */
  makeDecision(options: ActionOption[], context: PerceptionData): ActionPlan {
    this.addReasoningStep('decision-making', 'Evaluating action options', {
      optionCount: options.length,
      currentFocus: context.pageState.currentFocus,
      availableElements: context.pageState.focusableElements.length
    });

    // Score each option based on multiple criteria
    const scoredOptions = options.map(option => ({
      option,
      score: this.scoreActionOption(option, context)
    }));

    // Sort by score (highest first)
    scoredOptions.sort((a, b) => b.score - a.score);

    const bestOption = scoredOptions[0];
    if (!bestOption || bestOption.score < 0.3) {
      throw new Error('No viable action options available');
    }

    // Create action plan with primary and fallback actions
    const actionPlan: ActionPlan = {
      id: this.generateActionId(),
      primaryAction: bestOption.option.action,
      fallbackActions: scoredOptions.slice(1, 3).map(so => so.option.action),
      expectedOutcome: bestOption.option.expectedOutcome,
      successCriteria: bestOption.option.successCriteria,
      timeoutMs: bestOption.option.timeout || 5000,
      context: this.createPlanningContext(context)
    };

    this.addReasoningStep('decision-result', `Selected action: ${actionPlan.primaryAction.type}`, {
      primaryScore: bestOption.score,
      fallbackCount: actionPlan.fallbackActions.length,
      reasoning: bestOption.option.reasoning
    });

    return actionPlan;
  }

  /**
   * Adjust strategy based on context and failure history
   * Requirements: 需求 3.3 - 建立策略调整机制
   */
  adjustStrategy(context: PerceptionData, failures: FailureHistory[]): TestStrategy {
    this.addReasoningStep('strategy-adjustment', 'Analyzing strategy effectiveness', {
      currentStrategy: this.currentStrategy.approach,
      recentFailures: failures.length,
      contextComplexity: this.assessContextComplexity(context)
    });

    const adjustedStrategy = { ...this.currentStrategy };
    
    // Analyze failure patterns
    const failurePatterns = this.analyzeFailurePatterns(failures);
    
    // Apply adaptation rules
    for (const rule of this.currentStrategy.adaptationRules) {
      if (this.evaluateAdaptationCondition(rule.condition, context, failures)) {
        this.applyAdaptationAction(adjustedStrategy, rule);
        
        this.addReasoningStep('strategy-adaptation', `Applied rule: ${rule.action}`, {
          condition: rule.condition,
          action: rule.action,
          parameters: rule.parameters
        });
      }
    }

    // Adjust based on context complexity
    const complexity = this.assessContextComplexity(context);
    if (complexity > 0.7) {
      adjustedStrategy.approach = 'priority-based';
      adjustedStrategy.verificationLevel = 'basic';
    } else if (complexity < 0.3) {
      adjustedStrategy.verificationLevel = 'comprehensive';
    }

    // Update retry policy based on failure history
    if (failures.length > 5) {
      adjustedStrategy.retryPolicy.maxRetries = Math.max(1, adjustedStrategy.retryPolicy.maxRetries - 1);
      adjustedStrategy.retryPolicy.backoffStrategy = 'exponential';
    }

    this.currentStrategy = adjustedStrategy;
    
    this.addReasoningStep('strategy-updated', 'Strategy adjustment completed', {
      newApproach: adjustedStrategy.approach,
      newVerificationLevel: adjustedStrategy.verificationLevel,
      newMaxRetries: adjustedStrategy.retryPolicy.maxRetries
    });

    return adjustedStrategy;
  }

  /**
   * Learn from experience and update knowledge base
   * Requirements: 需求 3.3 - 策略调整机制
   */
  learnFromExperience(experience: TestExperience): void {
    this.knowledgeBase.addExperience(experience);
    
    if (experience.success) {
      this.knowledgeBase.reinforcePattern(experience.pattern);
    } else {
      this.knowledgeBase.recordFailure(experience.failure!);
      this.failureHistory.push(experience.failure!);
    }

    // Update strategy based on learning
    if (this.failureHistory.length % 10 === 0) {
      this.optimizeStrategyFromLearning();
    }
  }

  /**
   * Get current reasoning chain for transparency
   */
  getReasoningChain(): ReasoningStep[] {
    return [...this.reasoningChain];
  }

  /**
   * Get next task from queue
   */
  getNextTask(): SubTask | null {
    return this.taskQueue.shift() || null;
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string, result: any): void {
    const taskIndex = this.taskQueue.findIndex(task => task.id === taskId);
    if (taskIndex >= 0) {
      const task = this.taskQueue.splice(taskIndex, 1)[0];
      if (task) {
        this.completedTasks.push(task);
        
        this.addReasoningStep('task-completed', `Completed task: ${task.description}`, {
          taskId,
          result: result ? 'success' : 'failure',
          remainingTasks: this.taskQueue.length
        });
      }
    }
  }

  /**
   * Private helper methods
   */
  private decomposeFullSiteAudit(task: HighLevelTask): SubTask[] {
    const subTasks: SubTask[] = [];
    
    // 1. Page discovery and element identification
    const discoveryTask: SubTask = {
      id: this.generateTaskId(),
      parentId: task.id,
      type: 'element-analysis',
      description: 'Identify all focusable elements on the page',
      expectedOutcome: 'List of focusable elements with metadata',
      dependencies: [],
      estimatedTime: 2000,
      retryable: true
    };
    subTasks.push(discoveryTask);

    // 2. Focus navigation testing
    const navigationTask: SubTask = {
      id: this.generateTaskId(),
      parentId: task.id,
      type: 'navigation-test',
      description: 'Test keyboard navigation through all elements',
      expectedOutcome: 'Navigation path and focus visibility results',
      dependencies: [discoveryTask.id],
      estimatedTime: 5000,
      retryable: true
    };
    subTasks.push(navigationTask);

    // 3. Individual element verification
    const verificationTask: SubTask = {
      id: this.generateTaskId(),
      parentId: task.id,
      type: 'verification',
      description: 'Verify focus visibility for each element',
      expectedOutcome: 'Pass/fail status for each element',
      dependencies: [navigationTask.id],
      estimatedTime: 3000,
      retryable: true
    };
    subTasks.push(verificationTask);

    return subTasks;
  }

  private decomposeWorkflowTest(task: HighLevelTask): SubTask[] {
    const subTasks: SubTask[] = [];
    
    if (!task.scope.workflows) {
      return subTasks;
    }

    task.scope.workflows.forEach((workflow, _index) => {
      let lastTaskId: string | null = null;
      workflow.forEach((step, _stepIndex) => {
        const subTask: SubTask = {
          id: this.generateTaskId(),
          parentId: task.id,
          type: 'interaction-test',
          description: `Execute workflow step: ${step.description}`,
          target: step.target,
          expectedOutcome: `Step completed successfully`,
          dependencies: lastTaskId ? [lastTaskId] : [],
          estimatedTime: step.timeout || 2000,
          retryable: true
        };
        subTasks.push(subTask);
        lastTaskId = subTask.id;
      });
    });

    return subTasks;
  }

  private decomposeComponentTest(task: HighLevelTask): SubTask[] {
    const subTasks: SubTask[] = [];
    
    if (task.scope.selectors) {
      task.scope.selectors.forEach(selector => {
        subTasks.push({
          id: this.generateTaskId(),
          parentId: task.id,
          type: 'element-analysis',
          description: `Test component: ${selector}`,
          target: selector,
          expectedOutcome: 'Component accessibility verified',
          dependencies: [],
          estimatedTime: 1500,
          retryable: true
        });
      });
    }

    return subTasks;
  }

  private decomposeFocusNavigationTest(task: HighLevelTask): SubTask[] {
    return [
      {
        id: this.generateTaskId(),
        parentId: task.id,
        type: 'navigation-test',
        description: 'Test Tab key navigation forward',
        expectedOutcome: 'All elements receive focus in logical order',
        dependencies: [],
        estimatedTime: 3000,
        retryable: true
      },
      {
        id: this.generateTaskId(),
        parentId: task.id,
        type: 'navigation-test',
        description: 'Test Shift+Tab navigation backward',
        expectedOutcome: 'All elements receive focus in reverse order',
        dependencies: [],
        estimatedTime: 3000,
        retryable: true
      }
    ];
  }

  private optimizeTaskSequence(tasks: SubTask[], constraints: HighLevelTask['constraints']): SubTask[] {
    let optimizedTasks = [...tasks];

    // Apply time constraints
    if (constraints.timeLimit) {
      const totalEstimatedTime = tasks.reduce((sum, task) => sum + task.estimatedTime, 0);
      if (totalEstimatedTime > constraints.timeLimit) {
        // Prioritize tasks and remove less important ones
        optimizedTasks = this.prioritizeTasks(tasks, constraints.timeLimit);
      }
    }

    // Apply element count constraints
    if (constraints.maxElements) {
      optimizedTasks = optimizedTasks.slice(0, constraints.maxElements);
    }

    // Resolve dependencies and sort
    return this.resolveDependencies(optimizedTasks);
  }

  private prioritizeTasks(tasks: SubTask[], timeLimit: number): SubTask[] {
    // Simple priority algorithm - prefer verification tasks over analysis
    const prioritized = tasks.sort((a, b) => {
      const priorityOrder = { 'verification': 3, 'interaction-test': 2, 'navigation-test': 1, 'element-analysis': 0 };
      return priorityOrder[b.type] - priorityOrder[a.type];
    });

    const selected: SubTask[] = [];
    let totalTime = 0;

    for (const task of prioritized) {
      if (totalTime + task.estimatedTime <= timeLimit) {
        selected.push(task);
        totalTime += task.estimatedTime;
      }
    }

    return selected;
  }

  private resolveDependencies(tasks: SubTask[]): SubTask[] {
    const resolved: SubTask[] = [];
    const remaining = [...tasks];

    while (remaining.length > 0) {
      const readyTasks = remaining.filter(task => 
        task.dependencies.every(dep => resolved.some(r => r.id === dep))
      );

      if (readyTasks.length === 0) {
        // Circular dependency or missing dependency - break it
        const first = remaining.shift();
        if (first) resolved.push(first);
      } else {
        const nextTask = readyTasks[0];
        if (nextTask) {
          resolved.push(nextTask);
          const index = remaining.indexOf(nextTask);
          if (index >= 0) {
            remaining.splice(index, 1);
          }
        }
      }
    }

    return resolved;
  }

  private scoreActionOption(option: ActionOption, context: PerceptionData): number {
    let score = 0.5; // Base score

    // Score based on action type relevance
    switch (option.action.type) {
      case 'focus':
        score += 0.3; // Focus actions are highly relevant for accessibility testing
        break;
      case 'analyze':
        score += 0.2;
        break;
      case 'verify':
        score += 0.25;
        break;
      case 'navigate':
        score += 0.1;
        break;
    }

    // Score based on target availability
    if (option.action.target) {
      const targetExists = context.pageState.focusableElements.some(
        el => el.selector === option.action.target
      );
      score += targetExists ? 0.2 : -0.3;
    }

    // Score based on previous success/failure
    const historicalScore = this.knowledgeBase.getActionScore(option.action.type, context);
    score += historicalScore * 0.2;

    // Score based on estimated success probability
    score += (option.successProbability || 0.5) * 0.3;

    return Math.max(0, Math.min(1, score));
  }

  private createPlanningContext(perception: PerceptionData): PlanningContext {
    return {
      currentUrl: perception.pageState.url,
      availableElements: perception.pageState.focusableElements.map(el => el.selector),
      previousActions: this.reasoningChain.slice(-5).map(step => step.action),
      knownIssues: perception.testProgress.discoveredIssues,
      timeRemaining: 30000 // Default 30 seconds
    };
  }

  private assessContextComplexity(context: PerceptionData): number {
    const elementCount = context.pageState.focusableElements.length;
    const dynamicContent = context.pageState.dynamicContent.length;
    const issues = context.testProgress.discoveredIssues.length;

    // Normalize complexity score between 0 and 1
    const complexity = Math.min(1, (elementCount / 50) + (dynamicContent / 10) + (issues / 5));
    return complexity;
  }

  private analyzeFailurePatterns(failures: FailureHistory[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    
    // Group failures by error code
    const errorGroups = failures.reduce((groups, failure) => {
      const code = failure.error.code;
      if (!groups[code]) groups[code] = [];
      groups[code].push(failure);
      return groups;
    }, {} as Record<string, FailureHistory[]>);

    // Analyze each group for patterns
    Object.entries(errorGroups).forEach(([code, groupFailures]) => {
      if (groupFailures.length >= 3) {
        patterns.push({
          errorCode: code,
          frequency: groupFailures.length,
          commonContext: this.findCommonContext(groupFailures),
          suggestedAction: this.suggestActionForPattern(code, groupFailures)
        });
      }
    });

    return patterns;
  }

  private evaluateAdaptationCondition(condition: string, context: PerceptionData, failures: FailureHistory[]): boolean {
    // Simple condition evaluation - in a real implementation, this would be more sophisticated
    switch (condition) {
      case 'high-failure-rate':
        return failures.length > 5;
      case 'complex-page':
        return this.assessContextComplexity(context) > 0.7;
      case 'timeout-errors':
        return failures.some(f => f.error.code === 'TIMEOUT_ERROR');
      default:
        return false;
    }
  }

  private applyAdaptationAction(strategy: TestStrategy, rule: AdaptationRule): void {
    switch (rule.action) {
      case 'reduce-scope':
        strategy.approach = 'priority-based';
        break;
      case 'change-strategy':
        strategy.approach = rule.parameters.newApproach || 'adaptive';
        break;
      case 'increase-timeout':
        strategy.retryPolicy.maxRetries += 1;
        break;
    }
  }

  private findCommonContext(failures: FailureHistory[]): any {
    // Find common elements in failure contexts
    return {
      commonActions: this.findMostCommon(failures.map(f => f.action.type)),
      commonUrls: this.findMostCommon(failures.map(f => f.context.currentUrl))
    };
  }

  private findMostCommon<T>(items: T[]): T | null {
    const counts = items.reduce((acc, item) => {
      acc[String(item)] = (acc[String(item)] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxCount = Math.max(...Object.values(counts));
    const mostCommon = Object.entries(counts).find(([_, count]) => count === maxCount);
    
    return mostCommon ? items.find(item => String(item) === mostCommon[0]) || null : null;
  }

  private suggestActionForPattern(errorCode: string, failures: FailureHistory[]): string {
    switch (errorCode) {
      case 'TIMEOUT_ERROR':
        return 'increase-timeout';
      case 'ELEMENT_NOT_FOUND':
        return 'improve-element-detection';
      case 'FOCUS_FAILED':
        return 'use-alternative-focus-method';
      default:
        return 'retry-with-backoff';
    }
  }

  private optimizeStrategyFromLearning(): void {
    const recentFailures = this.failureHistory.slice(-20);
    const successRate = this.knowledgeBase.getOverallSuccessRate();

    if (successRate < 0.7) {
      this.currentStrategy.approach = 'adaptive';
      this.currentStrategy.retryPolicy.maxRetries = Math.min(5, this.currentStrategy.retryPolicy.maxRetries + 1);
    }
  }

  private addReasoningStep(type: string, description: string, data: any): void {
    this.reasoningChain.push({
      type,
      description,
      timestamp: Date.now(),
      data,
      action: type
    });

    // Keep only last 100 steps to prevent memory issues
    if (this.reasoningChain.length > 100) {
      this.reasoningChain = this.reasoningChain.slice(-100);
    }
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultStrategy(): TestStrategy {
    return {
      approach: 'priority-based',
      interactionPattern: 'systematic',
      verificationLevel: 'comprehensive',
      retryPolicy: {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        retryableErrors: ['TIMEOUT_ERROR', 'NETWORK_ERROR', 'ELEMENT_NOT_FOUND'],
        escalationThreshold: 5
      },
      adaptationRules: [
        {
          condition: 'high-failure-rate',
          action: 'reduce-scope',
          parameters: {}
        },
        {
          condition: 'complex-page',
          action: 'change-strategy',
          parameters: { newApproach: 'priority-based' }
        },
        {
          condition: 'timeout-errors',
          action: 'increase-timeout',
          parameters: {}
        }
      ]
    };
  }
}

/**
 * Knowledge base for storing and retrieving planning experience
 */
class PlanningKnowledgeBase {
  private experiences: TestExperience[] = [];
  private patterns: Map<string, PatternData> = new Map();
  private actionScores: Map<string, number> = new Map();

  addExperience(experience: TestExperience): void {
    this.experiences.push(experience);
    
    // Update action scores
    const actionKey = `${experience.action.type}_${experience.context.currentUrl}`;
    const currentScore = this.actionScores.get(actionKey) || 0.5;
    const newScore = experience.success ? 
      Math.min(1, currentScore + 0.1) : 
      Math.max(0, currentScore - 0.1);
    
    this.actionScores.set(actionKey, newScore);
  }

  reinforcePattern(pattern: string): void {
    const existing = this.patterns.get(pattern) || { count: 0, successRate: 0.5 };
    existing.count += 1;
    existing.successRate = Math.min(1, existing.successRate + 0.05);
    this.patterns.set(pattern, existing);
  }

  recordFailure(failure: FailureHistory): void {
    const pattern = `${failure.action.type}_${failure.error.code}`;
    const existing = this.patterns.get(pattern) || { count: 0, successRate: 0.5 };
    existing.count += 1;
    existing.successRate = Math.max(0, existing.successRate - 0.1);
    this.patterns.set(pattern, existing);
  }

  getActionScore(actionType: string, context: PerceptionData): number {
    const actionKey = `${actionType}_${context.pageState.url}`;
    return this.actionScores.get(actionKey) || 0.5;
  }

  getOverallSuccessRate(): number {
    if (this.experiences.length === 0) return 0.5;
    
    const successCount = this.experiences.filter(exp => exp.success).length;
    return successCount / this.experiences.length;
  }
}

/**
 * Supporting interfaces and types
 */
export interface ActionOption {
  action: Action;
  expectedOutcome: string;
  successCriteria: SuccessCriteria;
  successProbability?: number;
  timeout?: number;
  reasoning?: string;
}

export interface TestExperience {
  action: Action;
  context: PlanningContext;
  success: boolean;
  duration: number;
  pattern: string;
  failure?: FailureHistory | undefined;
}

export interface ReasoningStep {
  type: string;
  description: string;
  timestamp: number;
  data: any;
  action: string;
}

interface FailurePattern {
  errorCode: string;
  frequency: number;
  commonContext: any;
  suggestedAction: string;
}

interface PatternData {
  count: number;
  successRate: number;
}