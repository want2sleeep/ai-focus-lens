import { AGENT_SYSTEM_PROMPT } from '../src/prompts/agent-prompt';
import { AGENT_TOOLS } from '../src/tools/definitions';

describe('Agent Configuration', () => {
  test('System Prompt should contain core requirements', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('WCAG 2.4.7 Focus Visible');
    expect(AGENT_SYSTEM_PROMPT).toContain('PRAR Loop');
    expect(AGENT_SYSTEM_PROMPT).toContain('Focus Trap');
    expect(AGENT_SYSTEM_PROMPT).toContain('Reflect');
  });

  test('Tool Definitions should be valid', () => {
    expect(AGENT_TOOLS.length).toBeGreaterThan(0);
    const names = AGENT_TOOLS.map(t => t.name);
    expect(names).toContain('get_page_state');
    expect(names).toContain('simulate_keyboard_event');
    expect(names).toContain('inject_css');
    
    // Check parameters structure
    AGENT_TOOLS.forEach(tool => {
      expect(tool.parameters).toHaveProperty('type', 'object');
      expect(tool.parameters).toHaveProperty('properties');
    });
  });
});
