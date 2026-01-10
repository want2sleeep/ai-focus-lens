// Core data types for AI Focus Lens extension

export interface SerializableRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  toJSON?: () => any;
}

/**
 * Represents a focusable element on the webpage with all necessary data for analysis
 * Requirements: 需求 1.2 - 收集元素的 computedStyle、位置信息、outline、box-shadow 和 border 属性
 */
export interface FocusableElement {
  selector: string;
  tagName: string;
  tabIndex: number;
  computedStyle: ComputedStyleData;
  boundingRect: SerializableRect;
  focusedStyle?: ComputedStyleData;
  unfocusedStyle?: ComputedStyleData;
  // Additional metadata for ACT rule oj04fd compliance
  isSequentialFocusElement: boolean;
  isInViewport: boolean;
  elementId?: string;
  className?: string;
  ariaLabel?: string;
  frameId?: string | undefined;
  externalIndicators?: string[];
}

/**
 * Comprehensive computed style data for focus visibility analysis
 * Requirements: 需求 1.2 - 收集样式属性数据
 */
export interface ComputedStyleData {
  outline: string;
  outlineColor: string;
  outlineWidth: string;
  outlineStyle: string;
  outlineOffset: string;
  boxShadow: string;
  border: string;
  borderColor: string;
  borderWidth: string;
  borderStyle: string;
  borderRadius: string;
  backgroundColor: string;
  color: string;
  opacity: string;
  visibility: string;
  display: string;
  position: string;
  zIndex: string;
  // HSL color values for ACT rule oj04fd analysis
  hslValues?: {
    outline: HSLColor;
    border: HSLColor;
    boxShadow: HSLColor;
    background: HSLColor;
  };
}

/**
 * HSL color representation for focus visibility analysis
 * Requirements: 需求 2.1 - ACT 规则 oj04fd 颜色差异检测
 */
export interface HSLColor {
  hue: number;        // 0-360
  saturation: number; // 0-100
  lightness: number;  // 0-100
  alpha?: number;     // 0-1
}

/**
 * Complete analysis data for a webpage
 * Requirements: 需求 1.4 - 结构化的 JSON 数据发送给 Background_Service
 */
export interface ElementAnalysisData {
  elements: FocusableElement[];
  pageUrl: string;
  timestamp: number;
  viewport: {
    width: number;
    height: number;
  };
  pageMetadata: {
    title: string;
    domain: string;
    userAgent: string;
    documentReadyState: string;
  };
  scanSettings: {
    includeHiddenElements: boolean;
    minimumContrastRatio: number;
    focusIndicatorThreshold: number;
  };
}

/**
 * OpenAI compatible LLM API request structure
 * Requirements: 需求 2.2 - 发送包含元素 JSON 数据的请求
 */
export interface LLMRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature: number;
  max_tokens: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
}

/**
 * OpenAI compatible LLM API response structure
 * Requirements: 需求 2.3 - 解析结构化的 JSON 结论
 */
export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Focus visibility analysis result from LLM
 * Requirements: 需求 2.3 - 包含 status、reason、suggestion 字段
 */
export interface FocusVisibilityResult {
  status: 'PASS' | 'FAIL' | 'INAPPLICABLE' | 'CANTELL';
  reason: string;
  suggestion: string;
  confidence: number; // 0-1
  actRuleCompliance: {
    ruleId: 'oj04fd';
    outcome: 'passed' | 'failed' | 'inapplicable' | 'cantell';
    details: string;
  };
  colorAnalysis?: {
    focusedHSL: HSLColor;
    unfocusedHSL: HSLColor;
    colorDifference: number;
    meetsThreshold: boolean;
  };
}

/**
 * Analysis result for a single element
 */
export interface AnalysisResult {
  elementSelector: string;
  result: FocusVisibilityResult;
  timestamp: number;
  processingTime: number; // milliseconds
  apiCallId?: string;
  retryCount?: number;
}

/**
 * Extension configuration interface
 * Requirements: 需求 3.2 - 安全地存储配置信息
 */
export interface ExtensionConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  batchSize: number;
  cacheEnabled: boolean;
  timeout: number; // API request timeout in milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
}

/**
 * Scan progress tracking
 */
export interface ScanProgress {
  total: number;
  completed: number;
  failed: number;
  status: 'idle' | 'initializing' | 'scanning' | 'completed' | 'error' | 'cancelled';
  currentElement?: string;
  estimatedTimeRemaining?: number; // milliseconds
  estimatedTime?: number; // milliseconds
  startTime?: number;
  errors?: string[];
  metrics?: PerformanceMetrics; // Added for batch processing metrics
}

/**
 * Complete scan report
 */
