// PRAR Loop Coordinator for Accessibility Testing Agent
// Orchestrates the Perceive-Reason-Act-Reflect cycle

import { PerceptionEngine, PerceptionData } from './perception-engine';
import { PlanningEngine, HighLevelTask, ActionPlan, ActionOption } from './planning-engine';
import { AgentStateManager, AgentPhase, StateChangeEvent } from './agent-state';
import { ExtensionError } from '../../types';

/**
 * PRAR Loop execution result
 */
export interface PRARResult {
  success: boolean;
  phase: AgentPhase;
  cycleTime: number;
  actionsExecuted: number;
  errors: ExtensionError[];
  metadata: Record<string, any>;
}

/**
 * Loop configuration
 */
export interface PRARConfig {
  maxCycleTime: number;
  maxCycles: number;
  errorThreshold: number;
  adaptiveDelay: boolean;
  debugMode: boolean;
}

/**
 * Action execution interface
 */
export interface ActionExecutor {
  executeAction(action: ActionPlan): Promise<ActionResult>;
  canExecute(actionType: string): boolean;
  getCapabilities(): string[];
}

export interface ActionResult {
  success: boolean;
  duration: number;
  output?: any;
  error?: ExtensionError;
  sideEffects?: SideEffect[];
}

export interface SideEffect {
  type: 'dom-change' | 'focus-change' | 'style-change' | 'navigation';
  description: string;
  reversible: boolean;
  data?: any;
}

/**
 * Reflection result from analyzing action outcomes
 */
export interface ReflectionResult {
  actionSuccessful: boolean;
  goalAchieved: boolean;
  lessonsLearned: string[];
  strategicAdjustments: string[];
  nextRecommendation: 'continue' | 'retry' | 'adapt' | 'escalate' | 'complete';
}

/**
 * PRAR Loop Coordinator
 * Requirements: 需求 1.1, 3.1 - 创建 PRAR 循环的基础框架，建立组件间通信机制
 */
export class PRARLoopCoordinator {
  private perceptionEngine: PerceptionEngine;
  private planningEngine: PlanningEngine;
  private stateManager: AgentStateManager;
  private actionExecutor: ActionExecutor | null = null;
  
  private config: PRARConfig;
  private isRunning = false;
  private currentCycle = 0;
  private cycleStartTime = 0;
  
  // Performance tracking
  private cycleMetrics: CycleMetrics[] = [];
  private errorCount = 0;

  constructor(
    perceptionEngine: PerceptionEngine,
    planningEngine: PlanningEngine,
    stateManager: AgentStateManager,
    config?: Partial<PRARConfig>
  ) {
    this.perceptionEngine = perceptionEngine;
    this.planningEngine = planningEngine;
    this.stateManager = stateManager;
    
    this.config = {
      maxCycleTime: 30000, // 30 seconds
      maxCycles: 100,
      errorThreshold: 5,
      adaptiveDelay: true,
      debugMode: false,
      ...config
    };

    this.setupStateListeners();
  }

  /**
   * Set action executor for the Act phase
   */
  setActionExecutor(executor: ActionExecutor): void {
    this.actionExecutor = executor;
  }

