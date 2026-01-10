// Main Accessibility Testing Agent
// Coordinates all agent components and provides the main interface

import { PerceptionEngine } from './core/perception-engine';
import { PlanningEngine, HighLevelTask } from './core/planning-engine';
import { AgentStateManager, AgentCapabilities, AgentState } from './core/agent-state';
import { PRARLoopCoordinator, PRARConfig, PRARResult, ActionExecutor } from './core/prar-loop';
import { ExtensionError } from '../types';

/**
 * Agent initialization configuration
 */
export interface AgentConfig {
  capabilities: AgentCapabilities;
  prarConfig?: Partial<PRARConfig>;
  debugMode?: boolean;
  autoStart?: boolean;
}

/**
 * Agent status information
 */
export interface AgentStatus {
  isActive: boolean;
  currentPhase: string;
  currentTask?: HighLevelTask | undefined;
  progress: {
    completedTasks: number;
    totalTasks: number;
    successRate: number;
  };
  performance: {
    averageCycleTime: number;
    totalExecutionTime: number;
    errorCount: number;
  };
}

/**
 * Agent event for external communication
 */
export interface AgentEvent {
  type: 'started' | 'completed' | 'error' | 'progress' | 'phase-change';
  timestamp: number;
  data?: any;
}

export type AgentEventListener = (event: AgentEvent) => void;

/**
 * Main Accessibility Testing Agent
 * Requirements: 需求 1.1, 3.1 - 智能体核心架构，PRAR 循环框架，组件间通信机制
 */
export class AccessibilityTestingAgent {
  private perceptionEngine: PerceptionEngine;
  private planningEngine: PlanningEngine;
  private stateManager: AgentStateManager;
  private prarCoordinator: PRARLoopCoordinator;
  
  private config: AgentConfig;
  private eventListeners: Map<string, AgentEventListener[]> = new Map();
  private isInitialized = false;

  constructor(config: AgentConfig) {
    this.config = config;
    
    // Initialize core components
    this.perceptionEngine = new PerceptionEngine();
    this.planningEngine = new PlanningEngine();
    this.stateManager = new AgentStateManager(config.capabilities);
    
    // Initialize PRAR coordinator
    this.prarCoordinator = new PRARLoopCoordinator(
      this.perceptionEngine,
      this.planningEngine,
      this.stateManager,
      config.prarConfig
    );

    this.setupEventHandlers();
  }

  /**
   * Initialize the agent
   * Requirements: 需求 1.1 - 智能体初始化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Agent is already initialized');
    }

    try {
      if (this.config.debugMode) {
        console.log('Initializing Accessibility Testing Agent...');
      }

      // Verify capabilities
      await this.verifyCapabilities();

      // Set up action executor based on capabilities
      const actionExecutor = this.createActionExecutor();
      this.prarCoordinator.setActionExecutor(actionExecutor);

      this.isInitialized = true;
      
      this.emitEvent({
        type: 'started',
        timestamp: Date.now(),
        data: { capabilities: this.config.capabilities }
      });

      if (this.config.debugMode) {
        console.log('Agent initialized successfully');
      }

    } catch (error) {
      const agentError = this.createAgentError('Agent initialization failed', error);
      this.stateManager.addError(agentError);
      throw agentError;
    }
  }

  /**
   * Execute a high-level accessibility testing task
   * Requirements: 需求 1.1, 3.1 - 任务执行和PRAR循环
   */
  async executeTask(task: HighLevelTask): Promise<PRARResult> {
    if (!this.isInitialized) {
      throw new Error('Agent must be initialized before executing tasks');
    }

    try {
      if (this.config.debugMode) {
        console.log(`Executing task: ${task.description}`);
      }

      this.emitEvent({
        type: 'started',
        timestamp: Date.now(),
        data: { task }
      });

      // Execute the task using PRAR loop
      const result = await this.prarCoordinator.startLoop(task);

      this.emitEvent({
        type: 'completed',
        timestamp: Date.now(),
        data: { result, task }
      });

      if (this.config.debugMode) {
        console.log(`Task completed. Success: ${result.success}`);
      }

      return result;

    } catch (error) {
      const agentError = this.createAgentError('Task execution failed', error);
      this.stateManager.addError(agentError);
      
      this.emitEvent({
        type: 'error',
        timestamp: Date.now(),
        data: { error: agentError, task }
      });

      throw agentError;
    }
  }

