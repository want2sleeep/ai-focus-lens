// Backend Services Integration Test
// Feature: ai-focus-lens, Backend service functionality verification

import { 
  createLLMClient, 
  buildLLMRequest 
} from '../src/api/llm-client';
import { 
  createErrorHandler, 
  createCircuitBreaker 
} from '../src/utils/error-handler';
import { 
  createStorageManager 
} from '../src/utils/storage-manager';
import { 
  createCacheManager 
} from '../src/utils/cache-manager';
import { 
  createBatchProcessor 
} from '../src/utils/batch-processor';
import { 
  createDataFilter 
} from '../src/utils/data-filter';
import { 
  DEFAULT_CONFIG,
  ExtensionConfig,
  LLMRequest,
  FocusableElement,
  ElementAnalysisData
} from '../src/types';

describe('Backend Services Integration', () => {
  let config: ExtensionConfig;

  beforeEach(() => {
    config = {
      ...DEFAULT_CONFIG,
      apiKey: 'test-api-key',
      baseUrl: 'https://api.openai.com/v1'
    };
  });

  describe('Service Creation', () => {
    test('should create LLM client without errors', () => {
      expect(() => {
        const client = createLLMClient(config);
        expect(client).toBeDefined();
      }).not.toThrow();
    });

    test('should create error handler without errors', () => {
      expect(() => {
        const handler = createErrorHandler(config);
        expect(handler).toBeDefined();
      }).not.toThrow();
    });

    test('should create circuit breaker without errors', () => {
      expect(() => {
        const breaker = createCircuitBreaker();
        expect(breaker).toBeDefined();
        expect(breaker.getState()).toBe('CLOSED');
      }).not.toThrow();
    });

    test('should create storage manager without errors', () => {
      expect(() => {
        const manager = createStorageManager();
        expect(manager).toBeDefined();
      }).not.toThrow();
    });

    test('should create cache manager without errors', () => {
      expect(() => {
        const manager = createCacheManager();
        expect(manager).toBeDefined();
      }).not.toThrow();
    });

    test('should create data filter without errors', () => {
      expect(() => {
        const filter = createDataFilter();
        expect(filter).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('LLM Client Functionality', () => {
    test('should build LLM request correctly', () => {
      const systemPrompt = 'You are a focus visibility analyzer.';
      const userPrompt = 'Analyze this element for focus visibility.';
      const model = 'gpt-4';

      const request = buildLLMRequest(systemPrompt, userPrompt, model);

      expect(request).toEqual({
        model: 'gpt-4',
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
        temperature: 0.1,
        max_tokens: 1000
      });
    });

    test('should update client configuration', () => {
      const client = createLLMClient(config);
      const newConfig = {
        ...config,
        baseUrl: 'https://api.example.com/v1',
        timeout: 60000
      };

      expect(() => {
        client.updateConfig(newConfig);
      }).not.toThrow();
    });

    test('should handle request cancellation', () => {
      const client = createLLMClient(config);
      
      expect(() => {
        client.cancelRequest();
      }).not.toThrow();
    });
  });

  describe('Error Handler Functionality', () => {
    beforeEach(() => {
      // Mock chrome.runtime.sendMessage to return a promise
      (chrome.runtime.sendMessage as jest.Mock).mockReturnValue(Promise.resolve());
    });

    test('should handle different error types', () => {
      const handler = createErrorHandler(config);
      
      const testError = new Error('Test error');
      const handledError = handler.handleError(testError, {
        component: 'service-worker',
        action: 'test-action'
      });

      expect(handledError).toBeDefined();
      expect(handledError.code).toBeDefined();
      expect(handledError.message).toBeDefined();
      expect(handledError.timestamp).toBeDefined();
      expect(handledError.context).toBeDefined();
      expect(typeof handledError.recoverable).toBe('boolean');
      expect(typeof handledError.retryable).toBe('boolean');
    });

    test('should provide user-friendly error messages', () => {
      const handler = createErrorHandler(config);
      
      const testError = handler.handleError(new Error('unauthorized'), {
        component: 'service-worker',
        action: 'api-call'
      });

      const userMessage = handler.getUserFriendlyMessage(testError);
      expect(typeof userMessage).toBe('string');
      expect(userMessage.length).toBeGreaterThan(0);
    });

    test('should provide recovery suggestions', () => {
      const handler = createErrorHandler(config);
      
      const testError = handler.handleError(new Error('network error'), {
        component: 'service-worker',
        action: 'api-call'
      });

      const suggestions = handler.getRecoverySuggestions(testError);
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker Functionality', () => {
    test('should track failures and open circuit', async () => {
      const breaker = createCircuitBreaker(2, 1000, 1); // Low threshold for testing
      
      expect(breaker.getState()).toBe('CLOSED');
      
      // Simulate failures
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // First failure
      await expect(breaker.execute(failingOperation)).rejects.toThrow();
      expect(breaker.getState()).toBe('CLOSED');

      // Second failure should open circuit
      await expect(breaker.execute(failingOperation)).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');
    });

    test('should reset circuit breaker', () => {
      const breaker = createCircuitBreaker();
      
      breaker.reset();
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('Service Integration', () => {
    test('should create batch processor with dependencies', () => {
      const llmClient = createLLMClient(config);
      const errorHandler = createErrorHandler(config);
      
      expect(() => {
        const processor = createBatchProcessor(llmClient, errorHandler, config);
        expect(processor).toBeDefined();
      }).not.toThrow();
    });

    test('should handle service initialization sequence', () => {
      // Simulate service initialization order
      const storageManager = createStorageManager();
      const cacheManager = createCacheManager();
      const llmClient = createLLMClient(config);
      const errorHandler = createErrorHandler(config);
      const circuitBreaker = createCircuitBreaker();
      const dataFilter = createDataFilter();
      
      expect(storageManager).toBeDefined();
      expect(cacheManager).toBeDefined();
      expect(llmClient).toBeDefined();
      expect(errorHandler).toBeDefined();
      expect(circuitBreaker).toBeDefined();
      expect(dataFilter).toBeDefined();
    });
  });

  describe('Data Processing Pipeline', () => {
    test('should handle element analysis data structure', () => {
      const mockElement: FocusableElement = {
        selector: 'button#test',
        tagName: 'BUTTON',
        tabIndex: 0,
        computedStyle: {
          outline: 'none',
          outlineColor: 'rgb(0, 0, 0)',
          outlineWidth: '0px',
          outlineStyle: 'none',
          outlineOffset: '0px',
          boxShadow: 'none',
          border: '0px none rgb(0, 0, 0)',
          borderColor: 'rgb(0, 0, 0)',
          borderWidth: '0px',
          borderStyle: 'none',
          borderRadius: '0px',
          backgroundColor: 'rgb(255, 255, 255)',
          color: 'rgb(0, 0, 0)',
          opacity: '1',
          visibility: 'visible',
          display: 'block',
          position: 'static',
          zIndex: 'auto'
        },
        boundingRect: {
          x: 0,
          y: 0,
          width: 100,
          height: 30,
          top: 0,
          right: 100,
          bottom: 30,
          left: 0,
          toJSON: () => ({})
        },
        isInViewport: true,
        isSequentialFocusElement: true
      };

      const mockAnalysisData: ElementAnalysisData = {
        elements: [mockElement],
        pageUrl: 'https://example.com',
        timestamp: Date.now(),
        viewport: { width: 1024, height: 768 },
        pageMetadata: {
          title: 'Test Page',
          domain: 'example.com',
          userAgent: 'test-agent',
          documentReadyState: 'complete'
        },
        scanSettings: {
          includeHiddenElements: false,
          minimumContrastRatio: 3.0,
          focusIndicatorThreshold: 3
        }
      };

      // Test data filter processing
      const dataFilter = createDataFilter();
      expect(() => {
        const filteredData = dataFilter.filterElementAnalysisData(mockAnalysisData);
        expect(filteredData).toBeDefined();
        expect(filteredData.elements).toBeDefined();
        expect(Array.isArray(filteredData.elements)).toBe(true);
      }).not.toThrow();
    });
  });

  describe('Configuration Management', () => {
    test('should handle default configuration', () => {
      expect(DEFAULT_CONFIG).toBeDefined();
      expect(DEFAULT_CONFIG.apiKey).toBe('');
      expect(DEFAULT_CONFIG.baseUrl).toBe('https://api.openai.com/v1');
      expect(DEFAULT_CONFIG.model).toBe('gpt-4');
      expect(typeof DEFAULT_CONFIG.batchSize).toBe('number');
      expect(typeof DEFAULT_CONFIG.cacheEnabled).toBe('boolean');
    });

    test('should validate configuration structure', () => {
      const requiredFields = [
        'apiKey', 'baseUrl', 'model', 'batchSize', 'cacheEnabled',
        'timeout', 'maxRetries', 'retryDelay'
      ];

      requiredFields.forEach(field => {
        expect(config).toHaveProperty(field);
      });
    });
  });
});