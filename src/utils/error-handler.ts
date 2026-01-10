// Error Handling and Retry Mechanism for AI Focus Lens
// Requirements: 需求 2.4, 5.1, 5.2 - 处理 API 调用失败、超时等错误，实现指数退避重试策略

import { 
  ExtensionError, 
  ErrorCode,
  ExtensionConfig
} from '../types';

/**
 * Retry configuration for different types of operations
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean; // Add random jitter to prevent thundering herd
}

/**
 * Default retry configurations for different error types
 */
export const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  'API_RATE_LIMIT_EXCEEDED': {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  },
  'NETWORK_ERROR': {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true
  },
  'TIMEOUT_ERROR': {
    maxRetries: 3,
    baseDelay: 1500,
    maxDelay: 15000,
    backoffMultiplier: 2,
    jitter: true
  },
  'API_ENDPOINT_UNREACHABLE': {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 20000,
    backoffMultiplier: 2.5,
    jitter: true
  },
  'DEFAULT': {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: false
  }
};

/**
 * Error Handler class for managing errors and retries
 * Requirements: 需求 2.4 - 优雅地处理错误并提供用户友好的错误信息
 */
export class ErrorHandler {
  private config: ExtensionConfig;
  private retryConfigs: Record<string, RetryConfig>;

  constructor(config: ExtensionConfig, customRetryConfigs?: Record<string, RetryConfig>) {
    this.config = config;
    this.retryConfigs = { ...DEFAULT_RETRY_CONFIGS, ...customRetryConfigs };
  }

  /**
   * Execute a function with retry logic
   * Requirements: 需求 2.4 - 实现指数退避重试策略
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      operationName: string;
      component: 'content-script' | 'service-worker' | 'popup';
      elementSelector?: string;
      apiEndpoint?: string;
    }
  ): Promise<T> {
    let lastError: ExtensionError | null = null;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.normalizeError(error, {
          component: context.component,
          action: context.operationName,
          ...(context.elementSelector && { elementSelector: context.elementSelector }),
          ...(context.apiEndpoint && { apiEndpoint: context.apiEndpoint })
        });
        
        // Don't retry if error is not retryable or we've exceeded max retries
        if (!lastError.retryable || attempt >= this.config.maxRetries) {
          throw lastError;
        }

        // Calculate delay for next retry
        const delay = this.calculateRetryDelay(lastError.code, attempt);
        
        console.warn(`Operation ${context.operationName} failed (attempt ${attempt + 1}/${this.config.maxRetries + 1}):`, lastError.message);
        console.warn(`Retrying in ${delay}ms...`);

        await this.sleep(delay);
        attempt++;
      }
    }

    throw lastError || this.createError('UNKNOWN_ERROR', 'Maximum retries exceeded', {
      component: context.component,
      action: context.operationName,
      ...(context.elementSelector && { elementSelector: context.elementSelector }),
      ...(context.apiEndpoint && { apiEndpoint: context.apiEndpoint })
    });
  }

  /**
   * Handle and categorize errors
   * Requirements: 需求 5.1, 5.2 - 处理各种错误情况
   */
  handleError(error: unknown, context: {
    component: 'content-script' | 'service-worker' | 'popup';
    action: string;
    elementSelector?: string;
    apiEndpoint?: string;
  }): ExtensionError {
    const normalizedError = this.normalizeError(error, context);
    
    // Log error for debugging
    this.logError(normalizedError);
    
    // Send error to popup for user notification if needed
    if (normalizedError.code === 'API_KEY_INVALID' || 
        normalizedError.code === 'API_ENDPOINT_UNREACHABLE' ||
        !normalizedError.recoverable) {
      this.notifyUser(normalizedError);
    }

    return normalizedError;
  }