export interface ScanReport {
  pageUrl: string;
  totalElements: number;
  passedElements: number;
  failedElements: number;
  inapplicableElements: number;
  cantellElements: number;
  results: AnalysisResult[];
  scanDuration: number; // milliseconds
  scanId: string;
  timestamp: number;
  configuration: {
    model: string;
    batchSize: number;
    cacheUsed: boolean;
  };
  summary: {
    overallCompliance: number; // percentage
    commonIssues: string[];
    recommendations: string[];
  };
  edgeCaseInfo?: {
    type: 'no-elements' | 'large-page' | 'critical-error' | 'network-issue';
    message: string;
    suggestions: string[];
    fallbackAction?: string;
    warnings?: string[];
  };
}

/**
 * Stored configuration with encryption and versioning
 * Requirements: 需求 3.2 - 安全地存储配置信息
 */
export interface StoredConfig {
  version: string;
  apiKey: string; // Should be encrypted when stored
  baseUrl: string;
  model: string;
  preferences: {
    batchSize: number;
    cacheEnabled: boolean;
    highlightColor: string;
    autoScan: boolean;
    timeout: number;
    maxRetries: number;
    retryDelay: number;
    enableLogging: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
  };
  lastUpdated: number;
  migrationVersion: number;
}

/**
 * Cache entry for storing analysis results
 */
export interface CacheEntry {
  pageUrl: string;
  pageHash: string; // SHA-256 hash of page content
  results: AnalysisResult[];
  timestamp: number;
  expiresAt: number;
  scanId: string;
  configHash: string; // Hash of configuration used for this scan
  metadata: {
    elementCount: number;
    scanDuration: number;
    cacheHits: number;
  };
}

/**
 * ACT Rule oj04fd implementation for focus visibility testing
 * Requirements: 需求 2.1 - 构建符合 ACT 规则 oj04fd 的 System Prompt
 */
export interface ACTRuleOJ04FD {
  ruleId: 'oj04fd';
  ruleName: 'Focus visible';
  ruleDescription: 'Each element in sequential focus order has some visible focus indicator';
  applicability: {
    // Element must be part of sequential focus navigation
    isSequentialFocusElement: boolean;
    // Element must be in the viewport
    isInViewport: boolean;
    // Element must not be hidden
    isVisible: boolean;
    // Additional applicability checks
    hasValidTabIndex: boolean;
    isInteractiveElement: boolean;
  };
  expectation: {
    // At least one device pixel in the viewport has a different HSL color value
    hasVisibleFocusIndicator: boolean;
    colorDifference: {
      focusedHSL: HSLColor;
      unfocusedHSL: HSLColor;
      threshold: number; // Minimum perceptible difference (default: 3)
      actualDifference: number;
    };
    // Additional focus indicator checks
    focusIndicatorProperties: {
      hasOutline: boolean;
      hasBoxShadow: boolean;
      hasBorderChange: boolean;
      hasBackgroundChange: boolean;
      hasColorChange: boolean;
    };
  };
  testResult: {
    outcome: 'passed' | 'failed' | 'inapplicable' | 'cantell';
    details: string;
    evidence: {
      beforeFocusScreenshot?: string;
      afterFocusScreenshot?: string;
      styleComparison: ComputedStyleData;
    };
  };
}

// Message types for communication between components
export interface Message {
  type: string;
  payload?: unknown;
  timestamp?: number;
  messageId?: string;
}

export interface ContentScriptMessage extends Message {
  type: 'ELEMENTS_ANALYZED' | 'HIGHLIGHT_ELEMENT' | 'CLEAR_HIGHLIGHTS' | 'FOCUS_ELEMENT' | 'BLUR_ELEMENT' | 'START_ANALYSIS';
  payload?: ElementAnalysisData | { selector: string } | { selector: string; highlight: boolean } | { scanId: string } | undefined;
}

export interface PopupMessage extends Message {
  type: 'START_SCAN' | 'START_AGENT_SCAN' | 'GET_AGENT_STATUS' | 'TEST_FOCUS_TRAPS' | 'GET_RESULTS' | 'GET_CONFIG' | 'SAVE_CONFIG' | 'CANCEL_SCAN' | 'CLEAR_CACHE' | 'TEST_CONNECTION';
  payload?: ExtensionConfig | { scanId?: string } | undefined;
}

export interface ServiceWorkerMessage extends Message {
  type: 'SCAN_PROGRESS' | 'SCAN_COMPLETE' | 'SCAN_ERROR' | 'CONFIG_UPDATED' | 'CACHE_CLEARED' | 'API_ERROR' | 'GLOBAL_ERROR_NOTIFICATION' | 'NOTIFICATIONS_UPDATED';
  payload?: ScanProgress | ScanReport | ExtensionError | ExtensionConfig | { success: boolean } | { error: any; userMessage: string; suggestions: string[] };
}

/**
 * Error handling types
 * Requirements: 需求 2.4 - 优雅地处理错误并提供用户友好的错误信息
 */
