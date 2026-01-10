// Batch Processor for AI Focus Lens extension
// Handles API request batching with concurrency control and rate limiting

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

export interface BatchProcessingResult {
  results: AnalysisResult[];
  metrics: PerformanceMetrics;
  errors: ExtensionError[];
}

export class BatchProcessor {
  private isCancelled: boolean = false;
  private metrics: PerformanceMetrics;

  constructor(
    private llmClient: LLMClient,
    private errorHandler: ErrorHandler,
    private extensionConfig: ExtensionConfig
  ) {
    this.metrics = this.createEmptyMetrics();
  }

  cancelProcessing(): void {
    this.isCancelled = true;
    console.log('[BatchProcessor] Processing cancellation requested');
  }

  async processElements(
    elements: FocusableElement[],
    pageContext: ElementAnalysisData,
    config: ExtensionConfig
  ): Promise<BatchProcessingResult> {
    this.isCancelled = false;
    this.metrics = this.createEmptyMetrics();
    this.metrics.scanStartTime = Date.now();

    const results: AnalysisResult[] = [];
    const errors: ExtensionError[] = [];

    console.log(`[BatchProcessor] Starting serial processing of ${elements.length} elements with 5s delay`);

    for (let i = 0; i < elements.length; i++) {
      if (this.isCancelled) {
        console.log('[BatchProcessor] Loop broken due to cancellation');
        break;
      }

      const element = elements[i];
      if (!element) continue;

      try {
        // MANDATORY 5-SECOND DELAY before each request to respect strict rate limits
        if (i > 0) {
          console.log(`[BatchProcessor] Waiting 5s before processing element ${i + 1}/${elements.length}...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (this.isCancelled) break;

        const result = await this.processElement(element, pageContext, config);
        results.push(result);
        this.metrics.apiCalls++;

      } catch (error) {
        console.error(`[BatchProcessor] Error processing element ${element.selector}:`, error);
        const elementError = this.errorHandler.handleError(error, {
          component: 'service-worker',
          action: 'process-element',
          elementSelector: element.selector
        });
        errors.push(elementError);
      }
    }

    this.metrics.scanEndTime = Date.now();
    this.metrics.totalDuration = this.metrics.scanEndTime - this.metrics.scanStartTime;

    return { results, metrics: this.metrics, errors };
  }

  private async processElement(
    element: FocusableElement,
    pageContext: ElementAnalysisData,
    config: ExtensionConfig
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    // CRITICAL: Extract external indicators from element data
    const externalIndicatorsStr = element.externalIndicators && element.externalIndicators.length > 0 
      ? element.externalIndicators.join('\n') 
      : undefined;

    // Build prompts using the fixed builder that now accepts external indicators
    const { systemPrompt, userPrompt } = createSingleElementPrompt(element, pageContext, externalIndicatorsStr);
    const request = buildLLMRequest(systemPrompt, userPrompt, config.model);

    const response = await this.llmClient.sendRequest(request);
    const focusResult = this.llmClient.parseFocusVisibilityResult(response);

    return {
      elementSelector: element.selector,
      result: focusResult,
      timestamp: Date.now(),
      processingTime: Date.now() - startTime,
      apiCallId: response.id
    };
  }

  private createEmptyMetrics(): PerformanceMetrics {
    return {
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
}

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
  calculateOptimalBatchSize(elementCount: number, _apiRateLimit: number = 60): number {
    return 1; // Standardized to 1 for this extension's stability
  },

  /**
   * Check if batch processing is recommended for element count
   */
  shouldUseBatchProcessing(elementCount: number): boolean {
    return elementCount > 0;
  }
};