  /**
   * Create user-friendly error messages
   * Requirements: 需求 2.4 - 提供用户友好的错误信息
   */
  getUserFriendlyMessage(error: ExtensionError): string {
    const errorMessages: Record<ErrorCode, string> = {
      'API_KEY_INVALID': 'Invalid API key. Please check your OpenAI API key in the extension settings.',
      'API_ENDPOINT_UNREACHABLE': 'Unable to connect to the AI service. Please check your internet connection and API endpoint URL.',
      'API_RATE_LIMIT_EXCEEDED': 'API rate limit exceeded. The extension will automatically retry in a few moments.',
      'API_RESPONSE_INVALID': 'Received an invalid response from the AI service. Please try again.',
      'NETWORK_ERROR': 'Network connection error. Please check your internet connection and try again.',
      'TIMEOUT_ERROR': 'Request timed out. The AI service may be experiencing high load. Please try again.',
      'STORAGE_ERROR': 'Unable to save or retrieve settings. Please check your browser permissions.',
      'CONTENT_SCRIPT_ERROR': 'Unable to analyze the webpage. Please refresh the page and try again.',
      'PARSING_ERROR': 'Unable to process the analysis results. Please try again.',
      'VALIDATION_ERROR': 'Invalid configuration or data. Please check your settings.',
      'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again or contact support if the problem persists.'
    };

    return errorMessages[error.code as ErrorCode] || error.message;
  }

  /**
   * Get recovery suggestions for errors
   */
  getRecoverySuggestions(error: ExtensionError): string[] {
    const suggestions: Record<ErrorCode, string[]> = {
      'API_KEY_INVALID': [
        'Verify your OpenAI API key is correct',
        'Check that your API key has sufficient credits',
        'Ensure the API key has the necessary permissions'
      ],
      'API_ENDPOINT_UNREACHABLE': [
        'Check your internet connection',
        'Verify the API endpoint URL is correct',
        'Try again in a few minutes',
        'Check if the AI service is experiencing downtime'
      ],
      'API_RATE_LIMIT_EXCEEDED': [
        'Wait a few minutes before trying again',
        'Consider reducing the batch size in settings',
        'Upgrade your API plan if you frequently hit limits'
      ],
      'NETWORK_ERROR': [
        'Check your internet connection',
        'Try refreshing the page',
        'Disable VPN or proxy if using one',
        'Try again in a few minutes'
      ],
      'TIMEOUT_ERROR': [
        'Try again with a smaller batch size',
        'Check your internet connection speed',
        'Increase the timeout value in settings'
      ],
      'CONTENT_SCRIPT_ERROR': [
        'Refresh the webpage and try again',
        'Check if the page has finished loading',
        'Try on a different webpage'
      ],
      'STORAGE_ERROR': [
        'Check browser storage permissions',
        'Clear browser cache and cookies',
        'Try restarting the browser'
      ],
      'API_RESPONSE_INVALID': [
        'Try again in a few minutes',
        'Check if you\'re using a compatible AI model',
        'Verify your API configuration'
      ],
      'PARSING_ERROR': [
        'Try again with the same element',
        'Check if the webpage content has changed',
        'Report this issue if it persists'
      ],
      'VALIDATION_ERROR': [
        'Check your extension settings',
        'Verify all required fields are filled',
        'Reset settings to defaults if needed'
      ],
      'UNKNOWN_ERROR': [
        'Try refreshing the page',
        'Restart the browser',
        'Check browser console for more details',
        'Contact support if the problem persists'
      ]
    };

    return suggestions[error.code as ErrorCode] || ['Try again later', 'Contact support if the problem persists'];
  }

  /**
   * Normalize different error types to ExtensionError
   */
  private normalizeError(error: unknown, context: {
    component: 'content-script' | 'service-worker' | 'popup';
    action: string;
    elementSelector?: string;
    apiEndpoint?: string;
  }): ExtensionError {
    // If already an ExtensionError, return as-is
    if (this.isExtensionError(error)) {
      return error;
    }

    // Handle different error types
    if (error instanceof Error) {
      return this.createErrorFromException(error, context);
    }

    if (typeof error === 'string') {
      return this.createError('UNKNOWN_ERROR', error, context);
    }

    // Handle fetch/network errors
    if (error && typeof error === 'object' && 'name' in error) {
      const errorObj = error as { name: string; message?: string };
      
      if (errorObj.name === 'AbortError') {
        return this.createError('TIMEOUT_ERROR', 'Request was aborted', context, true, true);
      }
      
      if (errorObj.name === 'TypeError' && errorObj.message?.includes('fetch')) {
        return this.createError('NETWORK_ERROR', 'Network request failed', context, true, true);
      }
    }

    return this.createError('UNKNOWN_ERROR', 'An unknown error occurred', context);
  }

