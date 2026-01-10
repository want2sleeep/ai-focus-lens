// Agent State Management System
// Manages the overall state of the accessibility testing agent

import { PerceptionData } from './perception-engine';
import { HighLevelTask, SubTask, TestStrategy, ActionPlan } from './planning-engine';
import { ExtensionError } from '../../types';

/**
 * Current phase of the PRAR loop
 */
export type AgentPhase = 'perceiving' | 'reasoning' | 'acting' | 'reflecting' | 'idle' | 'error';

/**
 * Agent execution context
 * Requirements: 需求 1.1, 3.1 - 智能体状态管理系统
 */
export interface ExecutionContext {
  sessionId: string;
  currentUrl: string;
  startTime: number;
  totalActions: number;
  successfulActions: number;
  currentTask?: HighLevelTask | undefined;
  activeSubTask?: SubTask | undefined;
  lastPerception?: PerceptionData | undefined;
  lastActionPlan?: ActionPlan | undefined;
}

/**
 * Agent capabilities configuration
 */
export interface AgentCapabilities {
  cdpAvailable: boolean;
  visionApiEnabled: boolean;
  githubIntegration: boolean;
  maxConcurrentActions: number;
  supportedInteractions: InteractionType[];
  maxElementsPerScan: number;
}

export type InteractionType = 'keyboard' | 'mouse' | 'touch' | 'voice' | 'gesture';

/**
 * Knowledge base for learned patterns and solutions
 */
export interface KnowledgeBase {
  learnedPatterns: Pattern[];
  successfulFixes: FixSolution[];
  failureReasons: FailureReason[];
  siteSpecificRules: SiteRule[];
  performanceMetrics: PerformanceMetrics;
}

export interface Pattern {
  id: string;
  type: 'interaction' | 'fix' | 'detection' | 'navigation';
  description: string;
  conditions: Condition[];
  actions: PatternAction[];
  successRate: number;
  lastUsed: number;
  confidence: number;
}

export interface Condition {
  type: 'element-present' | 'style-match' | 'url-pattern' | 'error-code';
  selector?: string;
  value: any;
  operator: 'equals' | 'contains' | 'matches' | 'greater-than' | 'less-than';
}

export interface PatternAction {
  type: string;
  parameters: Record<string, any>;
  timeout?: number;
  retryable: boolean;
}

export interface FixSolution {
  id: string;
  issueType: string;
  code: string;
  description: string;
  successRate: number;
  applicableSelectors: string[];
  wcagCriteria: string[];
}

export interface FailureReason {
  errorCode: string;
  description: string;
  frequency: number;
  commonContext: Record<string, any>;
  suggestedResolution: string;
}

export interface SiteRule {
  domain: string;
  patterns: string[];
  customSelectors: string[];
  skipSelectors: string[];
  specialHandling: Record<string, any>;
}

export interface PerformanceMetrics {
  averageTaskTime: number;
  successRate: number;
  errorRate: number;
  mostCommonErrors: string[];
  improvementTrend: number;
}

/**
 * Complete agent state
 * Requirements: 需求 1.1, 3.1 - 实现智能体状态管理系统
 */
export interface AgentState {
  // Core state
  currentPhase: AgentPhase;
  executionContext: ExecutionContext;
  
  // Configuration
  capabilities: AgentCapabilities;
  currentStrategy: TestStrategy;
  
  // Knowledge and learning
  knowledgeBase: KnowledgeBase;
  
  // Current operation state
  taskQueue: SubTask[];
  completedTasks: SubTask[];
  errors: ExtensionError[];
  
  // Performance tracking
  metrics: {
    cycleCount: number;
    averageCycleTime: number;
    lastCycleTime: number;
    totalExecutionTime: number;
  };
}

/**
 * State change event for communication
 */
export interface StateChangeEvent {
  type: 'phase-change' | 'task-update' | 'error' | 'completion' | 'metrics-update';
  previousState?: Partial<AgentState>;
  newState: Partial<AgentState>;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Agent State Manager
 * Requirements: 需求 1.1, 3.1 - 智能体状态管理系统，建立组件间通信机制
 */
export class AgentStateManager {
  private state: AgentState;
  private listeners: Map<string, StateChangeListener[]> = new Map();
  private stateHistory: StateSnapshot[] = [];
  private maxHistorySize = 100;

  constructor(initialCapabilities: AgentCapabilities) {
    this.state = this.createInitialState(initialCapabilities);
  }

  /**
   * Get current agent state (read-only)
   */
  getState(): Readonly<AgentState> {
    return { ...this.state };
  }

  /**
   * Update agent phase
   * Requirements: 需求 1.1 - PRAR 循环状态管理
   */
  setPhase(phase: AgentPhase, metadata?: Record<string, any>): void {
    const previousPhase = this.state.currentPhase;
    
    if (previousPhase !== phase) {
      this.updateState({
        currentPhase: phase
      }, {
        type: 'phase-change',
        metadata: { previousPhase, newPhase: phase, ...metadata }
      });
    }
  }

