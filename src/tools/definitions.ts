import { AgentTool } from '../types/agent-tools';

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_page_state',
    description: 'Perceive the current state of the page, including focusable elements, current active element, and viewport info.',
    parameters: {
      type: 'object',
      properties: {
        includeHtml: {
          type: 'boolean',
          description: 'Whether to include a simplified HTML structure of relevant elements.'
        }
      }
    }
  },
  {
    name: 'simulate_keyboard_event',
    description: 'Simulate a keyboard event (e.g., Tab, Arrows, Enter) to navigate or interact with the page.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The key to press (e.g., "Tab", "Enter", "ArrowDown").'
        },
        modifiers: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['Shift', 'Control', 'Alt', 'Meta']
          },
          description: 'Modifier keys to hold down.'
        }
      },
      required: ['key']
    }
  },
  {
    name: 'simulate_click',
    description: 'Simulate a mouse click on a specific element identified by a CSS selector.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Unique CSS selector for the target element.'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'inject_css',
    description: 'Inject CSS to fix visual accessibility issues (e.g., adding a focus ring).',
    parameters: {
      type: 'object',
      properties: {
        css: {
          type: 'string',
          description: 'The CSS rule(s) to inject.'
        },
        description: {
          type: 'string',
          description: 'Explanation of what this CSS fixes.'
        }
      },
      required: ['css', 'description']
    }
  },
  {
    name: 'capture_screenshot',
    description: 'Capture a screenshot of the current viewport or a specific element for visual verification.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector to crop the screenshot to the element.'
        },
        highlight: {
          type: 'boolean',
          description: 'Whether to draw a highlight rectangle around the element.'
        }
      }
    }
  },
  {
    name: 'get_computed_style',
    description: 'Get the computed style of an element to check for focus indicators (outline, border, box-shadow).',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element.'
        },
        properties: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Specific CSS properties to retrieve (e.g., "outline", "background-color").'
        }
      },
      required: ['selector']
    }
  }
];