  /**
   * Create ExtensionError from JavaScript Error
   */
  private createErrorFromException(error: Error, context: {
    component: 'content-script' | 'service-worker' | 'popup';
    action: string;
    elementSelector?: string;
    apiEndpoint?: string;
  }): ExtensionError {
    let code: ErrorCode = 'UNKNOWN_ERROR';
    let recoverable = false;
    let retryable = false;

    // Categorize based on error message
    const message = error.message.toLowerCase();
    
    if (message.includes('unauthorized') || message.includes('invalid api key')) {
      code = 'API_KEY_INVALID';
    } else if (message.includes('rate limit') || message.includes('too many requests')) {
      code = 'API_RATE_LIMIT_EXCEEDED';
      recoverable = true;
      retryable = true;
    } else if (message.includes('timeout') || message.includes('aborted')) {
      code = 'TIMEOUT_ERROR';
      recoverable = true;
      retryable = true;
    } else if (message.includes('network') || message.includes('fetch')) {
      code = 'NETWORK_ERROR';
      recoverable = true;
      retryable = true;
    } else if (message.includes('parse') || message.includes('json')) {
      code = 'PARSING_ERROR';
      recoverable = true;
      retryable = false;
    } else if (message.includes('storage') || message.includes('quota')) {
      code = 'STORAGE_ERROR';
      recoverable = true;
      retryable = false;
    }

    return this.createError(code, error.message, context, recoverable, retryable, error.stack);
  }

