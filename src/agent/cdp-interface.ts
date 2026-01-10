// Chrome DevTools Protocol (CDP) Interface for Accessibility Testing Agent
// Provides deep browser integration for user interaction simulation and page manipulation

/**
 * CDP Session Management and Core Interface
 * Requirements: 需求 1.1, 1.2 - 实现 CDP 连接管理和基础输入模拟功能
 */
export interface CDPSession {
  sessionId: string;
  tabId: number;
  connected: boolean;
  capabilities: CDPCapabilities;
}

export interface CDPCapabilities {
  canSimulateInput: boolean;
  canCaptureScreenshots: boolean;
  canInjectCSS: boolean;
  canModifyDOM: boolean;
  runtimeEnabled: boolean;
  domEnabled: boolean;
  inputEnabled: boolean;
}

/**
 * Input simulation types for keyboard and mouse interactions
 * Requirements: 需求 1.1 - 通过 CDP 模拟真实的 Tab 键和 Shift+Tab 键按下
 */
export interface KeyboardEvent {
  type: 'keyDown' | 'keyUp' | 'char';
  key: string;
  code: string;
  modifiers?: KeyModifier[];
  timestamp?: number;
}

export interface MouseEvent {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  modifiers?: KeyModifier[];
  timestamp?: number;
}

export interface TouchEvent {
  type: 'touchStart' | 'touchEnd' | 'touchMove';
  touchPoints: TouchPoint[];
  timestamp?: number;
}

export interface TouchPoint {
  x: number;
  y: number;
  radiusX?: number;
  radiusY?: number;
  rotationAngle?: number;
  force?: number;
}

export type KeyModifier = 'Alt' | 'Ctrl' | 'Meta' | 'Shift';

/**
 * Focus state and navigation types
 * Requirements: 需求 1.1 - 添加焦点状态捕获功能
 */
export interface FocusState {
  elementSelector: string | null;
  nodeId: number | null;
  boundingRect: DOMRect | null;
  isVisible: boolean;
  tabIndex: number;
  focusRingVisible: boolean;
  timestamp: number;
}

export interface NavigationResult {
  success: boolean;
  previousFocus: FocusState | null;
  currentFocus: FocusState | null;
  focusChanged: boolean;
  error?: string;
}

/**
 * DOM manipulation and query types
 */
export interface DOMNode {
  nodeId: number;
  nodeName: string;
  nodeType: number;
  attributes?: { [key: string]: string };
  childNodeCount?: number;
}

export interface ElementInfo {
  nodeId: number;
  selector: string;
  tagName: string;
  attributes: { [key: string]: string };
  boundingRect: DOMRect;
  computedStyle: { [property: string]: string };
  isVisible: boolean;
  isFocusable: boolean;
  frameId?: string;
}

export interface FrameInfo {
  frameId: string;
  parentId?: string;
  url: string;
  name?: string;
  securityOrigin: string;
  mimeType: string;
  unreachable?: boolean;
}

/**
 * Screenshot and visual analysis types
 */
export interface ScreenshotOptions {
  format?: 'png' | 'jpeg';
  quality?: number; // 0-100 for JPEG
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale?: number;
  };
  fromSurface?: boolean;
}

export interface Screenshot {
  data: string; // Base64 encoded image
  format: string;
  timestamp: number;
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Main CDP Interface for Agent Integration
 * Requirements: 需求 1.1, 1.2 - 实现 CDP 连接管理和基础输入模拟功能
 */
export interface CDPInterface {
  // Connection Management
  connect(tabId: number): Promise<CDPSession>;
  disconnect(sessionId: string): Promise<void>;
  isConnected(sessionId: string): boolean;
  getSession(sessionId: string): CDPSession | null;
  
  // Domain Enablement
  enableRuntime(sessionId: string): Promise<void>;
  enableDOM(sessionId: string): Promise<void>;
  enableInput(sessionId: string): Promise<void>;
  enablePage(sessionId: string): Promise<void>;
  
  // Keyboard Navigation Simulation
  simulateTabNavigation(sessionId: string, direction: 'forward' | 'backward'): Promise<NavigationResult>;
  simulateKeyPress(sessionId: string, key: string, modifiers?: KeyModifier[]): Promise<void>;
  simulateKeySequence(sessionId: string, keys: KeyboardEvent[]): Promise<void>;
  
  // Mouse and Touch Simulation
  simulateMouseClick(sessionId: string, x: number, y: number, button?: 'left' | 'right' | 'middle'): Promise<void>;
  simulateMouseMove(sessionId: string, x: number, y: number): Promise<void>;
  simulateDragAndDrop(sessionId: string, startX: number, startY: number, endX: number, endY: number): Promise<void>;
  simulateTouchGesture(sessionId: string, gesture: TouchEvent[]): Promise<void>;
  
