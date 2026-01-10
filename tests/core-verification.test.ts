import { PRARLoopCoordinator } from '../src/agent/core/prar-loop';
import { PerceptionEngine } from '../src/agent/core/perception-engine';
import { PlanningEngine } from '../src/agent/core/planning-engine';
import { AgentStateManager } from '../src/agent/core/agent-state';
import { ActionExecutor } from '../src/agent/core/prar-loop';
import { CDPInterface } from '../src/agent/cdp-interface';

// Mock ActionExecutor
class MockActionExecutor implements ActionExecutor {
  async executeAction(actionPlan: any) {
    const action = actionPlan.primaryAction;
    const sideEffects: any[] = [];
    
    if (action.type === 'focus' || action.type === 'keyboard' || action.type === 'click') {
      sideEffects.push({ type: 'focus-change', description: 'Focus changed', reversible: true });
    }
    
    if (action.type === 'analyze' || action.type === 'verify') {
      // No specific side effects needed for these in basic mock
    }

    return {
      success: true,
      duration: 100,
      output: { result: 'success', visible: true },
      sideEffects
    };
  }

  canExecute(_actionType: string) {
    return true;
  }

  getCapabilities() {
    return ['navigate', 'click', 'type', 'focus', 'wait', 'verify'];
  }
}

// Mock CDPInterface
const mockCDPInterface = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getSession: jest.fn(),
  enableRuntime: jest.fn(),
  enableDOM: jest.fn(),
  enableInput: jest.fn(),
  enablePage: jest.fn(),
  simulateTabNavigation: jest.fn(),
  simulateKeyPress: jest.fn(),
  simulateKeySequence: jest.fn(),
  simulateMouseClick: jest.fn(),
  simulateMouseMove: jest.fn(),
  simulateDragAndDrop: jest.fn(),
  simulateTouchGesture: jest.fn(),
  getCurrentFocus: jest.fn(),
  setFocus: jest.fn(),
  blurElement: jest.fn(),
  captureFocusState: jest.fn(),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(),
  getElementInfo: jest.fn(),
  getComputedStyle: jest.fn(),
  getComputedStylesBySelector: jest.fn(),
  getElementBoundingRect: jest.fn(),
  getViewportSize: jest.fn().mockResolvedValue({ width: 1024, height: 768 }),
  addStyleSheet: jest.fn(),
  removeStyleSheet: jest.fn(),
  setElementAttribute: jest.fn(),
  captureScreenshot: jest.fn(),
  captureElementScreenshot: jest.fn(),
  evaluateExpression: jest.fn(),
  onFocusChanged: jest.fn(),
  onNavigationCompleted: jest.fn(),
  onError: jest.fn()
};

describe('Core Verification - PRAR Loop', () => {
  let perceptionEngine: PerceptionEngine;
  let planningEngine: PlanningEngine;
  let stateManager: AgentStateManager;
  let coordinator: PRARLoopCoordinator;
  let actionExecutor: MockActionExecutor;

  beforeEach(() => {
    // Setup DOM environment
    document.body.innerHTML = `
      <div id="app">
        <button id="btn1">Click Me</button>
        <input id="input1" type="text" />
        <a id="link1" href="#">Link</a>
      </div>
    `;

    // Mock getBoundingClientRect
    Element.prototype.getBoundingClientRect = jest.fn(() => ({
      width: 100,
      height: 30,
      top: 10,
      left: 10,
      bottom: 40,
      right: 110,
      x: 10,
      y: 10,
      toJSON: () => {}
    })) as any;

    // Mock window.getComputedStyle
    window.getComputedStyle = jest.fn().mockReturnValue({
      outline: 'none',
      visibility: 'visible',
      display: 'block',
      opacity: '1'
    }) as any;

    // Initialize components
    perceptionEngine = new PerceptionEngine();
    planningEngine = new PlanningEngine();
    stateManager = new AgentStateManager({
      cdpAvailable: true,
      visionApiEnabled: false,
      githubIntegration: false,
      maxConcurrentActions: 1,
      supportedInteractions: ['keyboard', 'mouse'],
      maxElementsPerScan: 100
    });
    
    coordinator = new PRARLoopCoordinator(
      perceptionEngine,
      planningEngine,
      stateManager,
      { debugMode: true, maxCycleTime: 10000, maxCycles: 10 }
    );

    actionExecutor = new MockActionExecutor();
    coordinator.setActionExecutor(actionExecutor);
  });

  afterEach(() => {
    perceptionEngine.destroy();
  });

  test('6.1 Verify PRAR Loop Integration', async () => {
    const task = {
      id: 'test-task-1',
      type: 'workflow-test' as const,
      description: 'Test basic workflow',
      wcagLevel: 'AA' as const,
      priority: 'medium' as const,
      scope: {
        workflows: [[{
          action: 'click' as const,
          target: '#btn1',
          description: 'Click button'
        }]]
      },
      constraints: {}
    };

    const result = await coordinator.startLoop(task);
    
    expect(result.success).toBe(true);
    expect(stateManager.getState().currentPhase).toBe('idle');
    expect(stateManager.getState().completedTasks.length).toBeGreaterThan(0);
  });

  test('6.2 Validate Basic Agent Behavior', async () => {
    // Inject an issue (button with no outline)
    // The PerceptionEngine detects elements, PlanningEngine plans, ActionExecutor executes.
    // We want to see if it generates a plan.

    const task = {
      id: 'test-task-2',
      type: 'full-site-audit' as const,
      description: 'Audit page',
      wcagLevel: 'AA' as const,
      priority: 'high' as const,
      scope: {},
      constraints: {}
    };

    const result = await coordinator.startLoop(task);

    expect(result.success).toBe(true);
    // Check if tasks were decomposed and executed
    const state = stateManager.getState();
    expect(state.taskQueue.length).toBe(0); // All tasks should be processed or max cycles reached
    expect(state.metrics.cycleCount).toBeGreaterThan(0);
  });
});
