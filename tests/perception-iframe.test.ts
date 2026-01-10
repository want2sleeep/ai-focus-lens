import { PerceptionEngine } from '../src/agent/core/perception-engine';

describe('Perception Engine - Iframe Support', () => {
  let perceptionEngine: PerceptionEngine;

  beforeEach(() => {
    perceptionEngine = new PerceptionEngine();
    document.body.innerHTML = `
      <div id="main">
        <button id="btn1" style="width: 100px; height: 30px;">Main Button</button>
        <iframe id="frame1" src="https://example.com/frame1" style="width: 300px; height: 200px;"></iframe>
      </div>
    `;

    // Mock getBoundingClientRect for iframe
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      iframe.getBoundingClientRect = jest.fn(() => ({
        width: 300,
        height: 200,
        top: 50,
        left: 0,
        bottom: 250,
        right: 300,
        x: 0,
        y: 50,
        toJSON: () => {}
      })) as any;
    });
  });

  afterEach(() => {
    perceptionEngine.destroy();
  });

  test('7.3.1 Should discover iframes', async () => {
    const perception = await perceptionEngine.perceive();
    expect(perception.pageState.frames.length).toBe(1);
    expect(perception.pageState.frames[0]?.frameId).toBe('frame1');
  });

  test('7.3.1 Should identify iframe as a focusable element', async () => {
    const perception = await perceptionEngine.perceive();
    console.log('Focusable elements:', perception.pageState.focusableElements.map(el => el.tagName));
    expect(perception.pageState.focusableElements.some(el => el.tagName === 'iframe')).toBe(true);
  });

  test('7.3.3 Should identify elements inside same-origin iframes', async () => {
    // Setup same-origin iframe with content
    const iframe = document.getElementById('frame1') as HTMLIFrameElement;
    
    // In JSDOM, we need to make sure the iframe is fully "loaded"
    // or just mock the contentDocument properly.
    const mockDoc = document.implementation.createHTMLDocument();
    mockDoc.body.innerHTML = '<button id="inner-btn">Inner Button</button>';
    
    Object.defineProperty(iframe, 'contentDocument', {
      value: mockDoc
    });

    // Mock getBoundingClientRect for inner button
    const innerBtn = mockDoc.getElementById('inner-btn')!;
    innerBtn.getBoundingClientRect = jest.fn(() => ({
      width: 50, height: 20, top: 10, left: 10, bottom: 30, right: 60, x: 10, y: 10, toJSON: () => {}
    })) as any;

    const perception = await perceptionEngine.perceive();
    const innerElements = perception.pageState.focusableElements.filter(el => el.frameId === 'frame1');
    
    expect(innerElements.length).toBe(1);
    expect(innerElements[0]?.selector).toContain('inner-btn');
  });
});