  // Focus State Management
  getCurrentFocus(sessionId: string): Promise<FocusState | null>;
  setFocus(sessionId: string, selector: string): Promise<boolean>;
  blurElement(sessionId: string): Promise<void>;
  captureFocusState(sessionId: string): Promise<FocusState | null>;
  
  // DOM Query and Manipulation
  querySelector(sessionId: string, selector: string): Promise<DOMNode | null>;
  querySelectorAll(sessionId: string, selector: string): Promise<DOMNode[]>;
  getElementInfo(sessionId: string, nodeId: number): Promise<ElementInfo>;
  getComputedStyle(sessionId: string, nodeId: number): Promise<{ [property: string]: string }>;
  getComputedStylesBySelector(sessionId: string, selector: string): Promise<{ [property: string]: string }>;
  getElementBoundingRect(sessionId: string, selector: string): Promise<DOMRect>;
  
  // Page and Viewport
  getViewportSize(sessionId: string): Promise<{ width: number; height: number }>;
  
  // Frame Management
  discoverFrames(sessionId: string): Promise<FrameInfo[]>;
  switchToFrame(sessionId: string, frameId: string): Promise<void>;
  autoAttachIframes(sessionId: string): Promise<void>;
  
  // CSS Injection and Modification
  addStyleSheet(sessionId: string, css: string): Promise<string>; // Returns styleSheetId
  removeStyleSheet(sessionId: string, styleSheetId: string): Promise<void>;
  setElementAttribute(sessionId: string, nodeId: number, name: string, value: string): Promise<void>;
  
  // Screenshot and Visual Analysis
  captureScreenshot(sessionId: string, options?: ScreenshotOptions): Promise<Screenshot>;
  captureElementScreenshot(sessionId: string, selector: string): Promise<Screenshot>;
  
  // Runtime Evaluation
  evaluateExpression(sessionId: string, expression: string): Promise<any>;
  
  // Event Handling
  onFocusChanged(callback: (sessionId: string, focusState: FocusState) => void): void;
  onNavigationCompleted(callback: (sessionId: string, url: string) => void): void;
  onError(callback: (sessionId: string, error: CDPError) => void): void;
}

/**
 * CDP Error Types
 */
export interface CDPError {
  code: string;
  message: string;
  details?: any;
  sessionId?: string;
  recoverable: boolean;
}

/**
 * CDP Implementation Class
 * Requirements: 需求 1.1, 1.2 - 实现 CDP 连接管理和基础输入模拟功能
 */
export class ChromeCDPInterface implements CDPInterface {
  private sessions: Map<string, CDPSession> = new Map();
  private eventListeners: {
    focusChanged: ((sessionId: string, focusState: FocusState) => void)[];
    navigationCompleted: ((sessionId: string, url: string) => void)[];
    error: ((sessionId: string, error: CDPError) => void)[];
  } = {
    focusChanged: [],
    navigationCompleted: [],
    error: []
  };

