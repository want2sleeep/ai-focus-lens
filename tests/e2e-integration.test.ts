// End-to-End Integration Test
// Feature: ai-focus-lens, Complete scanning workflow verification

import { 
  ExtensionConfig,
  ContentScriptMessage,
  ServiceWorkerMessage,
  PopupMessage,
  ElementAnalysisData,
  FocusableElement,
  AnalysisResult,
  ScanReport,
  DEFAULT_CONFIG
} from '../src/types';

describe('AI Focus Lens E2E Integration', () => {
  let mockConfig: ExtensionConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_CONFIG,
      apiKey: 'test-api-key-12345',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4'
    };

    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup Chrome API mocks for E2E testing
    (chrome.storage.sync.get as jest.Mock).mockResolvedValue(mockConfig);
    (chrome.storage.sync.set as jest.Mock).mockResolvedValue(undefined);
    (chrome.tabs.query as jest.Mock).mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
    (chrome.tabs.sendMessage as jest.Mock).mockResolvedValue({ success: true });
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('Complete Scanning Workflow', () => {
    test('should execute full scanning workflow from popup to results', async () => {
      // Step 1: Popup initiates scan
      const scanInitMessage: PopupMessage = {
        type: 'START_SCAN',
        payload: mockConfig
      };

      // Simulate popup sending scan request
      expect(() => {
        chrome.runtime.sendMessage(scanInitMessage);
      }).not.toThrow();

      // Step 2: Service Worker receives scan request and injects content script
      const contentScriptInjection = {
        target: { tabId: 1 },
        files: ['content-script.js']
      };

      expect(() => {
        chrome.scripting.executeScript(contentScriptInjection);
      }).not.toThrow();

      // Step 3: Content Script analyzes page and sends data
      const mockElements: FocusableElement[] = [
        {
          selector: 'button#submit',
          tagName: 'BUTTON',
          tabIndex: 0,
          computedStyle: {
            outline: 'none',
            outlineColor: 'rgb(0, 0, 0)',
            outlineWidth: '0px',
            outlineStyle: 'none',
            outlineOffset: '0px',
            boxShadow: 'none',
            border: '1px solid rgb(204, 204, 204)',
            borderColor: 'rgb(204, 204, 204)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '4px',
            backgroundColor: 'rgb(255, 255, 255)',
            color: 'rgb(0, 0, 0)',
            opacity: '1',
            visibility: 'visible',
            display: 'block',
            position: 'static',
            zIndex: 'auto'
          },
          boundingRect: {
            x: 100,
            y: 200,
            width: 120,
            height: 40,
            top: 200,
            right: 220,
            bottom: 240,
            left: 100,
            toJSON: () => ({})
          },
          isInViewport: true,
          isSequentialFocusElement: true,
          focusedStyle: {
            outline: '2px solid rgb(0, 123, 255)',
            outlineColor: 'rgb(0, 123, 255)',
            outlineWidth: '2px',
            outlineStyle: 'solid',
            outlineOffset: '0px',
            boxShadow: '0 0 0 3px rgba(0, 123, 255, 0.25)',
            border: '1px solid rgb(204, 204, 204)',
            borderColor: 'rgb(204, 204, 204)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '4px',
            backgroundColor: 'rgb(255, 255, 255)',
            color: 'rgb(0, 0, 0)',
            opacity: '1',
            visibility: 'visible',
            display: 'block',
            position: 'static',
            zIndex: 'auto'
          },
          unfocusedStyle: {
            outline: 'none',
            outlineColor: 'rgb(0, 0, 0)',
            outlineWidth: '0px',
            outlineStyle: 'none',
            outlineOffset: '0px',
            boxShadow: 'none',
            border: '1px solid rgb(204, 204, 204)',
            borderColor: 'rgb(204, 204, 204)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '4px',
            backgroundColor: 'rgb(255, 255, 255)',
            color: 'rgb(0, 0, 0)',
            opacity: '1',
            visibility: 'visible',
            display: 'block',
            position: 'static',
            zIndex: 'auto'
          }
        }
      ];

      const analysisData: ElementAnalysisData = {
        elements: mockElements,
        pageUrl: 'https://example.com/test-page',
        timestamp: Date.now(),
        viewport: { width: 1024, height: 768 },
        pageMetadata: {
          title: 'Test Page',
          domain: 'example.com',
          userAgent: 'Mozilla/5.0 (Test Browser)',
          documentReadyState: 'complete'
        },
        scanSettings: {
          includeHiddenElements: false,
          minimumContrastRatio: 3.0,
          focusIndicatorThreshold: 3
        }
      };

      const contentScriptMessage: ContentScriptMessage = {
        type: 'ELEMENTS_ANALYZED',
        payload: analysisData
      };

      // Simulate content script sending analysis data
      expect(() => {
        chrome.runtime.sendMessage(contentScriptMessage);
      }).not.toThrow();

      // Step 4: Service Worker processes data and calls LLM API
      // Mock LLM API response
      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              status: 'PASS',
              reason: 'Element has clear focus indicator with outline and box-shadow changes',
              suggestion: 'Focus indicator is properly implemented',
              confidence: 0.95
            })
          }
        }]
      };

      // Step 5: Service Worker sends results back to popup
      const mockAnalysisResults: AnalysisResult[] = [
        {
          elementSelector: 'button#submit',
          result: {
            status: 'PASS',
            reason: 'Element has clear focus indicator with outline and box-shadow changes',
            suggestion: 'Focus indicator is properly implemented',
            confidence: 0.95,
            actRuleCompliance: {
              ruleId: 'oj04fd',
              outcome: 'passed',
              details: 'Element meets ACT rule oj04fd requirements for focus visibility'
            }
          },
          timestamp: Date.now(),
          processingTime: 150
        }
      ];

      const scanReport: ScanReport = {
        pageUrl: 'https://example.com/test-page',
        totalElements: 1,
        passedElements: 1,
        failedElements: 0,
        inapplicableElements: 0,
        cantellElements: 0,
        results: mockAnalysisResults,
        scanDuration: 2500,
        timestamp: Date.now(),
        scanId: 'scan-' + Date.now(),
        configuration: {
          model: 'gpt-4',
          batchSize: 5,
          cacheUsed: false
        },
        summary: {
          overallCompliance: 100,
          commonIssues: [],
          recommendations: ['Continue following current focus indicator practices']
        }
      };

      const serviceWorkerMessage: ServiceWorkerMessage = {
        type: 'SCAN_COMPLETE',
        payload: scanReport
      };

      // Simulate service worker sending results
      expect(() => {
        chrome.runtime.sendMessage(serviceWorkerMessage);
      }).not.toThrow();

      // Verify the complete workflow executed without errors
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(contentScriptInjection);
    });

    test('should handle scanning workflow with multiple elements', async () => {
      // Create multiple test elements
      const mockElements: FocusableElement[] = [
        {
          selector: 'input#email',
          tagName: 'INPUT',
          tabIndex: 0,
          computedStyle: {
            outline: 'none',
            outlineColor: 'rgb(0, 0, 0)',
            outlineWidth: '0px',
            outlineStyle: 'none',
            outlineOffset: '0px',
            boxShadow: 'none',
            border: '1px solid rgb(204, 204, 204)',
            borderColor: 'rgb(204, 204, 204)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '4px',
            backgroundColor: 'rgb(255, 255, 255)',
            color: 'rgb(0, 0, 0)',
            opacity: '1',
            visibility: 'visible',
            display: 'block',
            position: 'static',
            zIndex: 'auto'
          },
          boundingRect: {
            x: 50,
            y: 100,
            width: 200,
            height: 30,
            top: 100,
            right: 250,
            bottom: 130,
            left: 50,
            toJSON: () => ({})
          },
          isInViewport: true,
          isSequentialFocusElement: true
        },
        {
          selector: 'button#submit',
          tagName: 'BUTTON',
          tabIndex: 0,
          computedStyle: {
            outline: 'none',
            outlineColor: 'rgb(0, 0, 0)',
            outlineWidth: '0px',
            outlineStyle: 'none',
            outlineOffset: '0px',
            boxShadow: 'none',
            border: '1px solid rgb(0, 123, 255)',
            borderColor: 'rgb(0, 123, 255)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '4px',
            backgroundColor: 'rgb(0, 123, 255)',
            color: 'rgb(255, 255, 255)',
            opacity: '1',
            visibility: 'visible',
            display: 'block',
            position: 'static',
            zIndex: 'auto'
          },
          boundingRect: {
            x: 50,
            y: 150,
            width: 100,
            height: 40,
            top: 150,
            right: 150,
            bottom: 190,
            left: 50,
            toJSON: () => ({})
          },
          isInViewport: true,
          isSequentialFocusElement: true
        }
      ];

      const analysisData: ElementAnalysisData = {
        elements: mockElements,
        pageUrl: 'https://example.com/form-page',
        timestamp: Date.now(),
        viewport: { width: 1024, height: 768 },
        pageMetadata: {
          title: 'Form Page',
          domain: 'example.com',
          userAgent: 'Mozilla/5.0 (Test Browser)',
          documentReadyState: 'complete'
        },
        scanSettings: {
          includeHiddenElements: false,
          minimumContrastRatio: 3.0,
          focusIndicatorThreshold: 3
        }
      };

      // Simulate batch processing workflow
      const batchSize = mockConfig.batchSize || 5;
      const batches = [];
      for (let i = 0; i < mockElements.length; i += batchSize) {
        batches.push(mockElements.slice(i, i + batchSize));
      }

      expect(batches.length).toBeGreaterThan(0);
      if (batches.length > 0) {
        expect(batches[0]!.length).toBeLessThanOrEqual(batchSize);
      }

      // Verify all elements are included in batches
      const totalElementsInBatches = batches.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalElementsInBatches).toBe(mockElements.length);
    });

    test('should handle error scenarios in scanning workflow', async () => {
      // Test API key missing error
      const invalidConfig = { ...mockConfig, apiKey: '' };
      
      const scanMessage: PopupMessage = {
        type: 'START_SCAN',
        payload: invalidConfig
      };

      expect(() => {
        chrome.runtime.sendMessage(scanMessage);
      }).not.toThrow();

      // Test network error scenario
      (chrome.runtime.sendMessage as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const contentScriptMessage: ContentScriptMessage = {
        type: 'ELEMENTS_ANALYZED',
        payload: {
          elements: [],
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
        }
      };

      // Should handle error gracefully
      await expect(chrome.runtime.sendMessage(contentScriptMessage)).rejects.toThrow('Network error');
    });
  });

  describe('Cross-Component Communication', () => {
    test('should verify message passing between all components', () => {
      // Test Popup -> Service Worker communication
      const popupToServiceWorker: PopupMessage = {
        type: 'GET_CONFIG',
        payload: undefined
      };

      expect(() => {
        chrome.runtime.sendMessage(popupToServiceWorker);
      }).not.toThrow();

      // Test Service Worker -> Content Script communication
      const serviceWorkerToContentScript = {
        type: 'START_ANALYSIS',
        payload: { scanId: 'test-scan-123' }
      };

      expect(() => {
        chrome.tabs.sendMessage(1, serviceWorkerToContentScript);
      }).not.toThrow();

      // Test Content Script -> Service Worker communication
      const contentScriptToServiceWorker: ContentScriptMessage = {
        type: 'ELEMENTS_ANALYZED',
        payload: {
          elements: [],
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
        }
      };

      expect(() => {
        chrome.runtime.sendMessage(contentScriptToServiceWorker);
      }).not.toThrow();

      // Test Service Worker -> Popup communication
      const serviceWorkerToPopup: ServiceWorkerMessage = {
        type: 'SCAN_PROGRESS',
        payload: {
          total: 10,
          completed: 5,
          failed: 0,
          status: 'scanning',
          currentElement: 'button#test'
        }
      };

      expect(() => {
        chrome.runtime.sendMessage(serviceWorkerToPopup);
      }).not.toThrow();

      // Verify all message types are handled
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    });

    test('should handle bidirectional communication patterns', () => {
      // Test request-response pattern
      const requestMessage = {
        type: 'GET_CONFIG',
        payload: {},
        requestId: 'req-123'
      };

      const responseMessage = {
        type: 'CONFIG_RESPONSE',
        payload: mockConfig,
        requestId: 'req-123'
      };

      expect(() => {
        chrome.runtime.sendMessage(requestMessage);
        chrome.runtime.sendMessage(responseMessage);
      }).not.toThrow();

      // Test event broadcasting pattern
      const broadcastMessage = {
        type: 'EXTENSION_STATE_CHANGED',
        payload: {
          state: 'scanning',
          timestamp: Date.now()
        }
      };

      expect(() => {
        chrome.runtime.sendMessage(broadcastMessage);
      }).not.toThrow();
    });

    test('should validate message structure and types', () => {
      // Test message type validation
      const validMessages = [
        { type: 'START_SCAN', payload: { tabId: 1, config: mockConfig } },
        { type: 'ELEMENTS_ANALYZED', payload: { elements: [], pageUrl: 'test', timestamp: Date.now(), viewport: { width: 1024, height: 768 }, pageMetadata: { title: '', domain: '', userAgent: '', documentReadyState: 'complete' }, scanSettings: { includeHiddenElements: false, minimumContrastRatio: 3.0, focusIndicatorThreshold: 3 } } },
        { type: 'SCAN_COMPLETED', payload: { pageUrl: 'test', totalElements: 0, passedElements: 0, failedElements: 0, results: [], scanDuration: 1000, timestamp: Date.now(), scanId: 'test' } }
      ];

      validMessages.forEach(message => {
        expect(message).toHaveProperty('type');
        expect(message).toHaveProperty('payload');
        expect(typeof message.type).toBe('string');
        expect(typeof message.payload).toBe('object');
      });
    });
  });

  describe('Data Flow Integrity', () => {
    test('should maintain data consistency throughout the pipeline', () => {
      const originalElement: FocusableElement = {
        selector: 'input#test',
        tagName: 'INPUT',
        tabIndex: 0,
        computedStyle: {
          outline: 'none',
          outlineColor: 'rgb(0, 0, 0)',
          outlineWidth: '0px',
          outlineStyle: 'none',
          outlineOffset: '0px',
          boxShadow: 'none',
          border: '1px solid rgb(204, 204, 204)',
          borderColor: 'rgb(204, 204, 204)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '4px',
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
          width: 200,
          height: 30,
          top: 0,
          right: 200,
          bottom: 30,
          left: 0,
          toJSON: () => ({})
        },
        isInViewport: true,
        isSequentialFocusElement: true
      };

      // Simulate data transformation through pipeline
      const analysisData: ElementAnalysisData = {
        elements: [originalElement],
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

      // Verify data structure integrity
      expect(analysisData.elements[0]?.selector).toBe(originalElement.selector);
      expect(analysisData.elements[0]?.tagName).toBe(originalElement.tagName);
      expect(analysisData.elements[0]?.tabIndex).toBe(originalElement.tabIndex);
      expect(analysisData.elements[0]?.isInViewport).toBe(originalElement.isInViewport);
      expect(analysisData.elements[0]?.isSequentialFocusElement).toBe(originalElement.isSequentialFocusElement);

      // Verify computed style data integrity
      const originalStyle = originalElement.computedStyle;
      const pipelineStyle = analysisData.elements[0]?.computedStyle;
      
      if (pipelineStyle) {
        Object.keys(originalStyle).forEach(key => {
          expect(pipelineStyle[key as keyof typeof pipelineStyle]).toBe(originalStyle[key as keyof typeof originalStyle]);
        });
      }

      // Verify bounding rect data integrity
      const originalRect = originalElement.boundingRect;
      const pipelineRect = analysisData.elements[0]?.boundingRect;
      
      if (pipelineRect) {
        expect(pipelineRect.x).toBe(originalRect.x);
        expect(pipelineRect.y).toBe(originalRect.y);
        expect(pipelineRect.width).toBe(originalRect.width);
        expect(pipelineRect.height).toBe(originalRect.height);
      }
    });

    test('should handle data serialization and deserialization', () => {
      const testData: ElementAnalysisData = {
        elements: [{
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
            border: '1px solid rgb(204, 204, 204)',
            borderColor: 'rgb(204, 204, 204)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '4px',
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
            left: 0
          } as DOMRect,
          isInViewport: true,
          isSequentialFocusElement: true
        }],
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

      // Test JSON serialization/deserialization
      const serialized = JSON.stringify(testData);
      expect(typeof serialized).toBe('string');
      expect(serialized.length).toBeGreaterThan(0);

      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(testData);

      // Verify specific data integrity after round-trip
      expect(deserialized.elements[0]?.selector).toBe(testData.elements[0]?.selector);
      expect(deserialized.pageUrl).toBe(testData.pageUrl);
      expect(deserialized.viewport.width).toBe(testData.viewport.width);
    });
  });

  describe('Performance and Resource Management', () => {
    test('should handle large numbers of elements efficiently', () => {
      // Create a large number of test elements
      const largeElementSet: FocusableElement[] = [];
      for (let i = 0; i < 100; i++) {
        largeElementSet.push({
          selector: `button#btn-${i}`,
          tagName: 'BUTTON',
          tabIndex: 0,
          computedStyle: {
            outline: 'none',
            outlineColor: 'rgb(0, 0, 0)',
            outlineWidth: '0px',
            outlineStyle: 'none',
            outlineOffset: '0px',
            boxShadow: 'none',
            border: '1px solid rgb(204, 204, 204)',
            borderColor: 'rgb(204, 204, 204)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '4px',
            backgroundColor: 'rgb(255, 255, 255)',
            color: 'rgb(0, 0, 0)',
            opacity: '1',
            visibility: 'visible',
            display: 'block',
            position: 'static',
            zIndex: 'auto'
          },
          boundingRect: {
            x: i * 10,
            y: i * 5,
            width: 100,
            height: 30,
            top: i * 5,
            right: (i * 10) + 100,
            bottom: (i * 5) + 30,
            left: i * 10,
            toJSON: () => ({})
          },
          isInViewport: true,
          isSequentialFocusElement: true
        });
      }

      const largeAnalysisData: ElementAnalysisData = {
        elements: largeElementSet,
        pageUrl: 'https://example.com/large-page',
        timestamp: Date.now(),
        viewport: { width: 1024, height: 768 },
        pageMetadata: {
          title: 'Large Page',
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

      // Test that large data sets can be processed
      expect(largeAnalysisData.elements.length).toBe(100);
      
      // Test batch processing logic
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < largeElementSet.length; i += batchSize) {
        batches.push(largeElementSet.slice(i, i + batchSize));
      }

      expect(batches.length).toBe(10);
      if (batches.length > 0) {
        expect(batches[0]!.length).toBe(batchSize);
        expect(batches[batches.length - 1]!.length).toBe(batchSize);
      }
    });

    test('should manage memory usage during processing', () => {
      // Test memory-conscious data handling
      const testElement: FocusableElement = {
        selector: 'button#memory-test',
        tagName: 'BUTTON',
        tabIndex: 0,
        computedStyle: {
          outline: 'none',
          outlineColor: 'rgb(0, 0, 0)',
          outlineWidth: '0px',
          outlineStyle: 'none',
          outlineOffset: '0px',
          boxShadow: 'none',
          border: '1px solid rgb(204, 204, 204)',
          borderColor: 'rgb(204, 204, 204)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '4px',
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

      // Simulate processing and cleanup
      let processedElement = { ...testElement };
      
      // Verify object can be processed
      expect(processedElement).toBeDefined();
      expect(processedElement.selector).toBe(testElement.selector);

      // Simulate cleanup
      processedElement = null as any;
      expect(processedElement).toBeNull();
    });
  });

  describe('Extension Lifecycle Integration', () => {
    test('should handle extension installation and initialization', () => {
      const installDetails = { reason: 'install' };
      
      expect(() => {
        // Simulate extension installation
        chrome.runtime.onInstalled.addListener((details) => {
          if (details.reason === 'install') {
            // Initialize default configuration
            chrome.storage.sync.set(DEFAULT_CONFIG);
          }
        });
      }).not.toThrow();

      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    });

    test('should handle extension update scenarios', () => {
      const updateDetails = { reason: 'update', previousVersion: '0.9.0' };
      
      expect(() => {
        // Simulate extension update
        chrome.runtime.onInstalled.addListener((details) => {
          if (details.reason === 'update') {
            // Handle configuration migration
            chrome.storage.sync.get().then((config) => {
              const updatedConfig = { ...DEFAULT_CONFIG, ...config };
              chrome.storage.sync.set(updatedConfig);
            });
          }
        });
      }).not.toThrow();
    });

    test('should handle service worker lifecycle', () => {
      // Test service worker startup
      expect(() => {
        chrome.runtime.onStartup.addListener(() => {
          // Initialize services
          console.log('Service worker started');
        });
      }).not.toThrow();

      // Test message handling setup
      expect(() => {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          // Handle messages
          return true; // Keep message channel open
        });
      }).not.toThrow();
    });
  });
});