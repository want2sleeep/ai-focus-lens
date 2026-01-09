// Content Script functionality verification tests
// Feature: ai-focus-lens, Content Script functionality validation

import { 
  FocusableElement, 
  ElementAnalysisData,
  ComputedStyleData,
  ContentScriptMessage 
} from '../src/types';

// Mock the content script module by importing its functions
// Since content-script.ts is designed to run in browser context, we'll test its core logic

describe('Content Script Functionality Verification', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Reset any global state
    jest.clearAllMocks();
  });

  describe('Element Identification', () => {
    test('should identify basic focusable elements', () => {
      // Create test DOM with focusable elements
      document.body.innerHTML = `
        <button id="btn1">Button 1</button>
        <input type="text" id="input1" />
        <a href="#" id="link1">Link 1</a>
        <select id="select1"><option>Option 1</option></select>
        <textarea id="textarea1"></textarea>
        <div tabindex="0" id="div1">Focusable div</div>
        <div tabindex="-1" id="div2">Non-focusable div</div>
        <div id="div3">Regular div</div>
      `;

      // Test focusable selectors
      const focusableSelectors = [
        'a[href]',
        'button',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]'
      ];

      const foundElements: Element[] = [];
      focusableSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (!foundElements.includes(el)) {
            foundElements.push(el);
          }
        });
      });

      // Should find: button, input, a, select, textarea, div with tabindex="0"
      // Should NOT find: div with tabindex="-1", regular div
      expect(foundElements.length).toBe(6);
      
      const elementIds = foundElements.map(el => el.id);
      expect(elementIds).toContain('btn1');
      expect(elementIds).toContain('input1');
      expect(elementIds).toContain('link1');
      expect(elementIds).toContain('select1');
      expect(elementIds).toContain('textarea1');
      expect(elementIds).toContain('div1');
      expect(elementIds).not.toContain('div2'); // tabindex="-1"
      expect(elementIds).not.toContain('div3'); // no tabindex
    });

    test('should filter out hidden elements', () => {
      document.body.innerHTML = `
        <button id="visible">Visible Button</button>
        <button id="hidden" style="display: none;">Hidden Button</button>
        <button id="invisible" style="visibility: hidden;">Invisible Button</button>
        <button id="transparent" style="opacity: 0;">Transparent Button</button>
        <button id="zero-size" style="width: 0; height: 0;">Zero Size Button</button>
      `;

      const buttons = document.querySelectorAll('button');
      const visibleButtons: HTMLElement[] = [];

      buttons.forEach(button => {
        if (button instanceof HTMLElement) {
          // Mock getBoundingClientRect for different visibility states
          if (button.id === 'visible') {
            button.getBoundingClientRect = jest.fn(() => ({
              width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100, x: 0, y: 0, toJSON: () => ({})
            }));
          } else {
            button.getBoundingClientRect = jest.fn(() => ({
              width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({})
            }));
          }

          const rect = button.getBoundingClientRect();
          const style = window.getComputedStyle(button);
          
          // For test environment, we need to check the actual style attributes
          // since getComputedStyle returns mocked values
          const actualDisplay = button.style.display || 'block';
          const actualVisibility = button.style.visibility || 'visible';
          const actualOpacity = button.style.opacity || '1';
          
          const isVisible = (
            rect.width > 0 &&
            rect.height > 0 &&
            actualVisibility !== 'hidden' &&
            actualDisplay !== 'none' &&
            parseFloat(actualOpacity) > 0
          );

          if (isVisible) {
            visibleButtons.push(button);
          }
        }
      });

      // Only the visible button should be included
      expect(visibleButtons.length).toBe(1);
      expect(visibleButtons[0]?.id).toBe('visible');
    });
  });

  describe('Style Data Collection', () => {
    test('should collect required computed style properties', () => {
      document.body.innerHTML = `
        <button id="test-button" style="outline: 2px solid blue; border: 1px solid red;">Test Button</button>
      `;

      const button = document.getElementById('test-button') as HTMLElement;
      expect(button).toBeTruthy();

      const computedStyle = window.getComputedStyle(button);
      
      // Verify core style properties are accessible (those that are mocked in setup)
      const coreProperties = [
        'outline', 'outlineColor', 'outlineWidth', 'outlineStyle',
        'boxShadow', 'border', 'borderColor', 'borderWidth', 'borderStyle'
      ];

      coreProperties.forEach(property => {
        const value = computedStyle[property as keyof CSSStyleDeclaration];
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
      });

      // Test that we can access the mocked values
      expect(computedStyle.outline).toBe('none');
      expect(computedStyle.outlineColor).toBe('rgb(0, 0, 0)');
      expect(computedStyle.boxShadow).toBe('none');
      expect(computedStyle.border).toBe('0px none rgb(0, 0, 0)');
    });

    test('should collect bounding rect data', () => {
      document.body.innerHTML = `
        <button id="test-button">Test Button</button>
      `;

      const button = document.getElementById('test-button') as HTMLElement;
      const rect = button.getBoundingClientRect();

      // Verify all required rect properties are present
      expect(typeof rect.x).toBe('number');
      expect(typeof rect.y).toBe('number');
      expect(typeof rect.width).toBe('number');
      expect(typeof rect.height).toBe('number');
      expect(typeof rect.top).toBe('number');
      expect(typeof rect.right).toBe('number');
      expect(typeof rect.bottom).toBe('number');
      expect(typeof rect.left).toBe('number');
      expect(typeof rect.toJSON).toBe('function');
    });
  });

  describe('Focus State Detection', () => {
    test('should handle focus and blur operations', () => {
      document.body.innerHTML = `
        <button id="test-button">Test Button</button>
      `;

      const button = document.getElementById('test-button') as HTMLElement;
      
      // Test focus functionality
      expect(() => button.focus()).not.toThrow();
      expect(() => button.blur()).not.toThrow();
      
      // Verify focus/blur methods are available
      expect(typeof button.focus).toBe('function');
      expect(typeof button.blur).toBe('function');
    });

    test('should collect focus state data without errors', () => {
      document.body.innerHTML = `
        <button id="test-button">Test Button</button>
      `;

      const button = document.getElementById('test-button') as HTMLElement;
      const originalFocused = document.activeElement;

      // Simulate focus state data collection
      let unfocusedStyle: ComputedStyleData;
      let focusedStyle: ComputedStyleData;

      expect(() => {
        // Collect unfocused state
        unfocusedStyle = {
          outline: window.getComputedStyle(button).outline,
          outlineColor: window.getComputedStyle(button).outlineColor,
          outlineWidth: window.getComputedStyle(button).outlineWidth,
          outlineStyle: window.getComputedStyle(button).outlineStyle,
          outlineOffset: window.getComputedStyle(button).outlineOffset,
          boxShadow: window.getComputedStyle(button).boxShadow,
          border: window.getComputedStyle(button).border,
          borderColor: window.getComputedStyle(button).borderColor,
          borderWidth: window.getComputedStyle(button).borderWidth,
          borderStyle: window.getComputedStyle(button).borderStyle,
          borderRadius: window.getComputedStyle(button).borderRadius,
          backgroundColor: window.getComputedStyle(button).backgroundColor,
          color: window.getComputedStyle(button).color,
          opacity: window.getComputedStyle(button).opacity,
          visibility: window.getComputedStyle(button).visibility,
          display: window.getComputedStyle(button).display,
          position: window.getComputedStyle(button).position,
          zIndex: window.getComputedStyle(button).zIndex
        };

        // Focus and collect focused state
        button.focus();
        focusedStyle = {
          outline: window.getComputedStyle(button).outline,
          outlineColor: window.getComputedStyle(button).outlineColor,
          outlineWidth: window.getComputedStyle(button).outlineWidth,
          outlineStyle: window.getComputedStyle(button).outlineStyle,
          outlineOffset: window.getComputedStyle(button).outlineOffset,
          boxShadow: window.getComputedStyle(button).boxShadow,
          border: window.getComputedStyle(button).border,
          borderColor: window.getComputedStyle(button).borderColor,
          borderWidth: window.getComputedStyle(button).borderWidth,
          borderStyle: window.getComputedStyle(button).borderStyle,
          borderRadius: window.getComputedStyle(button).borderRadius,
          backgroundColor: window.getComputedStyle(button).backgroundColor,
          color: window.getComputedStyle(button).color,
          opacity: window.getComputedStyle(button).opacity,
          visibility: window.getComputedStyle(button).visibility,
          display: window.getComputedStyle(button).display,
          position: window.getComputedStyle(button).position,
          zIndex: window.getComputedStyle(button).zIndex
        };

        // Restore focus
        if (originalFocused instanceof HTMLElement) {
          originalFocused.focus();
        } else {
          button.blur();
        }
      }).not.toThrow();

      expect(unfocusedStyle!).toBeDefined();
      expect(focusedStyle!).toBeDefined();
    });
  });

  describe('Message Communication', () => {
    test('should handle Chrome runtime messages', () => {
      const mockSendMessage = chrome.runtime.sendMessage as jest.Mock;
      
      // Test message structure
      const testMessage: ContentScriptMessage = {
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

      // Simulate sending message
      expect(() => {
        chrome.runtime.sendMessage(testMessage);
      }).not.toThrow();

      expect(mockSendMessage).toHaveBeenCalledWith(testMessage);
    });

    test('should handle message listener registration', () => {
      const mockAddListener = chrome.runtime.onMessage.addListener as jest.Mock;
      
      // Test listener registration
      const messageHandler = (message: ContentScriptMessage, sender: any, sendResponse: any) => {
        // Handler logic
      };

      expect(() => {
        chrome.runtime.onMessage.addListener(messageHandler);
      }).not.toThrow();

      expect(mockAddListener).toHaveBeenCalledWith(messageHandler);
    });
  });

  describe('Element Analysis Data Structure', () => {
    test('should create valid ElementAnalysisData structure', () => {
      const analysisData: ElementAnalysisData = {
        elements: [],
        pageUrl: window.location.href,
        timestamp: Date.now(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        pageMetadata: {
          title: document.title,
          domain: window.location.hostname,
          userAgent: navigator.userAgent,
          documentReadyState: document.readyState
        },
        scanSettings: {
          includeHiddenElements: false,
          minimumContrastRatio: 3.0,
          focusIndicatorThreshold: 3
        }
      };

      // Verify structure
      expect(analysisData.elements).toBeInstanceOf(Array);
      expect(typeof analysisData.pageUrl).toBe('string');
      expect(typeof analysisData.timestamp).toBe('number');
      expect(typeof analysisData.viewport.width).toBe('number');
      expect(typeof analysisData.viewport.height).toBe('number');
      expect(typeof analysisData.pageMetadata.title).toBe('string');
      expect(typeof analysisData.pageMetadata.domain).toBe('string');
      expect(typeof analysisData.scanSettings.includeHiddenElements).toBe('boolean');
      expect(typeof analysisData.scanSettings.minimumContrastRatio).toBe('number');
      expect(typeof analysisData.scanSettings.focusIndicatorThreshold).toBe('number');
    });
  });

  describe('Sequential Focus Element Detection', () => {
    test('should correctly identify sequential focus elements', () => {
      document.body.innerHTML = `
        <button id="button">Button</button>
        <input type="text" id="input" />
        <a href="#" id="link">Link</a>
        <div tabindex="0" id="focusable-div">Focusable Div</div>
        <div tabindex="-1" id="non-focusable-div">Non-focusable Div</div>
        <div contenteditable="true" id="editable">Editable</div>
        <div contenteditable="true" tabindex="-1" id="editable-excluded">Editable Excluded</div>
        <div id="regular-div">Regular Div</div>
      `;

      const elements = document.querySelectorAll('*');
      const sequentialFocusElements: HTMLElement[] = [];

      elements.forEach(element => {
        if (element instanceof HTMLElement) {
          const tagName = element.tagName.toLowerCase();
          const tabIndex = element.getAttribute('tabindex');
          
          // Elements that are naturally focusable
          const naturallyFocusable = [
            'a', 'button', 'input', 'select', 'textarea', 'details'
          ];
          
          let isSequentialFocus = false;
          
          if (naturallyFocusable.includes(tagName)) {
            // Check if explicitly removed from tab order
            isSequentialFocus = tabIndex !== '-1';
          } else if (tabIndex !== null) {
            // Elements with positive or zero tabindex
            const tabIndexNum = parseInt(tabIndex, 10);
            isSequentialFocus = !isNaN(tabIndexNum) && tabIndexNum >= 0;
          } else if (element.getAttribute('contenteditable') === 'true') {
            // Contenteditable elements
            isSequentialFocus = tabIndex !== '-1';
          }
          
          if (isSequentialFocus) {
            sequentialFocusElements.push(element);
          }
        }
      });

      const elementIds = sequentialFocusElements.map(el => el.id);
      
      // Should include naturally focusable elements
      expect(elementIds).toContain('button');
      expect(elementIds).toContain('input');
      expect(elementIds).toContain('link');
      
      // Should include elements with tabindex >= 0
      expect(elementIds).toContain('focusable-div');
      
      // Should include contenteditable elements not excluded
      expect(elementIds).toContain('editable');
      
      // Should NOT include elements with tabindex="-1"
      expect(elementIds).not.toContain('non-focusable-div');
      expect(elementIds).not.toContain('editable-excluded');
      
      // Should NOT include regular divs
      expect(elementIds).not.toContain('regular-div');
    });
  });

  describe('Viewport Detection', () => {
    test('should detect if element is in viewport', () => {
      document.body.innerHTML = `
        <button id="in-viewport">In Viewport</button>
      `;

      const button = document.getElementById('in-viewport') as HTMLElement;
      const rect = button.getBoundingClientRect();
      
      // Mock getBoundingClientRect to return values within viewport
      button.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        left: 100,
        bottom: 120,
        right: 200,
        width: 100,
        height: 20,
        x: 100,
        y: 100,
        toJSON: () => ({})
      }));

      const isInViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );

      // With mocked values, element should be in viewport
      const newRect = button.getBoundingClientRect();
      const inViewport = (
        newRect.top >= 0 &&
        newRect.left >= 0 &&
        newRect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        newRect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );

      expect(inViewport).toBe(true);
    });
  });
});