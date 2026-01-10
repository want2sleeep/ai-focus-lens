// LLM API Client for OpenAI compatible endpoints
// Requirements: 需求 2.2, 2.3 - 发送包含元素 JSON 数据的请求，解析结构化的 JSON 结论

import { 
  LLMRequest, 
  LLMResponse, 
  ExtensionConfig, 
  ExtensionError,
  APIClientConfig,
  FocusVisibilityResult,
  isFocusVisibilityResult,
  isLLMResponse
} from '../types';

/**
 * OpenAI compatible LLM API client
 * Handles request construction, API calls, and response parsing
 */
export class LLMClient {
  private config: APIClientConfig;
  private abortController: AbortController | undefined;

  constructor(config: ExtensionConfig) {
    this.config = {
      baseUrl: config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      userAgent: 'AI-Focus-Lens/1.0.0'
    };
  }

  /**
   * Update client configuration
   */
  updateConfig(config: ExtensionConfig): void {
    this.config = {
      ...this.config,
      baseUrl: config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout || this.config.timeout,
      maxRetries: config.maxRetries || this.config.maxRetries,
      retryDelay: config.retryDelay || this.config.retryDelay
    };
  }

  /**
   * Send a request to the LLM API with retry logic
   * Requirements: 需求 2.2 - 发送包含元素 JSON 数据的请求
   */
  async sendRequest(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);
    
    let lastError: ExtensionError | null = null;
    