  /**
   * Create a standardized ExtensionError
   */
  private createError(
    code: ErrorCode,
    message: string,
    context: {
      component: 'content-script' | 'service-worker' | 'popup';
      action: string;
      elementSelector?: string;
      apiEndpoint?: string;
    },
    recoverable: boolean = false,
    retryable: boolean = false,
    details?: string
  ): ExtensionError {
    return {
      code,
      message,
      ...(details && { details }),
      timestamp: Date.now(),
      context: {
        component: context.component,
        action: context.action,
        ...(context.elementSelector && { elementSelector: context.elementSelector }),
        ...(context.apiEndpoint && { apiEndpoint: context.apiEndpoint })
      },
      recoverable,
      retryable
    };
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(errorCode: string, attempt: number): number {
    const config = this.retryConfigs[errorCode] || this.retryConfigs['DEFAULT'];
    if (!config) {
      return 1000; // fallback delay
    }
    
    // Calculate exponential backoff
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter to prevent thundering herd problem
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.max(delay, 0);
  }

  /**
   * Log error for debugging
   */
  private logError(error: ExtensionError): void {
    const logLevel = this.getLogLevel(error);
    const logMessage = `[${error.context?.component}] ${error.context?.action}: ${error.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage, error);
        break;
      case 'warn':
        console.warn(logMessage, error);
        break;
      case 'info':
        console.info(logMessage, error);
        break;
      default:
        console.log(logMessage, error);
    }
  }

  /**
   * Determine appropriate log level for error
   */
  private getLogLevel(error: ExtensionError): 'error' | 'warn' | 'info' | 'debug' {
    if (!error.recoverable) {
      return 'error';
    }
    
    if (error.code === 'API_RATE_LIMIT_EXCEEDED' || error.code === 'TIMEOUT_ERROR') {
      return 'warn';
    }
    
    return 'info';
  }

  /**
   * Notify user of critical errors
   */
  private notifyUser(error: ExtensionError): void {
    // Send message to popup for user notification
    chrome.runtime.sendMessage({
      type: 'ERROR_NOTIFICATION',
      payload: {
        error,
        userMessage: this.getUserFriendlyMessage(error),
        suggestions: this.getRecoverySuggestions(error)
      }
    }).catch(() => {
      // Ignore errors if popup is not open
    });
  }

  /**
   * Type guard for ExtensionError
   */
  private isExtensionError(error: unknown): error is ExtensionError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'timestamp' in error &&
      'recoverable' in error &&
      'retryable' in error
    );
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker pattern implementation for API calls
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000, // 1 minute
    private successThreshold: number = 2
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.recoveryTimeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
  }
}

/**
 * Global Error Logger for centralized error tracking
 * Requirements: 需求 5.4 - 统一错误捕获和日志记录
 */
export class GlobalErrorLogger {
  private static instance: GlobalErrorLogger | null = null;
  private errorHistory: ExtensionError[] = [];
  private maxHistorySize: number = 100;
  private errorHandlers: Map<string, (error: ExtensionError) => void> = new Map();

  private constructor() {
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): GlobalErrorLogger {
    if (!GlobalErrorLogger.instance) {
      GlobalErrorLogger.instance = new GlobalErrorLogger();
    }
    return GlobalErrorLogger.instance;
  }

  /**
   * Set up global error handlers for unhandled errors
   */
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        const error = this.createErrorFromRejection(event);
        this.logError(error);
        event.preventDefault(); // Prevent console error
      });

      // Handle JavaScript errors
      window.addEventListener('error', (event) => {
        const error = this.createErrorFromEvent(event);
        this.logError(error);
      });
    }

    // Handle Chrome extension errors
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GLOBAL_ERROR') {
          this.logError(message.payload);
        }
      });
    }
  }

  /**
   * Log error to centralized system
   */
  logError(error: ExtensionError): void {
    // Add to history
    this.errorHistory.unshift(error);
    
    // Maintain history size limit
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }

    // Log to console with appropriate level
    this.logToConsole(error);

    // Store critical errors in chrome storage for debugging
    if (!error.recoverable) {
      this.storeCriticalError(error);
    }

    // Notify registered error handlers
    this.notifyErrorHandlers(error);

    // Send to popup for user notification if needed
    this.notifyUserIfNeeded(error);
  }

  /**
   * Register error handler for specific component
   */
  registerErrorHandler(component: string, handler: (error: ExtensionError) => void): void {
    this.errorHandlers.set(component, handler);
  }

  /**
   * Unregister error handler
   */
  unregisterErrorHandler(component: string): void {
    this.errorHandlers.delete(component);
  }

  /**
   * Get error history for debugging
   */
  getErrorHistory(): ExtensionError[] {
    return [...this.errorHistory];
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byComponent: Record<string, number>;
    byCode: Record<string, number>;
    criticalErrors: number;
    recentErrors: number; // Last hour
  } {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    const stats = {
      total: this.errorHistory.length,
      byComponent: {} as Record<string, number>,
      byCode: {} as Record<string, number>,
      criticalErrors: 0,
      recentErrors: 0
    };

    this.errorHistory.forEach(error => {
      // Count by component
      const component = error.context?.component || 'unknown';
      stats.byComponent[component] = (stats.byComponent[component] || 0) + 1;

      // Count by error code
      stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1;

      // Count critical errors
      if (!error.recoverable) {
        stats.criticalErrors++;
      }

      // Count recent errors
      if (error.timestamp > oneHourAgo) {
        stats.recentErrors++;
      }
    });

    return stats;
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  private createErrorFromRejection(event: PromiseRejectionEvent): ExtensionError {
    const reason = event.reason;
    let message = 'Unhandled promise rejection';
    let code: ErrorCode = 'UNKNOWN_ERROR';

    if (reason instanceof Error) {
      message = reason.message;
      code = this.categorizeError(reason);
    } else if (typeof reason === 'string') {
      message = reason;
    }

    const error: ExtensionError = {
      code,
      message,
      timestamp: Date.now(),
      context: {
        component: 'service-worker',
        action: 'unhandled-promise-rejection'
      },
      recoverable: false,
      retryable: false
    };

    if (reason instanceof Error && reason.stack) {
      error.details = reason.stack;
    }

    return error;
  }

  private createErrorFromEvent(event: ErrorEvent): ExtensionError {
    const error: ExtensionError = {
      code: this.categorizeError(new Error(event.message)),
      message: event.message,
      timestamp: Date.now(),
      context: {
        component: 'service-worker',
        action: 'javascript-error'
      },
      recoverable: false,
      retryable: false
    };

    if (event.filename || event.lineno || event.colno) {
      error.details = `${event.filename}:${event.lineno}:${event.colno}`;
    }

    return error;
  }

  private categorizeError(error: Error): ErrorCode {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    }
    if (message.includes('parse') || message.includes('json')) {
      return 'PARSING_ERROR';
    }
    if (message.includes('storage') || message.includes('quota')) {
      return 'STORAGE_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }

  private logToConsole(error: ExtensionError): void {
    const logLevel = this.getLogLevel(error);
    const logMessage = `[AI Focus Lens] [${error.context?.component}] ${error.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage, error);
        break;
      case 'warn':
        console.warn(logMessage, error);
        break;
      case 'info':
        console.info(logMessage, error);
        break;
      default:
        console.log(logMessage, error);
    }
  }

