// Batch Processor for AI Focus Lens extension
// Handles API request batching with concurrency control and rate limiting
// Requirements: 需求 6.1 - 按配置的批次大小分组处理元素，实现并发控制和速率限制

import { 
  FocusableElement, 
  AnalysisResult, 
  ElementAnalysisData,
  ExtensionConfig,
  ExtensionError,
  BatchConfig,
  PerformanceMetrics
} from '../types';

import { LLMClient, buildLLMRequest } from '../api/llm-client';
import { createSingleElementPrompt } from '../prompts/act-rule-oj04fd';
import { ErrorHandler } from './error-handler';

/**
 * Rate limiter for API requests
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number = 10, refillRate: number = 1) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token for rate limiting
   */
  async consume(): Promise<void> {
    this.refillTokens();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until we can get a token
    const waitTime = (1 - this.tokens) / this.refillRate * 1000;
    await this.sleep(waitTime);
    await this.consume(); // Recursive call after waiting
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
  results: AnalysisResult[];
  metrics: PerformanceMetrics;
  errors: ExtensionError[];
}

/**
 * Batch processor for handling multiple API requests efficiently
 * Requirements: 需求 6.1 - 实现并发控制和速率限制
 */
export class BatchProcessor {
  private rateLimiter: RateLimiter;
  private config: BatchConfig;
  private metrics: PerformanceMetrics = {
    scanStartTime: 0,
    scanEndTime: 0,
    totalDuration: 0,
    elementAnalysisTime: 0,
    apiCallTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    failedApiCalls: 0,
    retryCount: 0
  };

  constructor(
    private llmClient: LLMClient,
    private errorHandler: ErrorHandler,
    extensionConfig: ExtensionConfig
  ) {
    // Configure batch processing based on extension config
    this.config = {
      batchSize: extensionConfig.batchSize || 5,
      concurrency: Math.min(extensionConfig.batchSize || 5, 3), // Max 3 concurrent requests
      delayBetweenBatches: this.calculateBatchDelay(extensionConfig.batchSize || 5),
      maxBatchRetries: 2
    };

    // Configure rate limiter based on typical API limits
    // Most APIs allow 60 requests per minute, so we set conservative limits
    this.rateLimiter = new RateLimiter(
      Math.min(10, extensionConfig.batchSize || 5), // Max tokens
      0.8 // Refill rate (tokens per second) - conservative for API limits
    );

    this.initializeMetrics();
  }

