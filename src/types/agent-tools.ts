/**
 * Agent Tool Definitions
 * Based on .kiro/specs/accessibility-testing-agent/design.md
 */

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface GetPageStateParams {
  includeHtml?: boolean;
}

export type KeyType = 'keyDown' | 'keyUp' | 'char';

export interface SimulateKeyboardParams {
  key: string;
  code?: string;
  modifiers?: ('Shift' | 'Control' | 'Alt' | 'Meta')[];
  type?: KeyType;
}

export interface SimulateClickParams {
  selector: string;
  x?: number;
  y?: number;
}

export interface InjectCSSParams {
  css: string;
  selector?: string; // Optional context
  description: string; // Reason for injection
}

export interface CaptureScreenshotParams {
  selector?: string; // If provided, captures element; else viewport
  highlight?: boolean;
}

export interface GetComputedStyleParams {
  selector: string;
  properties?: string[];
}

export interface CheckFocusStatusParams {
  selector: string;
}

// Result types
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}
