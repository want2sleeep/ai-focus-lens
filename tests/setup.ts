// Jest test setup for AI Focus Lens extension

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onInstalled: {
      addListener: jest.fn()
    },
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn(),
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`)
  },
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  },
  scripting: {
    executeScript: jest.fn()
  }
};

// Make chrome API available globally
(global as any).chrome = mockChrome;

// Mock DOM APIs that might not be available in test environment
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    outline: 'none',
    outlineColor: 'rgb(0, 0, 0)',
    outlineWidth: '0px',
    outlineStyle: 'none',
    boxShadow: 'none',
    border: '0px none rgb(0, 0, 0)',
    borderColor: 'rgb(0, 0, 0)',
    borderWidth: '0px',
    borderStyle: 'none'
  })
});

// Mock getBoundingClientRect
Element.prototype.getBoundingClientRect = jest.fn(() => ({
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  top: 0,
  right: 100,
  bottom: 20,
  left: 0,
  toJSON: () => ({})
}));

// Mock focus/blur methods
HTMLElement.prototype.focus = jest.fn();
HTMLElement.prototype.blur = jest.fn();

// Mock scrollIntoView
HTMLElement.prototype.scrollIntoView = jest.fn();

console.log('AI Focus Lens test setup completed');