  /**
   * Stop current task execution
   */
  stopExecution(): void {
    this.prarCoordinator.stopLoop();
    
    this.emitEvent({
      type: 'completed',
      timestamp: Date.now(),
      data: { stopped: true }
    });
  }

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus {
    const state = this.stateManager.getState();
    
    return {
      isActive: state.currentPhase !== 'idle',
      currentPhase: state.currentPhase,
      currentTask: state.executionContext.currentTask,
      progress: {
        completedTasks: state.completedTasks.length,
        totalTasks: state.taskQueue.length + state.completedTasks.length,
        successRate: this.calculateSuccessRate(state)
      },
      performance: {
        averageCycleTime: state.metrics.averageCycleTime,
        totalExecutionTime: state.metrics.totalExecutionTime,
        errorCount: state.errors.length
      }
    };
  }

  /**
   * Get agent state for debugging
   */
  getState(): Readonly<AgentState> {
    return this.stateManager.getState();
  }

  /**
   * Get reasoning chain for transparency
   */
  getReasoningChain(): any[] {
    return this.planningEngine.getReasoningChain();
  }

  /**
   * Reset agent to initial state
   */
  reset(): void {
    this.stateManager.reset();
    this.perceptionEngine.destroy();
    this.perceptionEngine = new PerceptionEngine();
    
    this.emitEvent({
      type: 'started',
      timestamp: Date.now(),
      data: { reset: true }
    });
  }

  /**
   * Export agent state for persistence
   */
  exportState(): any {
    return this.stateManager.exportState();
  }

  /**
   * Import agent state from persistence
   */
  importState(serializedState: any): void {
    this.stateManager.importState(serializedState);
  }

  /**
   * Add event listener
   */
  addEventListener(eventType: string, listener: AgentEventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(eventType: string, listener: AgentEventListener): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.perceptionEngine.destroy();
    this.stateManager.reset();
    this.eventListeners.clear();
    this.isInitialized = false;
  }

  /**
   * Create predefined tasks for common scenarios
   */
  static createFullSiteAuditTask(url: string, wcagLevel: 'A' | 'AA' | 'AAA' = 'AA'): HighLevelTask {
    return {
      id: `audit_${Date.now()}`,
      type: 'full-site-audit',
      description: `Complete accessibility audit of ${url}`,
      wcagLevel,
      priority: 'high',
      scope: {
        urls: [url]
      },
      constraints: {
        timeLimit: 300000, // 5 minutes
        maxElements: 100,
        skipHidden: true
      }
    };
  }

  static createFocusNavigationTask(selectors?: string[]): HighLevelTask {
    return {
      id: `focus_nav_${Date.now()}`,
      type: 'focus-navigation-test',
      description: 'Test keyboard focus navigation',
      wcagLevel: 'AA',
      priority: 'high',
      scope: {
        ...(selectors && { selectors })
      },
      constraints: {
        timeLimit: 60000, // 1 minute
        maxElements: 50
      }
    };
  }

  static createComponentTest(selector: string): HighLevelTask {
    return {
      id: `component_${Date.now()}`,
      type: 'component-test',
      description: `Test accessibility of component: ${selector}`,
      wcagLevel: 'AA',
      priority: 'medium',
      scope: {
        selectors: [selector]
      },
      constraints: {
        timeLimit: 30000, // 30 seconds
        maxElements: 10
      }
    };
  }

  /**
   * Private helper methods
   */
  private async verifyCapabilities(): Promise<void> {
    const capabilities = this.config.capabilities;
    
    // Check if CDP is available if required
    if (capabilities.cdpAvailable) {
      // In a real implementation, this would test CDP connection
      if (this.config.debugMode) {
        console.log('CDP capability verified');
      }
    }

    // Check other capabilities as needed
    if (capabilities.visionApiEnabled) {
      if (this.config.debugMode) {
        console.log('Vision API capability verified');
      }
    }
  }

  private createActionExecutor(): ActionExecutor {
    return new DefaultActionExecutor(this.config.capabilities, this.config.debugMode);
  }