  private getLogLevel(error: ExtensionError): 'error' | 'warn' | 'info' | 'debug' {
    if (!error.recoverable) {
      return 'error';
    }
    
    if (error.code === 'API_RATE_LIMIT_EXCEEDED' || error.code === 'TIMEOUT_ERROR') {
      return 'warn';
    }
    
    return 'info';
  }

  private async storeCriticalError(error: ExtensionError): Promise<void> {
    try {
      const key = `critical_error_${Date.now()}`;
      await chrome.storage.local.set({
        [key]: {
          ...error,
          stored: Date.now()
        }
      });

      // Clean up old critical errors (keep only last 10)
      const result = await chrome.storage.local.get(null);
      const criticalErrorKeys = Object.keys(result)
        .filter(key => key.startsWith('critical_error_'))
        .sort()
        .reverse();

      if (criticalErrorKeys.length > 10) {
        const keysToRemove = criticalErrorKeys.slice(10);
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (storageError) {
      console.error('Failed to store critical error:', storageError);
    }
  }

  private notifyErrorHandlers(error: ExtensionError): void {
    const component = error.context?.component;
    if (component && this.errorHandlers.has(component)) {
      try {
        const handler = this.errorHandlers.get(component);
        handler?.(error);
      } catch (handlerError) {
        console.error('Error handler failed:', handlerError);
      }
    }
  }

  private notifyUserIfNeeded(error: ExtensionError): void {
    // Only notify user for critical errors or configuration issues
    if (!error.recoverable || 
        error.code === 'API_KEY_INVALID' || 
        error.code === 'API_ENDPOINT_UNREACHABLE') {
      
      // Send to popup if available
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'GLOBAL_ERROR_NOTIFICATION',
          payload: {
            error,
            userMessage: this.getUserFriendlyMessage(error),
            suggestions: this.getRecoverySuggestions(error)
          }
        }).catch(() => {
          // Ignore if popup is not available
        });
      }
    }
  }

  /**
   * Create a standardized ExtensionError
   */
  createError(
    code: ErrorCode,
    message: string,
    context: {
      component: 'content-script' | 'service-worker' | 'popup';
      action: string;
      elementSelector?: string;
      apiEndpoint?: string;
    },
    recoverable: boolean = false,
    retryable: boolean = false,
    details?: string
  ): ExtensionError {
    return {
      code,
      message,
      ...(details && { details }),
      timestamp: Date.now(),
      context: {
        component: context.component,
        action: context.action,
        ...(context.elementSelector && { elementSelector: context.elementSelector }),
        ...(context.apiEndpoint && { apiEndpoint: context.apiEndpoint })
      },
      recoverable,
      retryable
    };
  }

  /**
   * Handle and categorize errors
   */
  handleError(error: unknown, context: {
    component: 'content-script' | 'service-worker' | 'popup';
    action: string;
    elementSelector?: string;
    apiEndpoint?: string;
  }): ExtensionError {
    const normalizedError = this.normalizeError(error, context);
    
    // Log error
    this.logError(normalizedError);
    
    return normalizedError;
  }

  /**
   * Normalize different error types to ExtensionError
   */
  private normalizeError(error: unknown, context: {
    component: 'content-script' | 'service-worker' | 'popup';
    action: string;
    elementSelector?: string;
    apiEndpoint?: string;
  }): ExtensionError {
    // If already an ExtensionError, return as-is
    if (this.isExtensionError(error)) {
      return error;
    }

    // Handle different error types
    if (error instanceof Error) {
      return this.createErrorFromException(error, context);
    }

    if (typeof error === 'string') {
      return this.createError('UNKNOWN_ERROR', error, context);
    }

    // Handle fetch/network errors
    if (error && typeof error === 'object' && 'name' in error) {
      const errorObj = error as { name: string; message?: string };
      
      if (errorObj.name === 'AbortError') {
        return this.createError('TIMEOUT_ERROR', 'Request was aborted', context, true, true);
      }
      
      if (errorObj.name === 'TypeError' && errorObj.message?.includes('fetch')) {
        return this.createError('NETWORK_ERROR', 'Network request failed', context, true, true);
      }
    }

    return this.createError('UNKNOWN_ERROR', 'An unknown error occurred', context);
  }

  /**
   * Create ExtensionError from JavaScript Error
   */
  private createErrorFromException(error: Error, context: {
    component: 'content-script' | 'service-worker' | 'popup';
    action: string;
    elementSelector?: string;
    apiEndpoint?: string;
  }): ExtensionError {
    let code: ErrorCode = 'UNKNOWN_ERROR';
    let recoverable = false;
    let retryable = false;

    // Categorize based on error message
    const message = error.message.toLowerCase();
    
    if (message.includes('unauthorized') || message.includes('invalid api key')) {
      code = 'API_KEY_INVALID';
    } else if (message.includes('rate limit') || message.includes('too many requests')) {
      code = 'API_RATE_LIMIT_EXCEEDED';
      recoverable = true;
      retryable = true;
    } else if (message.includes('timeout') || message.includes('aborted')) {
      code = 'TIMEOUT_ERROR';
      recoverable = true;
      retryable = true;
    } else if (message.includes('network') || message.includes('fetch')) {
      code = 'NETWORK_ERROR';
      recoverable = true;
      retryable = true;
    } else if (message.includes('parse') || message.includes('json')) {
      code = 'PARSING_ERROR';
      recoverable = true;
      retryable = false;
    } else if (message.includes('storage') || message.includes('quota')) {
      code = 'STORAGE_ERROR';
      recoverable = true;
      retryable = false;
    }

    return this.createError(code, error.message, context, recoverable, retryable, error.stack);
  }

  /**
   * Type guard for ExtensionError
   */
  private isExtensionError(error: unknown): error is ExtensionError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'timestamp' in error &&
      'recoverable' in error &&
      'retryable' in error
    );
  }

  /**
   * Get user-friendly error messages
   */
  getUserFriendlyMessage(error: ExtensionError): string {
    const errorMessages: Record<ErrorCode, string> = {
      'API_KEY_INVALID': '无效的 API 密钥。请在扩展设置中检查您的 OpenAI API 密钥。',
      'API_ENDPOINT_UNREACHABLE': '无法连接到 AI 服务。请检查您的网络连接和 API 端点 URL。',
      'API_RATE_LIMIT_EXCEEDED': 'API 速率限制已超出。扩展将在几分钟后自动重试。',
      'API_RESPONSE_INVALID': '从 AI 服务收到无效响应。请重试。',
      'NETWORK_ERROR': '网络连接错误。请检查您的网络连接并重试。',
      'TIMEOUT_ERROR': '请求超时。AI 服务可能正在经历高负载。请重试。',
      'STORAGE_ERROR': '无法保存或检索设置。请检查您的浏览器权限。',
      'CONTENT_SCRIPT_ERROR': '无法分析网页。请刷新页面并重试。',
      'PARSING_ERROR': '无法处理分析结果。请重试。',
      'VALIDATION_ERROR': '无效的配置或数据。请检查您的设置。',
      'UNKNOWN_ERROR': '发生了意外错误。请重试，如果问题持续存在，请联系支持。'
    };

    return errorMessages[error.code as ErrorCode] || error.message;
  }

  private getRecoverySuggestions(error: ExtensionError): string[] {
    const suggestions: Record<ErrorCode, string[]> = {
      'API_KEY_INVALID': [
        '验证您的 OpenAI API 密钥是否正确',
        '检查您的 API 密钥是否有足够的额度',
        '确保 API 密钥具有必要的权限'
      ],
      'API_ENDPOINT_UNREACHABLE': [
        '检查您的网络连接',
        '验证 API 端点 URL 是否正确',
        '几分钟后重试',
        '检查 AI 服务是否正在维护'
      ],
      'API_RATE_LIMIT_EXCEEDED': [
        '等待一分钟后重试',
        '考虑减少批处理大小',
        '升级您的 API 计划'
      ],
      'API_RESPONSE_INVALID': [
        '重试请求',
        '检查 API 配置',
        '联系技术支持'
      ],
      'NETWORK_ERROR': [
        '检查您的网络连接',
        '尝试刷新页面',
        '如果使用 VPN 或代理，请尝试禁用',
        '几分钟后重试'
      ],
      'TIMEOUT_ERROR': [
        '减少批处理大小',
        '检查网络连接速度',
        '增加超时设置'
      ],
      'STORAGE_ERROR': [
        '检查浏览器存储权限',
        '清除浏览器缓存',
        '重启浏览器'
      ],
      'CONTENT_SCRIPT_ERROR': [
        '刷新网页并重试',
        '检查页面是否已完成加载',
        '在不同的网页上尝试'
      ],
      'PARSING_ERROR': [
        '重试相同操作',
        '检查数据格式',
        '联系技术支持'
      ],
      'VALIDATION_ERROR': [
        '检查输入数据',
        '验证配置设置',
        '重置为默认值'
      ],
      'UNKNOWN_ERROR': [
        '尝试刷新页面',
        '重启浏览器',
        '检查浏览器控制台获取更多详细信息',
        '如果问题持续存在，请联系支持'
      ]
    };

    return suggestions[error.code as ErrorCode] || ['稍后重试', '如果问题持续存在，请联系支持'];
  }
}