  /**
   * Process elements in optimized batches
   * Requirements: 需求 6.1 - 按配置的批次大小分组处理元素
   */
  async processElements(
    elements: FocusableElement[],
    pageContext: ElementAnalysisData,
    extensionConfig: ExtensionConfig
  ): Promise<BatchProcessingResult> {
    this.initializeMetrics();
    this.metrics.scanStartTime = Date.now();

    const results: AnalysisResult[] = [];
    const errors: ExtensionError[] = [];

    try {
      // Split elements into batches
      const batches = this.createBatches(elements);
      console.log(`Processing ${elements.length} elements in ${batches.length} batches`);

      // Process batches with concurrency control
      for (let i = 0; i < batches.length; i += this.config.concurrency) {
        const concurrentBatches = batches.slice(i, i + this.config.concurrency);
        
        // Process concurrent batches
        const batchPromises = concurrentBatches.map((batch, batchIndex) => 
          this.processBatch(batch, pageContext, extensionConfig, i + batchIndex)
        );

        try {
          const batchResults = await Promise.allSettled(batchPromises);
          
          // Collect results and errors
          batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              results.push(...result.value.results);
              errors.push(...result.value.errors);
            } else {
              const batchError: ExtensionError = {
                code: 'UNKNOWN_ERROR',
                message: `Batch ${i + index} failed: ${result.reason}`,
                timestamp: Date.now(),
                context: {
                  component: 'service-worker',
                  action: 'process-batch'
                },
                recoverable: true,
                retryable: true
              };
              errors.push(batchError);
            }
          });

          // Add delay between batch groups to respect rate limits
          if (i + this.config.concurrency < batches.length) {
            await this.sleep(this.config.delayBetweenBatches);
          }

        } catch (error) {
          const batchGroupError = this.errorHandler.handleError(error, {
            component: 'service-worker',
            action: 'process-batch-group'
          });
          errors.push(batchGroupError);
        }
      }

    } catch (error) {
      const processingError = this.errorHandler.handleError(error, {
        component: 'service-worker',
        action: 'process-elements'
      });
      errors.push(processingError);
    }

    this.metrics.scanEndTime = Date.now();
    this.metrics.totalDuration = this.metrics.scanEndTime - this.metrics.scanStartTime;
    this.metrics.apiCalls = results.length;
    this.metrics.failedApiCalls = errors.length;

    console.log(`Batch processing completed: ${results.length} successful, ${errors.length} failed`);

    return {
      results,
      metrics: this.metrics,
      errors
    };
  }

  /**
   * Process a single batch of elements
   */
  private async processBatch(
    elements: FocusableElement[],
    pageContext: ElementAnalysisData,
    config: ExtensionConfig,
    batchIndex: number
  ): Promise<{ results: AnalysisResult[]; errors: ExtensionError[] }> {
    const results: AnalysisResult[] = [];
    const errors: ExtensionError[] = [];

    console.log(`Processing batch ${batchIndex} with ${elements.length} elements`);

    // Process elements in the batch sequentially to avoid overwhelming the API
    for (const element of elements) {
      try {
        // Apply rate limiting
        await this.rateLimiter.consume();

        const result = await this.processElement(element, pageContext, config);
        results.push(result);
        this.metrics.apiCalls++;

      } catch (error) {
        const elementError = this.errorHandler.handleError(error, {
          component: 'service-worker',
          action: 'process-element',
          elementSelector: element.selector
        });
        
        // Create fallback result for failed elements
        const fallbackResult: AnalysisResult = {
          elementSelector: element.selector,
          result: {
            status: 'CANTELL',
            reason: 'Analysis failed due to processing error',
            suggestion: 'Please try again or review manually',
            confidence: 0,
            actRuleCompliance: {
              ruleId: 'oj04fd',
              outcome: 'cantell',
              details: elementError.message
            }
          },
          timestamp: Date.now(),
          processingTime: 0,
          retryCount: config.maxRetries
        };

        results.push(fallbackResult);
        errors.push(elementError);
        this.metrics.failedApiCalls++;
      }
    }

    return { results, errors };
  }

  /**
   * Process a single element through the LLM API
   */
  private async processElement(
    element: FocusableElement,
    pageContext: ElementAnalysisData,
    config: ExtensionConfig
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    return await this.errorHandler.executeWithRetry(
      async () => {
        // Build prompts for the element
        const { systemPrompt, userPrompt } = createSingleElementPrompt(element, pageContext);
        const request = buildLLMRequest(systemPrompt, userPrompt, config.model);

        // Make API call
        const response = await this.llmClient.sendRequest(request);
        const processingTime = Date.now() - startTime;

        // Parse result
        const focusResult = this.llmClient.parseFocusVisibilityResult(response);

        return {
          elementSelector: element.selector,
          result: focusResult,
          timestamp: Date.now(),
          processingTime,
          apiCallId: response.id
        } as AnalysisResult;
      },
      {
        operationName: 'analyze-element',
        component: 'service-worker',
        elementSelector: element.selector,
        apiEndpoint: config.baseUrl
      }
    );
  }

  /**
   * Create batches from elements array
   */
  private createBatches(elements: FocusableElement[]): FocusableElement[][] {
    const batches: FocusableElement[][] = [];
    
    for (let i = 0; i < elements.length; i += this.config.batchSize) {
      const batch = elements.slice(i, i + this.config.batchSize);
      batches.push(batch);
    }

    return batches;
  }

  /**
   * Calculate optimal delay between batches based on batch size
   */
  private calculateBatchDelay(batchSize: number): number {
    // Larger batches need longer delays to respect rate limits
    // Base delay of 500ms, increased by 200ms per additional element in batch
    const baseDelay = 500;
    const perElementDelay = 200;
    return baseDelay + (batchSize - 1) * perElementDelay;
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): void {
    this.metrics = {
      scanStartTime: 0,
      scanEndTime: 0,
      totalDuration: 0,
      elementAnalysisTime: 0,
      apiCallTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      failedApiCalls: 0,
      retryCount: 0
    };
  }

  /**
   * Get current processing metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Update batch configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update rate limiter if needed
    if (newConfig.batchSize) {
      this.rateLimiter = new RateLimiter(
        Math.min(10, newConfig.batchSize),
        0.8
      );
    }
  }

  /**
   * Get current batch configuration
   */
  getConfig(): BatchConfig {
    return { ...this.config };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create batch processor
 */
export function createBatchProcessor(
  llmClient: LLMClient,
  errorHandler: ErrorHandler,
  config: ExtensionConfig
): BatchProcessor {
  return new BatchProcessor(llmClient, errorHandler, config);
}

/**
 * Utility functions for batch processing
 */
export const BatchUtils = {
  /**
   * Calculate optimal batch size based on API limits and element count
   */
  calculateOptimalBatchSize(elementCount: number, apiRateLimit: number = 60): number {
    // Conservative approach: use smaller batches for better error handling
    const maxBatchSize = Math.min(10, Math.floor(apiRateLimit / 6)); // 6 batches per minute max
    const optimalSize = Math.min(maxBatchSize, Math.ceil(elementCount / 10));
    return Math.max(1, optimalSize);
  },

  /**
   * Estimate processing time based on element count and batch configuration
   */
  estimateProcessingTime(elementCount: number, batchConfig: BatchConfig): number {
    const batchCount = Math.ceil(elementCount / batchConfig.batchSize);
    const concurrentBatchGroups = Math.ceil(batchCount / batchConfig.concurrency);
    
    // Estimate: 2 seconds per element + batch delays
    const elementProcessingTime = elementCount * 2000;
    const batchDelayTime = (concurrentBatchGroups - 1) * batchConfig.delayBetweenBatches;
    
    return elementProcessingTime + batchDelayTime;
  },

  /**
   * Check if batch processing is recommended for element count
   */
  shouldUseBatchProcessing(elementCount: number): boolean {
    return elementCount > 3; // Use batch processing for more than 3 elements
  },

  /**
   * Get recommended concurrency level based on system resources
   */
  getRecommendedConcurrency(batchSize: number): number {
    // Conservative concurrency to avoid overwhelming APIs
    return Math.min(3, Math.max(1, Math.floor(batchSize / 2)));
  }
};