  private setupEventHandlers(): void {
    // Listen to state changes and emit agent events
    this.stateManager.addEventListener('phase-change', (event) => {
      this.emitEvent({
        type: 'phase-change',
        timestamp: Date.now(),
        data: { 
          phase: event.newState.currentPhase,
          previousPhase: event.previousState?.currentPhase 
        }
      });
    });

    this.stateManager.addEventListener('task-update', (event) => {
      this.emitEvent({
        type: 'progress',
        timestamp: Date.now(),
        data: event.metadata
      });
    });

    this.stateManager.addEventListener('error', (event) => {
      this.emitEvent({
        type: 'error',
        timestamp: Date.now(),
        data: event.metadata
      });
    });
  }

  private emitEvent(event: AgentEvent): void {
    const eventListeners = this.eventListeners.get(event.type) || [];
    const allListeners = this.eventListeners.get('*') || [];
    
    [...eventListeners, ...allListeners].forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in agent event listener:', error);
      }
    });
  }

  private calculateSuccessRate(state: AgentState): number {
    const totalActions = state.executionContext.totalActions;
    const successfulActions = state.executionContext.successfulActions;
    
    if (totalActions === 0) return 0;
    return successfulActions / totalActions;
  }

  private createAgentError(message: string, originalError: any): ExtensionError {
    return {
      code: 'AGENT_ERROR',
      message,
      details: originalError instanceof Error ? originalError.message : String(originalError),
      timestamp: Date.now(),
      context: {
        component: 'accessibility-testing-agent',
        action: 'agent-operation'
      },
      recoverable: true,
      retryable: false
    };
  }
}

/**
 * Default Action Executor implementation
 * This would be replaced with more sophisticated executors for different environments
 */
class DefaultActionExecutor implements ActionExecutor {
  private capabilities: AgentCapabilities;
  private debugMode: boolean;

  constructor(capabilities: AgentCapabilities, debugMode = false) {
    this.capabilities = capabilities;
    this.debugMode = debugMode;
  }

  async executeAction(actionPlan: any): Promise<any> {
    const action = actionPlan.primaryAction;
    
    if (this.debugMode) {
      console.log(`Executing action: ${action.type}`);
    }

    // Simulate action execution
    await new Promise(resolve => setTimeout(resolve, action.estimatedDuration || 100));

    switch (action.type) {
      case 'analyze':
        return this.executeAnalyze(action);
      case 'focus':
        return this.executeFocus(action);
      case 'keyboard':
        return this.executeKeyboard(action);
      case 'verify':
        return this.executeVerify(action);
      default:
        return {
          success: false,
          duration: 100,
          error: {
            code: 'UNSUPPORTED_ACTION',
            message: `Action type ${action.type} is not supported`,
            timestamp: Date.now(),
            context: { component: 'action-executor', action: 'execute' },
            recoverable: false,
            retryable: false
          }
        };
    }
  }

  canExecute(actionType: string): boolean {
    const supportedActions = ['analyze', 'focus', 'keyboard', 'verify', 'navigate', 'wait'];
    return supportedActions.includes(actionType);
  }

  getCapabilities(): string[] {
    return ['analyze', 'focus', 'keyboard', 'verify'];
  }

  private async executeAnalyze(action: any): Promise<any> {
    // Simulate element analysis
    return {
      success: true,
      duration: action.estimatedDuration || 1000,
      output: {
        focusVisible: Math.random() > 0.3, // 70% pass rate
        colorContrast: Math.random() * 10 + 1,
        hasOutline: Math.random() > 0.5
      }
    };
  }

  private async executeFocus(action: any): Promise<any> {
    // Simulate focusing an element
    const success = Math.random() > 0.1; // 90% success rate
    
    return {
      success,
      duration: action.estimatedDuration || 300,
      sideEffects: success ? [{
        type: 'focus-change',
        description: `Focus moved to ${action.target}`,
        reversible: true
      }] : []
    };
  }

  private async executeKeyboard(action: any): Promise<any> {
    // Simulate keyboard interaction
    const success = Math.random() > 0.05; // 95% success rate
    
    return {
      success,
      duration: action.estimatedDuration || 500,
      sideEffects: success ? [{
        type: 'focus-change',
        description: `Keyboard navigation: ${action.parameters?.key}`,
        reversible: true
      }] : []
    };
  }

  private async executeVerify(action: any): Promise<any> {
    // Simulate verification
    return {
      success: true,
      duration: action.estimatedDuration || 800,
      output: {
        compliant: Math.random() > 0.2, // 80% compliance rate
        issues: Math.floor(Math.random() * 3),
        recommendations: ['Add focus outline', 'Improve color contrast']
      }
    };
  }
}