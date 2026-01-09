// Core data types for AI Focus Lens extension

export interface FocusableElement {
  selector: string;
  tagName: string;
  tabIndex: number;
  computedStyle: {
    outline: string;
    outlineColor: string;
    outlineWidth: string;
    outlineStyle: string;
    boxShadow: string;
    border: string;
    borderColor: string;
    borderWidth: string;
    borderStyle: string;
  };
  boundingRect: DOMRect;
  focusedStyle?: ComputedStyleData;
  unfocusedStyle?: ComputedStyleData;
}

export interface ComputedStyleData {
  outline: string;
  outlineColor: string;
  outlineWidth: string;
  outlineStyle: string;
  boxShadow: string;
  border: string;
  borderColor: string;
  borderWidth: string;
  borderStyle: string;
}

export interface ElementAnalysisData {
  elements: FocusableElement[];
  pageUrl: string;
  timestamp: number;
  viewport: {
    width: number;
    height: number;
  };
}

export interface LLMRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  temperature: number;
  max_tokens: number;
}

export interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface FocusVisibilityResult {
  status: 'PASS' | 'FAIL';
  reason: string;
  suggestion: string;
  confidence: number;
}

export interface AnalysisResult {
  elementSelector: string;
  result: FocusVisibilityResult;
  timestamp: number;
}

export interface ExtensionConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  batchSize: number;
  cacheEnabled: boolean;
}

export interface ScanProgress {
  total: number;
  completed: number;
  status: 'idle' | 'scanning' | 'completed' | 'error';
  currentElement?: string;
}

export interface ScanReport {
  pageUrl: string;
  totalElements: number;
  passedElements: number;
  failedElements: number;
  results: AnalysisResult[];
  scanDuration: number;
}

export interface StoredConfig {
  version: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  preferences: {
    batchSize: number;
    cacheEnabled: boolean;
    highlightColor: string;
    autoScan: boolean;
  };
}

export interface CacheEntry {
  pageUrl: string;
  pageHash: string;
  results: AnalysisResult[];
  timestamp: number;
  expiresAt: number;
}

export interface ACTRuleOJ04FD {
  applicability: {
    isSequentialFocusElement: boolean;
    isInViewport: boolean;
  };
  expectation: {
    hasVisibleFocusIndicator: boolean;
    colorDifference: {
      focusedHSL: [number, number, number];
      unfocusedHSL: [number, number, number];
      threshold: number;
    };
  };
}

// Message types for communication between components
export interface Message {
  type: string;
  payload?: unknown;
}

export interface ContentScriptMessage extends Message {
  type: 'ELEMENTS_ANALYZED' | 'HIGHLIGHT_ELEMENT' | 'CLEAR_HIGHLIGHTS';
  payload?: ElementAnalysisData | { selector: string } | undefined;
}

export interface PopupMessage extends Message {
  type: 'START_SCAN' | 'GET_RESULTS' | 'GET_CONFIG' | 'SAVE_CONFIG';
  payload?: ExtensionConfig | undefined;
}

export interface ServiceWorkerMessage extends Message {
  type: 'SCAN_PROGRESS' | 'SCAN_COMPLETE' | 'SCAN_ERROR' | 'CONFIG_UPDATED';
  payload?: ScanProgress | ScanReport | { error: string } | ExtensionConfig;
}