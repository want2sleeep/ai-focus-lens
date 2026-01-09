// Basic test to verify the testing setup works

describe('AI Focus Lens Extension', () => {
  test('should have Chrome APIs available', () => {
    expect(chrome).toBeDefined();
    expect(chrome.runtime).toBeDefined();
    expect(chrome.storage).toBeDefined();
    expect(chrome.tabs).toBeDefined();
  });

  test('should have DOM APIs available', () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
    expect(window.getComputedStyle).toBeDefined();
  });

  test('should have HTMLElement methods mocked', () => {
    const element = document.createElement('div');
    expect(element.focus).toBeDefined();
    expect(element.blur).toBeDefined();
    expect(element.scrollIntoView).toBeDefined();
    expect(element.getBoundingClientRect).toBeDefined();
  });
});