    console.log(`[LLMClient] Sending request to ${request.model} at ${this.config.baseUrl}`);
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeAPICall(request);
        this.validateResponse(response);
        console.log(`[LLMClient] Received successful response from ${request.model}`);
        return response;
      } catch (error) {
        lastError = this.handleAPIError(error, attempt + 1);
        
        // Don't retry on certain error types
        if (!lastError.retryable || attempt === this.config.maxRetries - 1) {
          throw lastError;
        }
        
        // Wait before retrying with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError || this.createError('UNKNOWN_ERROR', 'Maximum retries exceeded');
  }

  /**
   * Parse LLM response to extract focus visibility result
   * Requirements: 需求 2.3 - 解析结构化的 JSON 结论
   */
  parseFocusVisibilityResult(response: LLMResponse): FocusVisibilityResult {
    if (!response.choices || response.choices.length === 0) {
      throw this.createError('API_RESPONSE_INVALID', 'No choices in API response');
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw this.createError('API_RESPONSE_INVALID', 'Empty content in API response');
    }

    try {
      // Try to parse JSON from the response content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!isFocusVisibilityResult(parsed)) {
        throw new Error('Invalid focus visibility result format');
      }

      // Ensure all required fields are present with defaults
      const result: FocusVisibilityResult = {
        status: parsed.status || 'CANTELL',
        reason: parsed.reason || 'Unable to determine focus visibility',
        suggestion: parsed.suggestion || 'Please review the element manually',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        actRuleCompliance: parsed.actRuleCompliance || {
          ruleId: 'oj04fd',
          outcome: 'cantell',
          details: 'Unable to determine compliance'
        },
        ...(parsed.colorAnalysis && { colorAnalysis: parsed.colorAnalysis })
      };

      return result;
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      
      // Return a fallback result based on response content analysis
      return this.createFallbackResult(content);
    }
  }

  /**
   * Cancel ongoing API request
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }

  /**
   * Test API connection and configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const testRequest: LLMRequest = {
        model: 'gpt-4', // Default for testing
        messages: [
          {
            role: 'user',
            content: 'Test connection. Please respond with "OK".'
          }
        ],
        temperature: 0,
        max_tokens: 10
      };

      await this.sendRequest(testRequest);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Make the actual HTTP request to the API
   */
  private async makeAPICall(request: LLMRequest): Promise<LLMResponse> {
    this.abortController = new AbortController();
    
    // Construct the full URL. If baseUrl already contains /chat/completions, use it as is.
    let url = this.config.baseUrl;
    if (!url.toLowerCase().includes('/chat/completions')) {
      url = `${url}/chat/completions`;
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'User-Agent': this.config.userAgent
    };

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: this.abortController.signal
    };

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.timeout);

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await this.createHTTPError(response);
      }

      const data = await response.json();
      
      if (!isLLMResponse(data)) {
        throw this.createError('API_RESPONSE_INVALID', 'Invalid response format from API');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError('TIMEOUT_ERROR', 'API request timed out');
      }
      
      throw error;
    } finally {
      this.abortController = undefined;
    }
  }

  /**
   * Validate request before sending
   */
  private validateRequest(request: LLMRequest): void {
    if (!this.config.apiKey) {
      throw this.createError('API_KEY_INVALID', 'API key is required');
    }

    if (!request.model) {
      throw this.createError('VALIDATION_ERROR', 'Model is required');
    }

    if (!request.messages || request.messages.length === 0) {
      throw this.createError('VALIDATION_ERROR', 'Messages are required');
    }

    if (request.max_tokens && request.max_tokens <= 0) {
      throw this.createError('VALIDATION_ERROR', 'max_tokens must be positive');
    }

    if (request.temperature && (request.temperature < 0 || request.temperature > 2)) {
      throw this.createError('VALIDATION_ERROR', 'temperature must be between 0 and 2');
    }
  }

  /**
   * Validate API response
   */
  private validateResponse(response: LLMResponse): void {
    if (!response.choices || response.choices.length === 0) {
      throw this.createError('API_RESPONSE_INVALID', 'No choices in response');
    }

    const choice = response.choices[0];
    if (!choice || !choice.message || !choice.message.content) {
      throw this.createError('API_RESPONSE_INVALID', 'No content in response');
    }
  }

  /**
   * Handle API errors and convert to ExtensionError
   */
  private handleAPIError(error: unknown, attempt: number): ExtensionError {
    if (this.isExtensionError(error)) {
      return error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return this.createError('TIMEOUT_ERROR', 'Request was aborted', false, true);
      }

      if (error.message.includes('fetch')) {
        return this.createError('NETWORK_ERROR', 'Network error occurred', true, true);
      }
    }

    return this.createError('UNKNOWN_ERROR', `Unexpected error on attempt ${attempt}`, true, true);
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
   * Create HTTP error from response
   */
  private async createHTTPError(response: Response): Promise<ExtensionError> {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorCode: string = 'API_ENDPOINT_UNREACHABLE';
    let retryable = false;

    try {
      const errorData = await response.json();
      if (errorData.error && errorData.error.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // Ignore JSON parsing errors for error responses
    }

    switch (response.status) {
      case 401:
        errorCode = 'API_KEY_INVALID';
        errorMessage = 'Invalid API key';
        break;
      case 429:
        errorCode = 'API_RATE_LIMIT_EXCEEDED';
        errorMessage = 'Rate limit exceeded';
        retryable = true;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorCode = 'API_ENDPOINT_UNREACHABLE';
        errorMessage = 'Server error';
        retryable = true;
        break;
    }

    return this.createError(errorCode, errorMessage, true, retryable);
  }

  /**
   * Create a standardized ExtensionError
   */
  private createError(
    code: string, 
    message: string, 
    recoverable: boolean = false, 
    retryable: boolean = false
  ): ExtensionError {
    return {
      code,
      message,
      timestamp: Date.now(),
      context: {
        component: 'service-worker',
        action: 'llm-api-call',
        apiEndpoint: this.config.baseUrl
      },
      recoverable,
      retryable
    };
  }

  /**
   * Create fallback result when parsing fails
   */
  private createFallbackResult(content: string): FocusVisibilityResult {
    // Simple heuristic based on content analysis
    const lowerContent = content.toLowerCase();
    let status: 'PASS' | 'FAIL' | 'CANTELL' = 'CANTELL';
    
    if (lowerContent.includes('pass') || lowerContent.includes('visible') || lowerContent.includes('indicator')) {
      status = 'PASS';
    } else if (lowerContent.includes('fail') || lowerContent.includes('not visible') || lowerContent.includes('no indicator')) {
      status = 'FAIL';
    }

    return {
      status,
      reason: 'Response parsing failed, result based on content analysis',
      suggestion: 'Please review the element manually for focus visibility',
      confidence: 0.3,
      actRuleCompliance: {
        ruleId: 'oj04fd',
        outcome: status === 'PASS' ? 'passed' : status === 'FAIL' ? 'failed' : 'cantell',
        details: 'Fallback analysis due to parsing error'
      }
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create LLM client instance
 */
export function createLLMClient(config: ExtensionConfig): LLMClient {
  return new LLMClient(config);
}

/**
 * Utility function to build standard LLM request
 */
export function buildLLMRequest(
  systemPrompt: string,
  userPrompt: string,
  model: string = 'gpt-4',
  options: Partial<LLMRequest> = {}
): LLMRequest {
  return {
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0.1, // Low temperature for consistent results
    max_tokens: 1000,
    ...options
  };
}