  /**
   * Connect to a tab using Chrome Debugger API
   * Requirements: 需求 1.1 - 实现 CDP 连接管理
   */
  async connect(tabId: number): Promise<CDPSession> {
    try {
      // Check if already connected to this tab
      const existingSession = Array.from(this.sessions.values())
        .find(session => session.tabId === tabId && session.connected);
      
      if (existingSession) {
        return existingSession;
      }

      // Attach debugger to tab
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ tabId }, '1.3', () => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Failed to attach debugger: ${chrome.runtime.lastError.message}`));
          } else {
            resolve();
          }
        });
      });

      // Create session
      const sessionId = `cdp_${tabId}_${Date.now()}`;
      const session: CDPSession = {
        sessionId,
        tabId,
        connected: true,
        capabilities: {
          canSimulateInput: false,
          canCaptureScreenshots: false,
          canInjectCSS: false,
          canModifyDOM: false,
          runtimeEnabled: false,
          domEnabled: false,
          inputEnabled: false
        }
      };

      this.sessions.set(sessionId, session);

      // Set up event listeners
      this.setupEventListeners(sessionId, tabId);

      console.log(`CDP session established: ${sessionId} for tab ${tabId}`);
      return session;

    } catch (error) {
      const cdpError: CDPError = {
        code: 'CDP_CONNECTION_FAILED',
        message: `Failed to connect to tab ${tabId}`,
        details: error,
        recoverable: true
      };
      this.notifyError('', cdpError);
      throw cdpError;
    }
  }

  /**
   * Disconnect from a CDP session
   */
  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      // Detach debugger
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.detach({ tabId: session.tabId }, () => {
          if (chrome.runtime.lastError) {
            // Don't reject if already detached
            console.warn(`Debugger detach warning: ${chrome.runtime.lastError.message}`);
          }
          resolve();
        });
      });

      // Update session state
      session.connected = false;
      this.sessions.delete(sessionId);

      console.log(`CDP session disconnected: ${sessionId}`);

    } catch (error) {
      console.error(`Failed to disconnect CDP session ${sessionId}:`, error);
    }
  }

  /**
   * Check if session is connected
   */
  isConnected(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.connected ?? false;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CDPSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Enable Runtime domain
   */
  async enableRuntime(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected) {
      throw new Error(`Session ${sessionId} not connected`);
    }

    try {
      await this.sendCommand(session.tabId, 'Runtime.enable');
      session.capabilities.runtimeEnabled = true;
      console.log(`Runtime enabled for session ${sessionId}`);
    } catch (error) {
      throw new Error(`Failed to enable Runtime: ${error}`);
    }
  }

  /**
   * Enable DOM domain
   */
  async enableDOM(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected) {
      throw new Error(`Session ${sessionId} not connected`);
    }

    try {
      await this.sendCommand(session.tabId, 'DOM.enable');
      session.capabilities.domEnabled = true;
      session.capabilities.canModifyDOM = true;
      console.log(`DOM enabled for session ${sessionId}`);
    } catch (error) {
      throw new Error(`Failed to enable DOM: ${error}`);
    }
  }

  /**
   * Enable Input domain
   */
  async enableInput(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected) {
      throw new Error(`Session ${sessionId} not connected`);
    }

    try {
      await this.sendCommand(session.tabId, 'Input.enable');
      session.capabilities.inputEnabled = true;
      session.capabilities.canSimulateInput = true;
      console.log(`Input enabled for session ${sessionId}`);
    } catch (error) {
      throw new Error(`Failed to enable Input: ${error}`);
    }
  }

  /**
   * Enable Page domain
   */
  async enablePage(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected) {
      throw new Error(`Session ${sessionId} not connected`);
    }

    try {
      await this.sendCommand(session.tabId, 'Page.enable');
      session.capabilities.canCaptureScreenshots = true;
      session.capabilities.canInjectCSS = true;
      console.log(`Page enabled for session ${sessionId}`);
    } catch (error) {
      throw new Error(`Failed to enable Page: ${error}`);
    }
  }

  /**
   * Simulate Tab key navigation
   * Requirements: 需求 1.1 - 通过 CDP 模拟真实的 Tab 键和 Shift+Tab 键按下
   */
  async simulateTabNavigation(sessionId: string, direction: 'forward' | 'backward'): Promise<NavigationResult> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canSimulateInput) {
      throw new Error(`Session ${sessionId} not ready for input simulation`);
    }

    try {
      // Capture current focus state
      const previousFocus = await this.getCurrentFocus(sessionId);

      // Simulate Tab or Shift+Tab
      const modifiers: KeyModifier[] = direction === 'backward' ? ['Shift'] : [];
      await this.simulateKeyPress(sessionId, 'Tab', modifiers);

      // Wait a bit for focus to change
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture new focus state
      const currentFocus = await this.getCurrentFocus(sessionId);

      const result: NavigationResult = {
        success: true,
        previousFocus,
        currentFocus,
        focusChanged: previousFocus?.elementSelector !== currentFocus?.elementSelector,
      };

      console.log(`Tab navigation ${direction} completed:`, result);
      return result;

    } catch (error) {
      const result: NavigationResult = {
        success: false,
        previousFocus: null,
        currentFocus: null,
        focusChanged: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      console.error(`Tab navigation failed:`, error);
      return result;
    }
  }

  /**
   * Simulate key press
   * Requirements: 需求 1.1 - 实现键盘输入模拟
   */
  async simulateKeyPress(sessionId: string, key: string, modifiers: KeyModifier[] = []): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canSimulateInput) {
      throw new Error(`Session ${sessionId} not ready for input simulation`);
    }

    try {
      const modifierBits = this.getModifierBits(modifiers);

      // Send keyDown event
      await this.sendCommand(session.tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: this.getKeyCode(key),
        modifiers: modifierBits
      });

      // Send keyUp event
      await this.sendCommand(session.tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: this.getKeyCode(key),
        modifiers: modifierBits
      });

      console.log(`Key press simulated: ${key} with modifiers: ${modifiers.join('+')}`);

    } catch (error) {
      throw new Error(`Failed to simulate key press: ${error}`);
    }
  }

  /**
   * Simulate key sequence
   */
  async simulateKeySequence(sessionId: string, keys: KeyboardEvent[]): Promise<void> {
    for (const keyEvent of keys) {
      await this.simulateKeyPress(sessionId, keyEvent.key, keyEvent.modifiers);
      // Small delay between keys
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Simulate mouse click
   * Requirements: 需求 1.2 - 添加鼠标点击模拟
   */
  async simulateMouseClick(sessionId: string, x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canSimulateInput) {
      throw new Error(`Session ${sessionId} not ready for input simulation`);
    }

    try {
      const buttonMap = { left: 'left', right: 'right', middle: 'middle' };

      // Mouse pressed
      await this.sendCommand(session.tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: buttonMap[button],
        clickCount: 1
      });

      // Mouse released
      await this.sendCommand(session.tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: buttonMap[button],
        clickCount: 1
      });

      console.log(`Mouse click simulated at (${x}, ${y}) with ${button} button`);

    } catch (error) {
      throw new Error(`Failed to simulate mouse click: ${error}`);
    }
  }

  /**
   * Simulate mouse move
   */
  async simulateMouseMove(sessionId: string, x: number, y: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canSimulateInput) {
      throw new Error(`Session ${sessionId} not ready for input simulation`);
    }

    try {
      await this.sendCommand(session.tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y
      });

      console.log(`Mouse moved to (${x}, ${y})`);

    } catch (error) {
      throw new Error(`Failed to simulate mouse move: ${error}`);
    }
  }

  /**
   * Simulate drag and drop
   * Requirements: 需求 1.2 - 实现拖拽操作模拟
   */
  async simulateDragAndDrop(sessionId: string, startX: number, startY: number, endX: number, endY: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canSimulateInput) {
      throw new Error(`Session ${sessionId} not ready for input simulation`);
    }

    try {
      // Move to start position
      await this.simulateMouseMove(sessionId, startX, startY);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mouse down
      await this.sendCommand(session.tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: startX,
        y: startY,
        button: 'left',
        clickCount: 1
      });

      // Drag to end position (with intermediate steps for smooth drag)
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const x = startX + (endX - startX) * (i / steps);
        const y = startY + (endY - startY) * (i / steps);
        await this.simulateMouseMove(sessionId, x, y);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Mouse up
      await this.sendCommand(session.tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: endX,
        y: endY,
        button: 'left',
        clickCount: 1
      });

      console.log(`Drag and drop simulated from (${startX}, ${startY}) to (${endX}, ${endY})`);

    } catch (error) {
      throw new Error(`Failed to simulate drag and drop: ${error}`);
    }
  }

  /**
   * Simulate touch gesture
   * Requirements: 需求 1.2 - 支持触摸手势模拟
   */
  async simulateTouchGesture(sessionId: string, gesture: TouchEvent[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canSimulateInput) {
      throw new Error(`Session ${sessionId} not ready for input simulation`);
    }

    try {
      for (const touchEvent of gesture) {
        await this.sendCommand(session.tabId, 'Input.dispatchTouchEvent', {
          type: touchEvent.type,
          touchPoints: touchEvent.touchPoints.map(point => ({
            x: point.x,
            y: point.y,
            radiusX: point.radiusX || 1,
            radiusY: point.radiusY || 1,
            rotationAngle: point.rotationAngle || 0,
            force: point.force || 1
          }))
        });

        // Small delay between touch events
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log(`Touch gesture simulated with ${gesture.length} events`);

    } catch (error) {
      throw new Error(`Failed to simulate touch gesture: ${error}`);
    }
  }

  /**
   * Get current focus state
   * Requirements: 需求 1.1 - 添加焦点状态捕获功能
   */
  async getCurrentFocus(sessionId: string): Promise<FocusState | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.domEnabled) {
      throw new Error(`Session ${sessionId} not ready for DOM operations`);
    }

    try {
      // Get the currently focused element
      const result = await this.evaluateExpression(sessionId, `
        (function() {
          const activeElement = document.activeElement;
          if (!activeElement || activeElement === document.body) {
            return null;
          }
          
          const rect = activeElement.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(activeElement);
          
          // Generate a unique selector for the element
          function getSelector(element) {
            if (element.id) return '#' + element.id;
            if (element.className) {
              const classes = element.className.split(' ').filter(c => c).join('.');
              if (classes) return element.tagName.toLowerCase() + '.' + classes;
            }
            return element.tagName.toLowerCase();
          }
          
          return {
            selector: getSelector(activeElement),
            tagName: activeElement.tagName,
            tabIndex: activeElement.tabIndex,
            boundingRect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left
            },
            isVisible: rect.width > 0 && rect.height > 0 && computedStyle.visibility !== 'hidden',
            focusRingVisible: computedStyle.outline !== 'none' || computedStyle.boxShadow !== 'none'
          };
        })()
      `);

      if (!result) {
        return null;
      }

      const focusState: FocusState = {
        elementSelector: result.selector,
        nodeId: null, // Will be populated if needed
        boundingRect: result.boundingRect,
        isVisible: result.isVisible,
        tabIndex: result.tabIndex,
        focusRingVisible: result.focusRingVisible,
        timestamp: Date.now()
      };

      return focusState;

    } catch (error) {
      console.error(`Failed to get current focus:`, error);
      return null;
    }
  }

  /**
   * Set focus to an element
   */
  async setFocus(sessionId: string, selector: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.runtimeEnabled) {
      throw new Error(`Session ${sessionId} not ready for runtime operations`);
    }

    try {
      const result = await this.evaluateExpression(sessionId, `
        (function() {
          const element = document.querySelector('${selector}');
          if (element && typeof element.focus === 'function') {
            element.focus();
            return document.activeElement === element;
          }
          return false;
        })()
      `);

      console.log(`Focus set to ${selector}: ${result}`);
      return result;

    } catch (error) {
      console.error(`Failed to set focus to ${selector}:`, error);
      return false;
    }
  }

  /**
   * Blur current focused element
   */
  async blurElement(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.runtimeEnabled) {
      throw new Error(`Session ${sessionId} not ready for runtime operations`);
    }

    try {
      await this.evaluateExpression(sessionId, 'if (document.activeElement) document.activeElement.blur()');
    } catch (error) {
      console.error(`Failed to blur element:`, error);
    }
  }

  /**
   * Capture current focus state
   */
  async captureFocusState(sessionId: string): Promise<FocusState | null> {
    return this.getCurrentFocus(sessionId);
  }

  /**
   * Query selector
   */
  async querySelector(sessionId: string, selector: string): Promise<DOMNode | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.domEnabled) {
      throw new Error(`Session ${sessionId} not ready for DOM operations`);
    }

    try {
      const documentResult = await this.sendCommand(session.tabId, 'DOM.getDocument');
      const queryResult = await this.sendCommand(session.tabId, 'DOM.querySelector', {
        nodeId: documentResult.root.nodeId,
        selector
      });

      if (queryResult.nodeId === 0) {
        return null;
      }

      const nodeResult = await this.sendCommand(session.tabId, 'DOM.describeNode', {
        nodeId: queryResult.nodeId
      });

      return {
        nodeId: queryResult.nodeId,
        nodeName: nodeResult.node.nodeName,
        nodeType: nodeResult.node.nodeType,
        attributes: this.parseAttributes(nodeResult.node.attributes || [])
      };

    } catch (error) {
      console.error(`Failed to query selector ${selector}:`, error);
      return null;
    }
  }

  /**
   * Get computed styles by selector
   */
  async getComputedStylesBySelector(sessionId: string, selector: string): Promise<{ [property: string]: string }> {
    const element = await this.querySelector(sessionId, selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return this.getComputedStyle(sessionId, element.nodeId);
  }

  /**
   * Get element bounding rect
   */
  async getElementBoundingRect(sessionId: string, selector: string): Promise<DOMRect> {
    const element = await this.querySelector(sessionId, selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    const info = await this.getElementInfo(sessionId, element.nodeId);
    return info.boundingRect;
  }

  /**
   * Get viewport size
   */
  async getViewportSize(sessionId: string): Promise<{ width: number; height: number }> {
    return this.evaluateExpression(sessionId, `
      ({
        width: window.innerWidth,
        height: window.innerHeight
      })
    `);
  }

  /**
   * Discover all frames in the page
   * Requirements: Task 7.3.1 - 框架发现
   */
  async discoverFrames(sessionId: string): Promise<FrameInfo[]> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected) {
      throw new Error(`Session ${sessionId} not connected`);
    }

    try {
      const result = await this.sendCommand(session.tabId, 'Page.getFrameTree');
      const frames: FrameInfo[] = [];

      const traverse = (node: any) => {
        frames.push({
          frameId: node.frame.id,
          parentId: node.frame.parentId,
          url: node.frame.url,
          name: node.frame.name,
          securityOrigin: node.frame.securityOrigin,
          mimeType: node.frame.mimeType,
          unreachable: node.frame.unreachable
        });

        if (node.childFrames) {
          for (const child of node.childFrames) {
            traverse(child);
          }
        }
      };

      traverse(result.frameTree);
      return frames;

    } catch (error) {
      throw new Error(`Failed to discover frames: ${error}`);
    }
  }

  /**
   * Switch context to a specific frame
   */
  async switchToFrame(sessionId: string, frameId: string): Promise<void> {
    // In CDP, you often use the frameId in specific commands or switch execution context.
    // For many DOM commands, you might need to use Target.attachToTarget if it's an OOPIF.
    // Basic implementation: we'll just log it for now as a marker.
    console.log(`Switching to frame: ${frameId}`);
  }

  /**
   * Automatically attach to child frames (OOPIFs)
   * Requirements: Task 7.3.2 - 跨框架交互
   */
  async autoAttachIframes(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected) {
      throw new Error(`Session ${sessionId} not connected`);
    }

    try {
      await this.sendCommand(session.tabId, 'Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true
      });
      console.log(`Auto-attach enabled for session ${sessionId}`);
    } catch (error) {
      throw new Error(`Failed to enable auto-attach: ${error}`);
    }
  }

  /**
   * Query selector all
   */
  async querySelectorAll(sessionId: string, selector: string): Promise<DOMNode[]> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.domEnabled) {
      throw new Error(`Session ${sessionId} not ready for DOM operations`);
    }

    try {
      const documentResult = await this.sendCommand(session.tabId, 'DOM.getDocument');
      const queryResult = await this.sendCommand(session.tabId, 'DOM.querySelectorAll', {
        nodeId: documentResult.root.nodeId,
        selector
      });

      const nodes: DOMNode[] = [];
      for (const nodeId of queryResult.nodeIds) {
        if (nodeId !== 0) {
          const nodeResult = await this.sendCommand(session.tabId, 'DOM.describeNode', { nodeId });
          nodes.push({
            nodeId,
            nodeName: nodeResult.node.nodeName,
            nodeType: nodeResult.node.nodeType,
            attributes: this.parseAttributes(nodeResult.node.attributes || [])
          });
        }
      }

      return nodes;

    } catch (error) {
      console.error(`Failed to query selector all ${selector}:`, error);
      return [];
    }
  }

  /**
   * Get element info
   */
  async getElementInfo(sessionId: string, nodeId: number): Promise<ElementInfo> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.domEnabled) {
      throw new Error(`Session ${sessionId} not ready for DOM operations`);
    }

    try {
      const [nodeResult, boxModelResult, computedStyleResult] = await Promise.all([
        this.sendCommand(session.tabId, 'DOM.describeNode', { nodeId }),
        this.sendCommand(session.tabId, 'DOM.getBoxModel', { nodeId }).catch(() => null),
        this.sendCommand(session.tabId, 'CSS.getComputedStyleForNode', { nodeId }).catch(() => null)
      ]);

      const node = nodeResult.node;
      const attributes = this.parseAttributes(node.attributes || []);
      
      // Generate selector
      const selector = attributes.id ? `#${attributes.id}` : 
                      attributes.class ? `${node.nodeName.toLowerCase()}.${attributes.class.split(' ')[0]}` :
                      node.nodeName.toLowerCase();