  /**
   * Update execution context
   */
  updateExecutionContext(updates: Partial<ExecutionContext>): void {
    this.updateState({
      executionContext: {
        ...this.state.executionContext,
        ...updates
      }
    }, {
      type: 'task-update',
      metadata: { contextUpdates: Object.keys(updates) }
    });
  }

  /**
   * Set current task
   */
  setCurrentTask(task: HighLevelTask): void {
    this.updateState({
      executionContext: {
        ...this.state.executionContext,
        currentTask: task
      }
    }, {
      type: 'task-update',
      metadata: { taskType: task.type, taskId: task.id }
    });
  }

  /**
   * Set active sub-task
   */
  setActiveSubTask(subTask: SubTask | undefined): void {
    this.updateState({
      executionContext: {
        ...this.state.executionContext,
        activeSubTask: subTask
      }
    }, {
      type: 'task-update',
      metadata: { subTaskId: subTask?.id, subTaskType: subTask?.type }
    });
  }

  /**
   * Add task to queue
   */
  addTask(task: SubTask): void {
    this.updateState({
      taskQueue: [...this.state.taskQueue, task]
    }, {
      type: 'task-update',
      metadata: { action: 'task-added', taskId: task.id }
    });
  }

  /**
   * Complete current task
   */
  completeTask(taskId: string, result: any): void {
    const taskIndex = this.state.taskQueue.findIndex(task => task.id === taskId);
    
    if (taskIndex >= 0) {
      const completedTask = this.state.taskQueue[taskIndex];
      if (completedTask) {
        const newTaskQueue = [...this.state.taskQueue];
        newTaskQueue.splice(taskIndex, 1);

        this.updateState({
          taskQueue: newTaskQueue,
          completedTasks: [...this.state.completedTasks, completedTask],
          executionContext: {
            ...this.state.executionContext,
            successfulActions: this.state.executionContext.successfulActions + 1
          }
        }, {
          type: 'task-update',
          metadata: { action: 'task-completed', taskId, result }
        });
      }
    }
  }

  /**
   * Record error
   */
  addError(error: ExtensionError): void {
    this.updateState({
      errors: [...this.state.errors, error],
      currentPhase: error.recoverable ? this.state.currentPhase : 'error'
    }, {
      type: 'error',
      metadata: { errorCode: error.code, recoverable: error.recoverable }
    });
  }

  /**
   * Update strategy
   */
  updateStrategy(strategy: TestStrategy): void {
    this.updateState({
      currentStrategy: strategy
    }, {
      type: 'task-update',
      metadata: { action: 'strategy-updated', approach: strategy.approach }
    });
  }

  /**
   * Update perception data
   */
  updatePerception(perception: PerceptionData): void {
    this.updateState({
      executionContext: {
        ...this.state.executionContext,
        lastPerception: perception
      }
    }, {
      type: 'task-update',
      metadata: { action: 'perception-updated', elementCount: perception.pageState.focusableElements.length }
    });
  }

  /**
   * Update action plan
   */
  updateActionPlan(actionPlan: ActionPlan): void {
    this.updateState({
      executionContext: {
        ...this.state.executionContext,
        lastActionPlan: actionPlan,
        totalActions: this.state.executionContext.totalActions + 1
      }
    }, {
      type: 'task-update',
      metadata: { action: 'action-planned', actionType: actionPlan.primaryAction.type }
    });
  }

  /**
   * Update performance metrics
   */
  updateMetrics(cycleTime: number): void {
    const newCycleCount = this.state.metrics.cycleCount + 1;
    const newTotalTime = this.state.metrics.totalExecutionTime + cycleTime;
    const newAverageTime = newTotalTime / newCycleCount;

    this.updateState({
      metrics: {
        cycleCount: newCycleCount,
        averageCycleTime: newAverageTime,
        lastCycleTime: cycleTime,
        totalExecutionTime: newTotalTime
      }
    }, {
      type: 'metrics-update',
      metadata: { cycleTime, averageTime: newAverageTime }
    });
  }

  /**
   * Learn from experience and update knowledge base
   */
  addPattern(pattern: Pattern): void {
    const updatedPatterns = [...this.state.knowledgeBase.learnedPatterns];
    const existingIndex = updatedPatterns.findIndex(p => p.id === pattern.id);
    
    if (existingIndex >= 0) {
      updatedPatterns[existingIndex] = pattern;
    } else {
      updatedPatterns.push(pattern);
    }

    this.updateState({
      knowledgeBase: {
        ...this.state.knowledgeBase,
        learnedPatterns: updatedPatterns
      }
    }, {
      type: 'task-update',
      metadata: { action: 'pattern-learned', patternType: pattern.type }
    });
  }

