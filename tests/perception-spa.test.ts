import { PerceptionEngine } from '../src/agent/core/perception-engine';

describe('Perception Engine - SPA Support', () => {
  let perceptionEngine: PerceptionEngine;

  beforeEach(() => {
    perceptionEngine = new PerceptionEngine();
    // Reset location
    history.replaceState({}, '', '/');
  });

  afterEach(() => {
    perceptionEngine.destroy();
  });

  test('7.1.1 Should detect route changes via pushState', (done) => {
    let finished = false;
    perceptionEngine.addRouteChangeListener((url) => {
      if (!finished && url.includes('/new-route')) {
        finished = true;
        expect(url).toContain('/new-route');
        done();
      }
    });

    history.pushState({}, '', '/new-route');
  });

  test('7.1.1 Should detect route changes via hashchange', (done) => {
    let finished = false;
    perceptionEngine.addRouteChangeListener((url) => {
      if (!finished && url.includes('#hash-change')) {
        finished = true;
        expect(url).toContain('#hash-change');
        done();
      }
    });

    window.location.hash = 'hash-change';
  });

  test('7.1.2 Should detect significant DOM changes with debouncing', (done) => {
    perceptionEngine.addDOMChangeListener((changes) => {
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some(c => c.selector.includes('button') || c.selector.includes('dynamic-btn'))).toBe(true);
      done();
    });

    const btn = document.createElement('button');
    btn.id = 'dynamic-btn';
    btn.textContent = 'Dynamic Button';
    document.body.appendChild(btn);
  });

  test('7.1.2 Should ignore insignificant DOM changes', (done) => {
    const callback = jest.fn();
    perceptionEngine.addDOMChangeListener(callback);

    const span = document.createElement('span');
    span.textContent = 'Insignificant text';
    document.body.appendChild(span);

    setTimeout(() => {
      expect(callback).not.toHaveBeenCalled();
      done();
    }, 1000);
  });

  test('7.1.3 Should wait for stability when loading indicator is present', async () => {
    // Mock isPageLoading to return true initially, then false
    const isPageLoadingSpy = jest.spyOn(perceptionEngine, 'isPageLoading');
    isPageLoadingSpy
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    const startTime = Date.now();
    await perceptionEngine.waitForStability(2000);
    const duration = Date.now() - startTime;

    expect(duration).toBeGreaterThan(400); // Should have waited at least two cycles
    isPageLoadingSpy.mockRestore();
  });
});