      // Get bounding rect from box model
      let boundingRect: DOMRect = { 
        x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0,
        toJSON: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 })
      };
      if (boxModelResult?.model?.border) {
        const border = boxModelResult.model.border;
        boundingRect = {
          x: border[0],
          y: border[1],
          width: border[2] - border[0],
          height: border[5] - border[1],
          top: border[1],
          right: border[2],
          bottom: border[5],
          left: border[0],
          toJSON: () => ({
            x: border[0],
            y: border[1],
            width: border[2] - border[0],
            height: border[5] - border[1],
            top: border[1],
            right: border[2],
            bottom: border[5],
            left: border[0]
          })
        };
      }

      // Parse computed style
      const computedStyle: { [property: string]: string } = {};
      if (computedStyleResult?.computedStyle) {
        for (const style of computedStyleResult.computedStyle) {
          computedStyle[style.name] = style.value;
        }
      }

      return {
        nodeId,
        selector,
        tagName: node.nodeName,
        attributes,
        boundingRect,
        computedStyle,
        isVisible: boundingRect.width > 0 && boundingRect.height > 0,
        isFocusable: this.isFocusableElement(node.nodeName, attributes)
      };

    } catch (error) {
      throw new Error(`Failed to get element info for node ${nodeId}: ${error}`);
    }
  }

  /**
   * Get computed style
   */
  async getComputedStyle(sessionId: string, nodeId: number): Promise<{ [property: string]: string }> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.domEnabled) {
      throw new Error(`Session ${sessionId} not ready for DOM operations`);
    }

    try {
      const result = await this.sendCommand(session.tabId, 'CSS.getComputedStyleForNode', { nodeId });
      
      const computedStyle: { [property: string]: string } = {};
      for (const style of result.computedStyle) {
        computedStyle[style.name] = style.value;
      }

      return computedStyle;

    } catch (error) {
      throw new Error(`Failed to get computed style for node ${nodeId}: ${error}`);
    }
  }

  /**
   * Add style sheet
   */
  async addStyleSheet(sessionId: string, css: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canInjectCSS) {
      throw new Error(`Session ${sessionId} not ready for CSS injection`);
    }

    try {
      const result = await this.sendCommand(session.tabId, 'CSS.createStyleSheet', {
        frameId: await this.getMainFrameId(session.tabId)
      });

      await this.sendCommand(session.tabId, 'CSS.setStyleSheetText', {
        styleSheetId: result.styleSheetId,
        text: css
      });

      console.log(`Style sheet added: ${result.styleSheetId}`);
      return result.styleSheetId;

    } catch (error) {
      throw new Error(`Failed to add style sheet: ${error}`);
    }
  }

  /**
   * Remove style sheet
   */
  async removeStyleSheet(sessionId: string, styleSheetId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canInjectCSS) {
      throw new Error(`Session ${sessionId} not ready for CSS operations`);
    }

    try {
      await this.sendCommand(session.tabId, 'CSS.setStyleSheetText', {
        styleSheetId,
        text: ''
      });

      console.log(`Style sheet removed: ${styleSheetId}`);

    } catch (error) {
      throw new Error(`Failed to remove style sheet: ${error}`);
    }
  }

  /**
   * Set element attribute
   */
  async setElementAttribute(sessionId: string, nodeId: number, name: string, value: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canModifyDOM) {
      throw new Error(`Session ${sessionId} not ready for DOM modification`);
    }

    try {
      await this.sendCommand(session.tabId, 'DOM.setAttributeValue', {
        nodeId,
        name,
        value
      });

      console.log(`Attribute set: ${name}="${value}" on node ${nodeId}`);

    } catch (error) {
      throw new Error(`Failed to set attribute: ${error}`);
    }
  }

  /**
   * Capture screenshot
   */
  async captureScreenshot(sessionId: string, options: ScreenshotOptions = {}): Promise<Screenshot> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.canCaptureScreenshots) {
      throw new Error(`Session ${sessionId} not ready for screenshots`);
    }

    try {
      const result = await this.sendCommand(session.tabId, 'Page.captureScreenshot', {
        format: options.format || 'png',
        quality: options.quality,
        clip: options.clip,
        fromSurface: options.fromSurface
      });

      return {
        data: result.data,
        format: options.format || 'png',
        timestamp: Date.now(),
        dimensions: {
          width: options.clip?.width || 0,
          height: options.clip?.height || 0
        }
      };

    } catch (error) {
      throw new Error(`Failed to capture screenshot: ${error}`);
    }
  }

  /**
   * Capture element screenshot
   */
  async captureElementScreenshot(sessionId: string, selector: string): Promise<Screenshot> {
    const element = await this.querySelector(sessionId, selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const elementInfo = await this.getElementInfo(sessionId, element.nodeId);
    
    return this.captureScreenshot(sessionId, {
      clip: {
        x: elementInfo.boundingRect.x,
        y: elementInfo.boundingRect.y,
        width: elementInfo.boundingRect.width,
        height: elementInfo.boundingRect.height,
        scale: 1
      }
    });
  }

  /**
   * Evaluate expression
   */
  async evaluateExpression(sessionId: string, expression: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.connected || !session.capabilities.runtimeEnabled) {
      throw new Error(`Session ${sessionId} not ready for runtime operations`);
    }

    try {
      const result = await this.sendCommand(session.tabId, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });

      if (result.exceptionDetails) {
        throw new Error(`Runtime evaluation failed: ${result.exceptionDetails.text}`);
      }

      return result.result.value;

    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${error}`);
    }
  }

  /**
   * Event listener registration
   */
  onFocusChanged(callback: (sessionId: string, focusState: FocusState) => void): void {
    this.eventListeners.focusChanged.push(callback);
  }

  onNavigationCompleted(callback: (sessionId: string, url: string) => void): void {
    this.eventListeners.navigationCompleted.push(callback);
  }

  onError(callback: (sessionId: string, error: CDPError) => void): void {
    this.eventListeners.error.push(callback);
  }

  // Private helper methods

  private async sendCommand(tabId: number, method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  private setupEventListeners(sessionId: string, tabId: number): void {
    // Listen for debugger events
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId !== tabId) return;

      switch (method) {
        case 'Runtime.executionContextCreated':
          console.log(`Execution context created for session ${sessionId}`);
          break;
        
        case 'Page.loadEventFired':
          this.notifyNavigationCompleted(sessionId, ''); // URL will be fetched separately
          break;
        
        case 'Runtime.exceptionThrown':
          this.notifyError(sessionId, {
            code: 'RUNTIME_EXCEPTION',
            message: (params as any)?.exceptionDetails?.text || 'Runtime exception occurred',
            details: params,
            recoverable: true
          });
          break;
      }
    });

    // Listen for debugger detach
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === tabId) {
        console.log(`Debugger detached from tab ${tabId}: ${reason}`);
        const session = this.sessions.get(sessionId);
        if (session) {
          session.connected = false;
        }
      }
    });
  }

  private getModifierBits(modifiers: KeyModifier[]): number {
    let bits = 0;
    if (modifiers.includes('Alt')) bits |= 1;
    if (modifiers.includes('Ctrl')) bits |= 2;
    if (modifiers.includes('Meta')) bits |= 4;
    if (modifiers.includes('Shift')) bits |= 8;
    return bits;
  }

  private getKeyCode(key: string): string {
    const keyCodeMap: { [key: string]: string } = {
      'Tab': 'Tab',
      'Enter': 'Enter',
      'Escape': 'Escape',
      'Space': 'Space',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown'
    };
    return keyCodeMap[key] || key;
  }

  private parseAttributes(attributes: string[]): { [key: string]: string } {
    const result: { [key: string]: string } = {};
    for (let i = 0; i < attributes.length; i += 2) {
      const key = attributes[i];
      if (i + 1 < attributes.length && key !== undefined) {
        result[key as string] = attributes[i + 1]!;
      }
    }
    return result;
  }

  private isFocusableElement(tagName: string, attributes: { [key: string]: string }): boolean {
    const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS'];
    
    if (focusableTags.includes(tagName.toUpperCase())) {
      return true;
    }
    
    if (attributes.tabindex !== undefined) {
      const tabIndex = parseInt(attributes.tabindex, 10);
      return !isNaN(tabIndex) && tabIndex >= 0;
    }
    
    return attributes.contenteditable === 'true';
  }

  private async getMainFrameId(tabId: number): Promise<string> {
    try {
      const result = await this.sendCommand(tabId, 'Page.getFrameTree');
      return result.frameTree.frame.id;
    } catch (error) {
      throw new Error(`Failed to get main frame ID: ${error}`);
    }
  }

  private notifyFocusChanged(sessionId: string, focusState: FocusState): void {
    this.eventListeners.focusChanged.forEach(callback => {
      try {
        callback(sessionId, focusState);
      } catch (error) {
        console.error('Error in focus changed callback:', error);
      }
    });
  }

  private notifyNavigationCompleted(sessionId: string, url: string): void {
    this.eventListeners.navigationCompleted.forEach(callback => {
      try {
        callback(sessionId, url);
      } catch (error) {
        console.error('Error in navigation completed callback:', error);
      }
    });
  }

  private notifyError(sessionId: string, error: CDPError): void {
    this.eventListeners.error.forEach(callback => {
      try {
        callback(sessionId, error);
      } catch (error) {
        console.error('Error in error callback:', error);
      }
    });
  }
}

/**
 * Factory function to create CDP interface
 */
export function createCDPInterface(): CDPInterface {
  return new ChromeCDPInterface();
}

/**
 * Utility functions for CDP operations
 */
export class CDPUtils {
  /**
   * Check if CDP is available in the current context
   */
  static isCDPAvailable(): boolean {
    return typeof chrome !== 'undefined' && 
           chrome.debugger !== undefined &&
           chrome.permissions !== undefined;
  }

  /**
   * Request debugger permission if not already granted
   */
  static async requestDebuggerPermission(): Promise<boolean> {
    if (!this.isCDPAvailable()) {
      return false;
    }

    try {
      return await chrome.permissions.request({
        permissions: ['debugger']
      });
    } catch (error) {
      console.error('Failed to request debugger permission:', error);
      return false;
    }
  }

  /**
   * Check if debugger permission is granted
   */
  static async hasDebuggerPermission(): Promise<boolean> {
    if (!this.isCDPAvailable()) {
      return false;
    }

    try {
      return await chrome.permissions.contains({
        permissions: ['debugger']
      });
    } catch (error) {
      console.error('Failed to check debugger permission:', error);
      return false;
    }
  }

  /**
   * Get active tab for CDP operations
   */
  static async getActiveTab(): Promise<chrome.tabs.Tab | null> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0] || null;
    } catch (error) {
      console.error('Failed to get active tab:', error);
      return null;
    }
  }

  /**
   * Validate tab for CDP operations
   */
  static isValidTabForCDP(tab: chrome.tabs.Tab): boolean {
    return tab.id !== undefined && 
           tab.url !== undefined &&
           !tab.url.startsWith('chrome://') &&
           !tab.url.startsWith('chrome-extension://') &&
           !tab.url.startsWith('moz-extension://');
  }
}