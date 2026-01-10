import { ACTRulePromptBuilder } from '../src/prompts/act-rule-oj04fd';
import { FocusableElement } from '../src/types';

describe('W3C Example 4 Verification', () => {
  const mockElement: FocusableElement = {
    selector: 'a#act',
    tagName: 'a',
    tabIndex: 0,
    computedStyle: {
      outline: 'none',
      outlineColor: 'transparent',
      outlineWidth: '0px',
      outlineStyle: 'none',
      outlineOffset: '0px',
      boxShadow: 'none',
      border: 'none',
      borderColor: 'transparent',
      borderWidth: '0px',
      borderStyle: 'none',
      borderRadius: '0px',
      backgroundColor: 'transparent',
      color: 'black',
      opacity: '1',
      visibility: 'visible',
      display: 'inline',
      position: 'static',
      zIndex: 'auto'
    },
    boundingRect: {
      x: 0, y: 0, width: 100, height: 20,
      top: 0, right: 100, bottom: 20, left: 0,
      toJSON: () => ({})
    },
    isSequentialFocusElement: true,
    isInViewport: true
  };

  test('Should include external indicators in user prompt', () => {
    const externalIndicators = "Sibling element <span id='indicator-act'> changed background-color from transparent to blue";
    
    const prompt = ACTRulePromptBuilder.buildUserPrompt(mockElement, undefined, externalIndicators);
    
    expect(prompt).toContain('External Focus Indicators');
    expect(prompt).toContain(externalIndicators);
    console.log('Generated Prompt Snippet:', prompt.substring(prompt.indexOf('## External Focus Indicators')));
  });

  test('Should include external indicators in batch prompt', () => {
    const externalIndicatorsMap = {
      'a#act': "Sibling element <span id='indicator-act'> changed background-color"
    };
    
    const prompt = ACTRulePromptBuilder.buildBatchPrompt([mockElement], undefined, externalIndicatorsMap);
    
    expect(prompt).toContain('External Indicators');
    expect(prompt).toContain("Sibling element <span id='indicator-act'> changed background-color");
  });
});