  /**
   * Add successful fix solution
   */
  addFixSolution(fix: FixSolution): void {
    this.updateState({
      knowledgeBase: {
        ...this.state.knowledgeBase,
        successfulFixes: [...this.state.knowledgeBase.successfulFixes, fix]
      }
    }, {
      type: 'task-update',
      metadata: { action: 'fix-learned', issueType: fix.issueType }
    });
  }

  /**
   * Register state change listener
   * Requirements: 需求 1.1, 3.1 - 建立组件间通信机制
   */
  addEventListener(eventType: string, listener: StateChangeListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
  }

  /**
   * Remove state change listener
   */
  removeEventListener(eventType: string, listener: StateChangeListener): void {
    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index >= 0) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Get state history for debugging
   */
  getStateHistory(): StateSnapshot[] {
    return [...this.stateHistory];
  }

  /**
   * Reset agent state
   */
  reset(): void {
    const capabilities = this.state.capabilities;
    this.state = this.createInitialState(capabilities);
    this.stateHistory = [];
    
    this.notifyListeners({
      type: 'phase-change',
      newState: this.state,
      timestamp: Date.now(),
      metadata: { action: 'reset' }
    });
  }

  /**
   * Export state for persistence
   */
  exportState(): SerializableAgentState {
    return {
      currentPhase: this.state.currentPhase,
      executionContext: this.state.executionContext,
      knowledgeBase: this.state.knowledgeBase,
      metrics: this.state.metrics,
      timestamp: Date.now()
    };
  }

  /**
   * Import state from persistence
   */
  importState(serializedState: SerializableAgentState): void {
    this.state = {
      ...this.state,
      currentPhase: serializedState.currentPhase,
      executionContext: serializedState.executionContext,
      knowledgeBase: serializedState.knowledgeBase,
      metrics: serializedState.metrics
    };

    this.notifyListeners({
      type: 'phase-change',
      newState: this.state,
      timestamp: Date.now(),
      metadata: { action: 'import', importTimestamp: serializedState.timestamp }
    });
  }

  /**
   * Private helper methods
   */
  private createInitialState(capabilities: AgentCapabilities): AgentState {
    return {
      currentPhase: 'idle',
      executionContext: {
        sessionId: this.generateSessionId(),
        currentUrl: '',
        startTime: Date.now(),
        totalActions: 0,
        successfulActions: 0
      },
      capabilities,
      currentStrategy: this.getDefaultStrategy(),
      knowledgeBase: {
        learnedPatterns: [],
        successfulFixes: [],
        failureReasons: [],
        siteSpecificRules: [],
        performanceMetrics: {
          averageTaskTime: 0,
          successRate: 0,
          errorRate: 0,
          mostCommonErrors: [],
          improvementTrend: 0
        }
      },
      taskQueue: [],
      completedTasks: [],
      errors: [],
      metrics: {
        cycleCount: 0,
        averageCycleTime: 0,
        lastCycleTime: 0,
        totalExecutionTime: 0
      }
    };
  }

  private updateState(updates: Partial<AgentState>, event: Omit<StateChangeEvent, 'previousState' | 'newState' | 'timestamp'>): void {
    const previousState = { ...this.state };
    
    this.state = {
      ...this.state,
      ...updates
    };

    // Add to history
    this.stateHistory.push({
      state: { ...this.state },
      timestamp: Date.now(),
      event: event.type
    });

    // Trim history if needed
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory = this.stateHistory.slice(-this.maxHistorySize);
    }

    // Notify listeners
    const stateChangeEvent: StateChangeEvent = {
      ...event,
      previousState,
      newState: this.state,
      timestamp: Date.now()
    };

    this.notifyListeners(stateChangeEvent);
  }

  private notifyListeners(event: StateChangeEvent): void {
    const eventListeners = this.listeners.get(event.type) || [];
    const allListeners = this.listeners.get('*') || [];
    
    [...eventListeners, ...allListeners].forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultStrategy(): TestStrategy {
    return {
      approach: 'priority-based',
      interactionPattern: 'systematic',
      verificationLevel: 'comprehensive',
      retryPolicy: {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        retryableErrors: ['TIMEOUT_ERROR', 'NETWORK_ERROR'],
        escalationThreshold: 5
      },
      adaptationRules: []
    };
  }
}

/**
 * Supporting types and interfaces
 */
export type StateChangeListener = (event: StateChangeEvent) => void;

export interface StateSnapshot {
  state: AgentState;
  timestamp: number;
  event: string;
}

export interface SerializableAgentState {
  currentPhase: AgentPhase;
  executionContext: ExecutionContext;
  knowledgeBase: KnowledgeBase;
  metrics: AgentState['metrics'];
  timestamp: number;
}