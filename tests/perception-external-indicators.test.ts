import { PerceptionEngine } from '../src/agent/core/perception-engine';

describe('Perception Engine - External Indicators', () => {
  let perceptionEngine: PerceptionEngine;

  beforeEach(() => {
    perceptionEngine = new PerceptionEngine();
    document.body.innerHTML = `
      <div id="container">
        <span id="indicator" style="background-color: transparent; width: 10px; height: 10px; display: inline-block;"></span>
        <a id="link" href="#">Link</a>
      </div>
    `;

    // Mock styles
    const indicator = document.getElementById('indicator')!;
    const link = document.getElementById('link')!;

    let focusedElement: Element | null = null;

    // Mock focus method to update local focusedElement
    HTMLElement.prototype.focus = jest.fn(function() {
      focusedElement = this as Element;
    });

    // Mock blur method
    HTMLElement.prototype.blur = jest.fn(function() {
      focusedElement = null;
    });

    // Mock getComputedStyle
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = jest.fn((el) => {
      if (el === indicator) {
        // When link is focused, indicator turns blue
        if (focusedElement === link) {
          return { backgroundColor: 'blue', opacity: '1', visibility: 'visible' } as any;
        }
        return { backgroundColor: 'transparent', opacity: '1', visibility: 'visible' } as any;
      }
      return originalGetComputedStyle(el);
    });
  });

  afterEach(() => {
    perceptionEngine.destroy();
    jest.restoreAllMocks();
  });

  test('Should capture external indicators on siblings when focusing element', async () => {
    const perception = await perceptionEngine.perceive();
    const linkElement = perception.pageState.focusableElements.find(el => el.selector.includes('link'));
    
    expect(linkElement).toBeDefined();
    expect(linkElement?.externalIndicators).toBeDefined();
    expect(linkElement?.externalIndicators?.length).toBeGreaterThan(0);
    expect(linkElement?.externalIndicators![0]).toContain('changed background-color');
  });
});