/**
 * User Notification Manager for friendly error messages
 * Requirements: 需求 5.4 - 用户友好的错误提示
 */
export class UserNotificationManager {
  private static instance: UserNotificationManager | null = null;
  private notificationQueue: Array<{
    id: string;
    message: string;
    type: 'error' | 'warning' | 'info' | 'success';
    timestamp: number;
    persistent: boolean;
  }> = [];

  private constructor() {}

  static getInstance(): UserNotificationManager {
    if (!UserNotificationManager.instance) {
      UserNotificationManager.instance = new UserNotificationManager();
    }
    return UserNotificationManager.instance;
  }

  /**
   * Show error notification to user
   */
  showError(message: string, persistent: boolean = false): string {
    return this.addNotification(message, 'error', persistent);
  }

  /**
   * Show warning notification to user
   */
  showWarning(message: string, persistent: boolean = false): string {
    return this.addNotification(message, 'warning', persistent);
  }

  /**
   * Show info notification to user
   */
  showInfo(message: string, persistent: boolean = false): string {
    return this.addNotification(message, 'info', persistent);
  }

  /**
   * Show success notification to user
   */
  showSuccess(message: string, persistent: boolean = false): string {
    return this.addNotification(message, 'success', persistent);
  }

  /**
   * Clear specific notification
   */
  clearNotification(id: string): void {
    this.notificationQueue = this.notificationQueue.filter(n => n.id !== id);
    this.broadcastNotifications();
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications(): void {
    this.notificationQueue = [];
    this.broadcastNotifications();
  }

  /**
   * Get all current notifications
   */
  getNotifications(): Array<{
    id: string;
    message: string;
    type: 'error' | 'warning' | 'info' | 'success';
    timestamp: number;
    persistent: boolean;
  }> {
    return [...this.notificationQueue];
  }

  private addNotification(
    message: string, 
    type: 'error' | 'warning' | 'info' | 'success', 
    persistent: boolean
  ): string {
    const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const notification = {
      id,
      message,
      type,
      timestamp: Date.now(),
      persistent
    };

    this.notificationQueue.push(notification);

    // Auto-remove non-persistent notifications after 5 seconds
    if (!persistent) {
      setTimeout(() => {
        this.clearNotification(id);
      }, 5000);
    }

    // Broadcast to UI components
    this.broadcastNotifications();

    return id;
  }

  private broadcastNotifications(): void {
    // Send to popup and other UI components
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'NOTIFICATIONS_UPDATED',
        payload: this.getNotifications()
      }).catch(() => {
        // Ignore if no listeners
      });
    }
  }
}

/**
 * Factory function to create error handler
 */
export function createErrorHandler(config: ExtensionConfig): ErrorHandler {
  return new ErrorHandler(config);
}

/**
 * Factory function to create circuit breaker
 */
export function createCircuitBreaker(
  failureThreshold: number = 5,
  recoveryTimeout: number = 60000,
  successThreshold: number = 2
): CircuitBreaker {
  return new CircuitBreaker(failureThreshold, recoveryTimeout, successThreshold);
}

/**
 * Utility function to check if an error is retryable
 */
export function isRetryableError(error: ExtensionError): boolean {
  return error.retryable;
}

/**
 * Utility function to check if an error is recoverable
 */
export function isRecoverableError(error: ExtensionError): boolean {
  return error.recoverable;
}

/**
 * Utility function to create a timeout promise
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}