  /**
   * Start the PRAR loop with a high-level task
   * Requirements: 需求 1.1, 3.1 - PRAR 循环执行
   */
  async startLoop(task: HighLevelTask): Promise<PRARResult> {
    if (this.isRunning) {
      throw new Error('PRAR loop is already running');
    }

    this.isRunning = true;
    this.currentCycle = 0;
    this.errorCount = 0;
    this.cycleStartTime = Date.now();

    try {
      // Initialize state
      this.stateManager.setCurrentTask(task);
      this.stateManager.setPhase('perceiving');

      // Decompose task into sub-tasks
      const subTasks = this.planningEngine.decomposeTask(task);
      subTasks.forEach(subTask => this.stateManager.addTask(subTask));

      if (this.config.debugMode) {
        console.log(`PRAR Loop started with task: ${task.description}`);
        console.log(`Decomposed into ${subTasks.length} sub-tasks`);
      }

      // Execute PRAR cycles until completion or failure
      while (this.shouldContinueLoop()) {
        const cycleResult = await this.executeCycle();
        
        if (!cycleResult.success) {
          this.errorCount++;
          
          if (this.errorCount >= this.config.errorThreshold) {
            break;
          }
        }

        // Adaptive delay between cycles
        if (this.config.adaptiveDelay) {
          await this.adaptiveDelay(cycleResult);
        }

        this.currentCycle++;
      }

      const totalTime = Date.now() - this.cycleStartTime;
      const result: PRARResult = {
        success: this.errorCount < this.config.errorThreshold,
        phase: this.stateManager.getState().currentPhase,
        cycleTime: totalTime,
        actionsExecuted: this.stateManager.getState().executionContext.totalActions,
        errors: this.stateManager.getState().errors,
        metadata: {
          cycles: this.currentCycle,
          averageCycleTime: this.getAverageCycleTime(),
          taskCompletion: this.getTaskCompletionRate()
        }
      };

      if (this.config.debugMode) {
        console.log('PRAR Loop completed:', result);
      }

      return result;

    } catch (error) {
      const extensionError = this.createLoopError('PRAR loop execution failed', error);
      this.stateManager.addError(extensionError);
      
      return {
        success: false,
        phase: 'error',
        cycleTime: Date.now() - this.cycleStartTime,
        actionsExecuted: this.stateManager.getState().executionContext.totalActions,
        errors: [extensionError],
        metadata: { cycles: this.currentCycle, error: extensionError.message }
      };
    } finally {
      this.isRunning = false;
      this.stateManager.setPhase('idle');
    }
  }

  /**
   * Stop the PRAR loop
   */
  stopLoop(): void {
    this.isRunning = false;
    this.stateManager.setPhase('idle');
  }

  /**
   * Execute a single PRAR cycle
   * Requirements: 需求 1.1 - PRAR 循环执行
   */
  private async executeCycle(): Promise<CycleResult> {
    const cycleStart = Date.now();
    const cycleId = `cycle_${this.currentCycle}`;

    try {
      // PERCEIVE: Collect environment data
      const perception = await this.perceivePhase();
      
      // REASON: Plan next actions
      const actionPlan = await this.reasonPhase(perception);
      
      // ACT: Execute planned actions
      const actionResult = await this.actPhase(actionPlan);
      
      // REFLECT: Analyze results and learn
      const reflection = await this.reflectPhase(actionResult, actionPlan);

      const cycleTime = Date.now() - cycleStart;
      const cycleMetric: CycleMetrics = {
        cycleId,
        duration: cycleTime,
        phase: 'completed',
        success: actionResult.success && reflection.actionSuccessful,
        actionsExecuted: 1,
        errorsEncountered: actionResult.error ? 1 : 0
      };

      this.cycleMetrics.push(cycleMetric);
      this.stateManager.updateMetrics(cycleTime);

      return {
        success: cycleMetric.success,
        duration: cycleTime,
        phase: 'completed',
        reflection
      };

    } catch (error) {
      const cycleTime = Date.now() - cycleStart;
      const extensionError = this.createLoopError('Cycle execution failed', error);
      
      this.stateManager.addError(extensionError);
      
      return {
        success: false,
        duration: cycleTime,
        phase: 'error',
        error: extensionError
      };
    }
  }

  /**
   * PERCEIVE phase: Collect current environment state
   * Requirements: 需求 1.1, 1.2 - 感知层执行
   */
  private async perceivePhase(): Promise<PerceptionData> {
    this.stateManager.setPhase('perceiving');
    
    if (this.config.debugMode) {
      console.log('PERCEIVE: Collecting environment data...');
    }

    try {
      // Wait for page stability before perceiving
      await this.perceptionEngine.waitForStability();
      
      const perception = await this.perceptionEngine.perceive();
      this.stateManager.updatePerception(perception);
      
      if (this.config.debugMode) {
        console.log(`PERCEIVE: Found ${perception.pageState.focusableElements.length} focusable elements`);
      }

      return perception;
    } catch (error) {
      throw this.createLoopError('Perception phase failed', error);
    }
  }