export interface ExtensionError {
  code: string;
  message: string;
  details?: string;
  timestamp: number;
  context?: {
    component: 
      | 'content-script' 
      | 'service-worker' 
      | 'popup' 
      | 'storage-manager' 
      | 'cache-manager' 
      | 'prar-loop' 
      | 'perception-engine' 
      | 'planning-engine' 
      | 'reflection-engine' 
      | 'accessibility-testing-agent'
      | 'action-engine'
      | 'cdp-interface'
      | 'focus-trap-detector';
    action: string;
    elementSelector?: string;
    apiEndpoint?: string;
    [key: string]: any; // Allow additional context properties
  };
  recoverable: boolean;
  retryable: boolean;
  edgeCaseInfo?: {
    type: string;
    message: string;
    suggestions: string[];
    fallbackAction?: string | undefined;
  };
}

export type ErrorCode = 
  | 'API_KEY_INVALID'
  | 'API_ENDPOINT_UNREACHABLE'
  | 'API_RATE_LIMIT_EXCEEDED'
  | 'API_RESPONSE_INVALID'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'STORAGE_ERROR'
  | 'CONTENT_SCRIPT_ERROR'
  | 'PARSING_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Validation result types
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * API client configuration
 */
export interface APIClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  userAgent: string;
}

/**
 * Batch processing configuration
 */
export interface BatchConfig {
  batchSize: number;
  concurrency: number;
  delayBetweenBatches: number;
  maxBatchRetries: number;
}

/**
 * Element highlighting configuration
 */
export interface HighlightConfig {
  color: string;
  thickness: number;
  style: 'solid' | 'dashed' | 'dotted';
  duration: number; // milliseconds, 0 for permanent
  zIndex: number;
}

/**
 * Logging configuration
 */
export interface LogConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  maxEntries: number;
  includeStackTrace: boolean;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  scanStartTime: number;
  scanEndTime: number;
  totalDuration: number;
  elementAnalysisTime: number;
  apiCallTime: number;
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  failedApiCalls: number;
  retryCount: number;
  memoryUsage?: {
    used: number;
    total: number;
  };
}

/**
 * Constants and enums
 */
export const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'details',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  'audio[controls]',
  'video[controls]',
  'iframe',
  'embed',
  'object',
  'area[href]'
] as const;

export const DEFAULT_CONFIG: Readonly<ExtensionConfig> = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4',
  batchSize: 5,
  cacheEnabled: true,
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000
} as const;

export const DEFAULT_STORED_CONFIG: Readonly<StoredConfig> = {
  version: '1.0.0',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4',
  preferences: {
    batchSize: 5,
    cacheEnabled: true,
    highlightColor: '#ff6b6b',
    autoScan: false,
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    enableLogging: true,
    logLevel: 'info'
  },
  lastUpdated: Date.now(),
  migrationVersion: 1
} as const;

export const ACT_RULE_OJ04FD_THRESHOLD = 3; // Minimum color difference threshold

export const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const MAX_ELEMENTS_PER_SCAN = 100; // Prevent overwhelming the API

/**
 * Type guards for runtime type checking
 */
export function isFocusableElement(obj: unknown): obj is FocusableElement {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'selector' in obj &&
    'tagName' in obj &&
    'tabIndex' in obj &&
    'computedStyle' in obj &&
    'boundingRect' in obj
  );
}

export function isElementAnalysisData(obj: unknown): obj is ElementAnalysisData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'elements' in obj &&
    'pageUrl' in obj &&
    'timestamp' in obj &&
    'viewport' in obj &&
    Array.isArray((obj as ElementAnalysisData).elements)
  );
}

export function isLLMResponse(obj: unknown): obj is LLMResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'choices' in obj &&
    Array.isArray((obj as LLMResponse).choices)
  );
}

export function isFocusVisibilityResult(obj: unknown): obj is FocusVisibilityResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'status' in obj &&
    'reason' in obj &&
    'suggestion' in obj &&
    'confidence' in obj
  );
}

export function isExtensionError(obj: unknown): obj is ExtensionError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    'message' in obj &&
    'timestamp' in obj &&
    'recoverable' in obj &&
    'retryable' in obj
  );
}

/**
 * Utility types for better type safety
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Event types for extension lifecycle
 */
export interface ExtensionEvent {
  type: string;
  timestamp: number;
  data?: unknown;
}

export interface ScanStartedEvent extends ExtensionEvent {
  type: 'SCAN_STARTED';
  data: {
    pageUrl: string;
    elementCount: number;
    scanId: string;
  };
}

export interface ScanCompletedEvent extends ExtensionEvent {
  type: 'SCAN_COMPLETED';
  data: ScanReport;
}

export interface ErrorEvent extends ExtensionEvent {
  type: 'ERROR';
  data: ExtensionError;
}

export type ExtensionEventType = ScanStartedEvent | ScanCompletedEvent | ErrorEvent;
// Re-export ACT rule types and utilities
export * from './act-rule';

// Re-export validation utilities
export * from './validation';