  /**
   * REASON phase: Plan actions based on perception
   * Requirements: 需求 3.1, 3.3 - 推理层执行
   */
  private async reasonPhase(perception: PerceptionData): Promise<ActionPlan> {
    this.stateManager.setPhase('reasoning');
    
    if (this.config.debugMode) {
      console.log('REASON: Planning next actions...');
    }

    try {
      // Get next task from queue
      const nextTask = this.planningEngine.getNextTask();
      if (!nextTask) {
        throw new Error('No tasks available for execution');
      }

      this.stateManager.setActiveSubTask(nextTask);

      // Generate action options based on task and perception
      const actionOptions = this.generateActionOptions(nextTask, perception);
      
      // Make decision
      const actionPlan = this.planningEngine.makeDecision(actionOptions, perception);
      this.stateManager.updateActionPlan(actionPlan);

      if (this.config.debugMode) {
        console.log(`REASON: Planned action: ${actionPlan.primaryAction.type} with ${actionPlan.fallbackActions.length} fallbacks`);
      }

      return actionPlan;
    } catch (error) {
      throw this.createLoopError('Reasoning phase failed', error);
    }
  }

  /**
   * ACT phase: Execute planned actions
   * Requirements: 需求 1.1 - 行动层执行
   */
  private async actPhase(actionPlan: ActionPlan): Promise<ActionResult> {
    this.stateManager.setPhase('acting');
    
    if (this.config.debugMode) {
      console.log(`ACT: Executing action: ${actionPlan.primaryAction.type}`);
    }

    if (!this.actionExecutor) {
      throw new Error('No action executor configured');
    }

    try {
      // Try primary action first
      let result = await this.actionExecutor.executeAction(actionPlan);
      
      // If primary action failed, try fallbacks
      if (!result.success && actionPlan.fallbackActions.length > 0) {
        for (const fallbackAction of actionPlan.fallbackActions) {
          const fallbackPlan = { ...actionPlan, primaryAction: fallbackAction };
          result = await this.actionExecutor.executeAction(fallbackPlan);
          
          if (result.success) {
            if (this.config.debugMode) {
              console.log(`ACT: Fallback action succeeded: ${fallbackAction.type}`);
            }
            break;
          }
        }
      }

      // Record interaction result in perception engine
      this.perceptionEngine.recordInteraction({
        action: actionPlan.primaryAction.type as any,
        success: result.success,
        focusChanged: result.sideEffects?.some(se => se.type === 'focus-change') || false,
        timestamp: Date.now(),
        errors: result.error ? [result.error.message] : []
      });

      return result;
    } catch (error) {
      const actionError = this.createLoopError('Action execution failed', error);
      return {
        success: false,
        duration: 0,
        error: actionError
      };
    }
  }

  /**
   * REFLECT phase: Analyze results and learn
   * Requirements: 需求 1.1 - 反思层执行
   */
  private async reflectPhase(actionResult: ActionResult, actionPlan: ActionPlan): Promise<ReflectionResult> {
    this.stateManager.setPhase('reflecting');
    
    if (this.config.debugMode) {
      console.log(`REFLECT: Analyzing action result (success: ${actionResult.success})`);
    }

    try {
      const reflection: ReflectionResult = {
        actionSuccessful: actionResult.success,
        goalAchieved: this.evaluateGoalAchievement(actionResult, actionPlan),
        lessonsLearned: this.extractLessons(actionResult, actionPlan),
        strategicAdjustments: this.identifyStrategicAdjustments(actionResult),
        nextRecommendation: this.determineNextAction(actionResult, actionPlan)
      };

      // Learn from experience
      this.planningEngine.learnFromExperience({
        action: actionPlan.primaryAction,
        context: actionPlan.context,
        success: actionResult.success,
        duration: actionResult.duration,
        pattern: this.extractPattern(actionPlan, actionResult),
        failure: actionResult.error ? {
          taskId: this.stateManager.getState().executionContext.activeSubTask?.id || 'unknown',
          action: actionPlan.primaryAction,
          error: actionResult.error,
          timestamp: Date.now(),
          context: actionPlan.context
        } : undefined
      });

      // Update strategy if needed
      if (reflection.strategicAdjustments.length > 0) {
        const currentState = this.stateManager.getState();
        const adjustedStrategy = this.planningEngine.adjustStrategy(
          currentState.executionContext.lastPerception!,
          currentState.errors.map(error => ({
            taskId: 'unknown',
            action: actionPlan.primaryAction,
            error,
            timestamp: Date.now(),
            context: actionPlan.context
          }))
        );
        this.stateManager.updateStrategy(adjustedStrategy);
      }

      // Complete task if successful
      if (reflection.goalAchieved) {
        const activeTask = this.stateManager.getState().executionContext.activeSubTask;
        if (activeTask) {
          this.stateManager.completeTask(activeTask.id, actionResult.output);
        }
      }

      if (this.config.debugMode) {
        console.log(`REFLECT: Goal achieved: ${reflection.goalAchieved}, Next: ${reflection.nextRecommendation}`);
      }

      return reflection;
    } catch (error) {
      throw this.createLoopError('Reflection phase failed', error);
    }
  }

  /**
   * Generate action options for the current task
   */
  private generateActionOptions(task: any, perception: PerceptionData): ActionOption[] {
    const options: ActionOption[] = [];

    switch (task.type) {
      case 'element-analysis':
        options.push({
          action: {
            type: 'analyze',
            target: task.target,
            parameters: { analysisType: 'focus-visibility' },
            description: 'Analyze element focus visibility',
            estimatedDuration: 1000
          },
          expectedOutcome: 'Element focus visibility determined',
          successCriteria: { noErrors: true },
          successProbability: 0.8
        });
        break;

      case 'navigation-test':
        options.push({
          action: {
            type: 'keyboard',
            parameters: { key: 'Tab', direction: 'forward' },
            description: 'Navigate forward with Tab key',
            estimatedDuration: 500
          },
          expectedOutcome: 'Focus moves to next element',
          successCriteria: { focusChanged: true },
          successProbability: 0.9
        });
        break;

      case 'interaction-test':
        if (task.target) {
          options.push({
            action: {
              type: 'focus',
              target: task.target,
              description: `Focus element: ${task.target}`,
              estimatedDuration: 300
            },
            expectedOutcome: 'Element receives focus',
            successCriteria: { focusChanged: true, elementVisible: true },
            successProbability: 0.85
          });
        }
        break;

      case 'verification':
        options.push({
          action: {
            type: 'verify',
            parameters: { criteria: 'focus-visible' },
            description: 'Verify focus visibility compliance',
            estimatedDuration: 800
          },
          expectedOutcome: 'Compliance status determined',
          successCriteria: { noErrors: true },
          successProbability: 0.75
        });
        break;
    }

    return options;
  }

  /**
   * Helper methods for reflection phase
   */
  private evaluateGoalAchievement(result: ActionResult, plan: ActionPlan): boolean {
    if (!result.success) return false;

    // Check success criteria
    const criteria = plan.successCriteria;
    
    if (criteria.noErrors && result.error) return false;
    if (criteria.focusChanged && !result.sideEffects?.some(se => se.type === 'focus-change')) return false;
    if (criteria.elementVisible && !result.output?.visible) return false;
    if (criteria.styleChanged && !result.sideEffects?.some(se => se.type === 'style-change')) return false;
    if (criteria.customValidation && !criteria.customValidation(result.output)) return false;

    return true;
  }

  private extractLessons(result: ActionResult, plan: ActionPlan): string[] {
    const lessons: string[] = [];

    if (!result.success && result.error) {
      lessons.push(`Action ${plan.primaryAction.type} failed: ${result.error.message}`);
    }

    if (result.duration > plan.timeoutMs) {
      lessons.push(`Action took longer than expected: ${result.duration}ms vs ${plan.timeoutMs}ms`);
    }

    if (result.sideEffects && result.sideEffects.length > 0) {
      lessons.push(`Action had ${result.sideEffects.length} side effects`);
    }

    return lessons;
  }

  private identifyStrategicAdjustments(result: ActionResult): string[] {
    const adjustments: string[] = [];

    if (result.error?.code === 'TIMEOUT_ERROR') {
      adjustments.push('increase-timeout');
    }

    if (result.error?.code === 'ELEMENT_NOT_FOUND') {
      adjustments.push('improve-element-detection');
    }

    if (!result.success && result.duration > 5000) {
      adjustments.push('reduce-complexity');
    }

    return adjustments;
  }

  private determineNextAction(result: ActionResult, plan: ActionPlan): ReflectionResult['nextRecommendation'] {
    if (result.success) {
      return 'continue';
    }

    if (result.error?.retryable) {
      return 'retry';
    }

    if (result.error?.code === 'TIMEOUT_ERROR' || result.error?.code === 'ELEMENT_NOT_FOUND') {
      return 'adapt';
    }

    if (result.error?.recoverable) {
      return 'continue';
    }

    return 'escalate';
  }

  private extractPattern(plan: ActionPlan, result: ActionResult): string {
    return `${plan.primaryAction.type}_${result.success ? 'success' : 'failure'}_${plan.context.currentUrl}`;
  }

  /**
   * Loop control methods
   */
  private shouldContinueLoop(): boolean {
    if (!this.isRunning) return false;
    if (this.currentCycle >= this.config.maxCycles) return false;
    if (this.errorCount >= this.config.errorThreshold) return false;
    
    const state = this.stateManager.getState();
    if (state.taskQueue.length === 0) return false;
    
    const elapsedTime = Date.now() - this.cycleStartTime;
    if (elapsedTime > this.config.maxCycleTime) return false;

    return true;
  }

  private async adaptiveDelay(cycleResult: CycleResult): Promise<void> {
    let delay = 100; // Base delay

    if (!cycleResult.success) {
      delay *= 2; // Increase delay after failures
    }

    if (cycleResult.duration > 2000) {
      delay *= 1.5; // Increase delay after slow cycles
    }

    if (delay > 50) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private getAverageCycleTime(): number {
    if (this.cycleMetrics.length === 0) return 0;
    const totalTime = this.cycleMetrics.reduce((sum, metric) => sum + metric.duration, 0);
    return totalTime / this.cycleMetrics.length;
  }

  private getTaskCompletionRate(): number {
    const state = this.stateManager.getState();
    const totalTasks = state.taskQueue.length + state.completedTasks.length;
    if (totalTasks === 0) return 0;
    return state.completedTasks.length / totalTasks;
  }

  private setupStateListeners(): void {
    this.stateManager.addEventListener('error', (event: StateChangeEvent) => {
      if (this.config.debugMode) {
        console.log('PRAR Loop: Error event received:', event.metadata);
      }
    });

    this.stateManager.addEventListener('phase-change', (event: StateChangeEvent) => {
      if (this.config.debugMode) {
        console.log(`PRAR Loop: Phase changed to ${event.newState.currentPhase}`);
      }
    });
  }

  private createLoopError(message: string, originalError: any): ExtensionError {
    return {
      code: 'PRAR_LOOP_ERROR',
      message,
      details: originalError instanceof Error ? originalError.message : String(originalError),
      timestamp: Date.now(),
      context: {
        component: 'prar-loop',
        action: 'cycle-execution'
      },
      recoverable: true,
      retryable: true
    };
  }
}

/**
 * Supporting interfaces
 */
interface CycleResult {
  success: boolean;
  duration: number;
  phase: string;
  reflection?: ReflectionResult;
  error?: ExtensionError;
}

interface CycleMetrics {
  cycleId: string;
  duration: number;
  phase: string;
  success: boolean;
  actionsExecuted: number;
  errorsEncountered: number;
}