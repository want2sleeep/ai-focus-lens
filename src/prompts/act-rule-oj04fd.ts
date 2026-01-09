// ACT Rule oj04fd Prompt Builder for Focus Visibility Testing
// Requirements: 需求 2.1 - 根据 W3C ACT 规则构建 System Prompt，实现元素数据到 Prompt 的转换逻辑

import { 
  FocusableElement, 
  ElementAnalysisData, 
  ACTRuleOJ04FD,
  HSLColor,
  ComputedStyleData
} from '../types';

/**
 * ACT Rule oj04fd System Prompt Builder
 * Constructs prompts based on W3C ACT Rule oj04fd for focus visibility testing
 */
export class ACTRulePromptBuilder {
  private static readonly RULE_ID = 'oj04fd';
  private static readonly RULE_NAME = 'Focus visible';
  private static readonly RULE_DESCRIPTION = 'Each element in sequential focus order has some visible focus indicator';
  private static readonly COLOR_DIFFERENCE_THRESHOLD = 3; // Minimum perceptible difference in HSL

  /**
   * Build the complete system prompt for ACT Rule oj04fd
   * Requirements: 需求 2.1 - 构建符合 ACT 规则 oj04fd 的 System Prompt
   */
  static buildSystemPrompt(): string {
    return `You are an accessibility expert specializing in WCAG 2.4.7 Focus Visible compliance testing.

## ACT Rule: ${this.RULE_ID} - ${this.RULE_NAME}

### Rule Description
${this.RULE_DESCRIPTION}

### Applicability
This rule applies to HTML elements that are part of sequential focus navigation and are included in the accessibility tree.

An element is part of sequential focus navigation when:
- It has a tabindex value that is not null
- It is an inherently focusable element (a, button, input, select, textarea, etc.)
- It is not disabled or hidden

### Expectation
For each test target, when the element receives focus, at least one device pixel in the viewport has a different HSL color value than when the element is not focused.

The color difference must be perceptible (minimum threshold: ${this.COLOR_DIFFERENCE_THRESHOLD} units in HSL space).

### Focus Indicators to Check
1. **Outline**: Changes in outline color, width, or style
2. **Border**: Changes in border color, width, or style  
3. **Box Shadow**: Addition or changes in box shadow
4. **Background**: Changes in background color
5. **Text Color**: Changes in text color
6. **Other Visual Changes**: Any other visual modifications that indicate focus

### Analysis Process
1. Compare the focused and unfocused styles of the element
2. Calculate HSL color differences for all visual properties
3. Determine if any difference meets the minimum threshold
4. Consider the visibility and prominence of the focus indicator
5. Evaluate if the indicator is sufficient for users to identify the focused element

### Response Format
You must respond with a JSON object containing:
{
  "status": "PASS" | "FAIL" | "INAPPLICABLE" | "CANTELL",
  "reason": "Detailed explanation of the analysis",
  "suggestion": "Specific recommendations for improvement if needed",
  "confidence": 0.0-1.0,
  "actRuleCompliance": {
    "ruleId": "oj04fd",
    "outcome": "passed" | "failed" | "inapplicable" | "cantell",
    "details": "Technical details of the compliance check"
  },
  "colorAnalysis": {
    "focusedHSL": {"hue": 0, "saturation": 0, "lightness": 0},
    "unfocusedHSL": {"hue": 0, "saturation": 0, "lightness": 0},
    "colorDifference": 0.0,
    "meetsThreshold": true|false
  }
}

### Status Definitions
- **PASS**: Element has a visible focus indicator that meets the threshold
- **FAIL**: Element lacks a visible focus indicator or indicator is insufficient
- **INAPPLICABLE**: Element is not part of sequential focus navigation
- **CANTELL**: Unable to determine due to insufficient data or edge cases

Be thorough in your analysis and provide actionable suggestions for failed elements.`;
  }

  /**
   * Build user prompt with element data
   * Requirements: 需求 2.1 - 实现元素数据到 Prompt 的转换逻辑
   */
  static buildUserPrompt(element: FocusableElement, pageContext?: ElementAnalysisData): string {
    const elementInfo = this.formatElementInfo(element);
    const styleComparison = this.formatStyleComparison(element);
    const contextInfo = pageContext ? this.formatPageContext(pageContext) : '';

    return `Please analyze the following element for WCAG 2.4.7 Focus Visible compliance according to ACT Rule oj04fd:

## Element Information
${elementInfo}

## Style Comparison
${styleComparison}

${contextInfo}

## Analysis Request
Analyze whether this element has a visible focus indicator that meets the ACT Rule oj04fd requirements. Consider:

1. **Color Differences**: Calculate HSL differences between focused and unfocused states
2. **Visual Prominence**: Assess if the focus indicator is sufficiently visible
3. **User Experience**: Consider if users can easily identify when this element has focus
4. **Accessibility Standards**: Ensure compliance with WCAG 2.4.7 guidelines

Provide your analysis in the specified JSON format with detailed reasoning and actionable suggestions.`;
  }

  /**
   * Build batch prompt for multiple elements
   */
  static buildBatchPrompt(elements: FocusableElement[], pageContext?: ElementAnalysisData): string {
    const contextInfo = pageContext ? this.formatPageContext(pageContext) : '';
    const elementsInfo = elements.map((element, index) => 
      `### Element ${index + 1}
${this.formatElementInfo(element)}

${this.formatStyleComparison(element)}`
    ).join('\n\n');

    return `Please analyze the following ${elements.length} elements for WCAG 2.4.7 Focus Visible compliance according to ACT Rule oj04fd:

${contextInfo}

## Elements to Analyze
${elementsInfo}

## Analysis Request
For each element, analyze whether it has a visible focus indicator that meets the ACT Rule oj04fd requirements.

Respond with a JSON array containing analysis results for each element in order:
[
  {
    "elementIndex": 0,
    "status": "PASS" | "FAIL" | "INAPPLICABLE" | "CANTELL",
    "reason": "Detailed explanation",
    "suggestion": "Specific recommendations",
    "confidence": 0.0-1.0,
    "actRuleCompliance": {
      "ruleId": "oj04fd",
      "outcome": "passed" | "failed" | "inapplicable" | "cantell",
      "details": "Technical details"
    },
    "colorAnalysis": {
      "focusedHSL": {"hue": 0, "saturation": 0, "lightness": 0},
      "unfocusedHSL": {"hue": 0, "saturation": 0, "lightness": 0},
      "colorDifference": 0.0,
      "meetsThreshold": true|false
    }
  }
]`;
  }

  /**
   * Format element information for prompt
   */
  private static formatElementInfo(element: FocusableElement): string {
    return `**Element**: ${element.tagName.toLowerCase()}
**Selector**: ${element.selector}
**Tab Index**: ${element.tabIndex}
**Sequential Focus Element**: ${element.isSequentialFocusElement ? 'Yes' : 'No'}
**In Viewport**: ${element.isInViewport ? 'Yes' : 'No'}
**Element ID**: ${element.elementId || 'None'}
**CSS Classes**: ${element.className || 'None'}
**ARIA Label**: ${element.ariaLabel || 'None'}
**Bounding Rectangle**: ${JSON.stringify({
      x: Math.round(element.boundingRect.x),
      y: Math.round(element.boundingRect.y),
      width: Math.round(element.boundingRect.width),
      height: Math.round(element.boundingRect.height)
    })}`;
  }

  /**
   * Format style comparison between focused and unfocused states
   */
  private static formatStyleComparison(element: FocusableElement): string {
    const unfocused = element.unfocusedStyle || element.computedStyle;
    const focused = element.focusedStyle || element.computedStyle;

    const comparison = `**Unfocused State**:
- Outline: ${unfocused.outline}
- Outline Color: ${unfocused.outlineColor}
- Outline Width: ${unfocused.outlineWidth}
- Outline Style: ${unfocused.outlineStyle}
- Outline Offset: ${unfocused.outlineOffset}
- Box Shadow: ${unfocused.boxShadow}
- Border: ${unfocused.border}
- Border Color: ${unfocused.borderColor}
- Border Width: ${unfocused.borderWidth}
- Border Style: ${unfocused.borderStyle}
- Background Color: ${unfocused.backgroundColor}
- Text Color: ${unfocused.color}
- Opacity: ${unfocused.opacity}
- Visibility: ${unfocused.visibility}

**Focused State**:
- Outline: ${focused.outline}
- Outline Color: ${focused.outlineColor}
- Outline Width: ${focused.outlineWidth}
- Outline Style: ${focused.outlineStyle}
- Outline Offset: ${focused.outlineOffset}
- Box Shadow: ${focused.boxShadow}
- Border: ${focused.border}
- Border Color: ${focused.borderColor}
- Border Width: ${focused.borderWidth}
- Border Style: ${focused.borderStyle}
- Background Color: ${focused.backgroundColor}
- Text Color: ${focused.color}
- Opacity: ${focused.opacity}
- Visibility: ${focused.visibility}`;

    // Add HSL analysis if available
    if (unfocused.hslValues && focused.hslValues) {
      const hslComparison = this.formatHSLComparison(unfocused.hslValues, focused.hslValues);
      return `${comparison}\n\n**HSL Color Analysis**:\n${hslComparison}`;
    }

    return comparison;
  }

  /**
   * Format HSL color comparison
   */
  private static formatHSLComparison(
    unfocusedHSL: ComputedStyleData['hslValues'], 
    focusedHSL: ComputedStyleData['hslValues']
  ): string {
    if (!unfocusedHSL || !focusedHSL) return 'HSL data not available';

    const formatHSL = (hsl: HSLColor) => `H:${hsl.hue}° S:${hsl.saturation}% L:${hsl.lightness}%`;
    
    const outlineDiff = this.calculateHSLDifference(unfocusedHSL.outline, focusedHSL.outline);
    const borderDiff = this.calculateHSLDifference(unfocusedHSL.border, focusedHSL.border);
    const backgroundDiff = this.calculateHSLDifference(unfocusedHSL.background, focusedHSL.background);
    const boxShadowDiff = this.calculateHSLDifference(unfocusedHSL.boxShadow, focusedHSL.boxShadow);

    return `**Outline Colors**:
- Unfocused: ${formatHSL(unfocusedHSL.outline)}
- Focused: ${formatHSL(focusedHSL.outline)}
- Difference: ${outlineDiff.toFixed(2)} (Threshold: ${this.COLOR_DIFFERENCE_THRESHOLD})

**Border Colors**:
- Unfocused: ${formatHSL(unfocusedHSL.border)}
- Focused: ${formatHSL(focusedHSL.border)}
- Difference: ${borderDiff.toFixed(2)} (Threshold: ${this.COLOR_DIFFERENCE_THRESHOLD})

**Background Colors**:
- Unfocused: ${formatHSL(unfocusedHSL.background)}
- Focused: ${formatHSL(focusedHSL.background)}
- Difference: ${backgroundDiff.toFixed(2)} (Threshold: ${this.COLOR_DIFFERENCE_THRESHOLD})

**Box Shadow Colors**:
- Unfocused: ${formatHSL(unfocusedHSL.boxShadow)}
- Focused: ${formatHSL(focusedHSL.boxShadow)}
- Difference: ${boxShadowDiff.toFixed(2)} (Threshold: ${this.COLOR_DIFFERENCE_THRESHOLD})`;
  }

  /**
   * Format page context information
   */
  private static formatPageContext(pageContext: ElementAnalysisData): string {
    return `## Page Context
**URL**: ${pageContext.pageUrl}
**Title**: ${pageContext.pageMetadata.title}
**Domain**: ${pageContext.pageMetadata.domain}
**Viewport**: ${pageContext.viewport.width}x${pageContext.viewport.height}
**Total Elements**: ${pageContext.elements.length}
**Scan Settings**: 
- Include Hidden Elements: ${pageContext.scanSettings.includeHiddenElements}
- Minimum Contrast Ratio: ${pageContext.scanSettings.minimumContrastRatio}
- Focus Indicator Threshold: ${pageContext.scanSettings.focusIndicatorThreshold}

`;
  }

  /**
   * Calculate HSL color difference using Delta E approximation
   */
  private static calculateHSLDifference(color1: HSLColor, color2: HSLColor): number {
    // Simple HSL distance calculation
    // More sophisticated color difference algorithms could be implemented here
    const hueDiff = Math.min(
      Math.abs(color1.hue - color2.hue),
      360 - Math.abs(color1.hue - color2.hue)
    );
    const satDiff = Math.abs(color1.saturation - color2.saturation);
    const lightDiff = Math.abs(color1.lightness - color2.lightness);

    // Weighted difference calculation
    return Math.sqrt(
      Math.pow(hueDiff * 0.5, 2) + 
      Math.pow(satDiff * 0.3, 2) + 
      Math.pow(lightDiff * 0.2, 2)
    );
  }

  /**
   * Validate element applicability for ACT Rule oj04fd
   */
  static validateElementApplicability(element: FocusableElement): {
    applicable: boolean;
    reason: string;
  } {
    // Check if element is part of sequential focus navigation
    if (!element.isSequentialFocusElement) {
      return {
        applicable: false,
        reason: 'Element is not part of sequential focus navigation'
      };
    }

    // Check if element is in viewport
    if (!element.isInViewport) {
      return {
        applicable: false,
        reason: 'Element is not in the viewport'
      };
    }

    // Check if element is visible
    const style = element.computedStyle;
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
      return {
        applicable: false,
        reason: 'Element is not visible'
      };
    }

    // Check if element has valid dimensions
    if (element.boundingRect.width <= 0 || element.boundingRect.height <= 0) {
      return {
        applicable: false,
        reason: 'Element has no visible dimensions'
      };
    }

    return {
      applicable: true,
      reason: 'Element meets all applicability criteria for ACT Rule oj04fd'
    };
  }

  /**
   * Generate ACT Rule metadata for documentation
   */
  static getACTRuleMetadata(): ACTRuleOJ04FD {
    return {
      ruleId: 'oj04fd',
      ruleName: this.RULE_NAME,
      ruleDescription: this.RULE_DESCRIPTION,
      applicability: {
        isSequentialFocusElement: true,
        isInViewport: true,
        isVisible: true,
        hasValidTabIndex: true,
        isInteractiveElement: true
      },
      expectation: {
        hasVisibleFocusIndicator: true,
        colorDifference: {
          focusedHSL: { hue: 0, saturation: 0, lightness: 0 },
          unfocusedHSL: { hue: 0, saturation: 0, lightness: 0 },
          threshold: this.COLOR_DIFFERENCE_THRESHOLD,
          actualDifference: 0
        },
        focusIndicatorProperties: {
          hasOutline: false,
          hasBoxShadow: false,
          hasBorderChange: false,
          hasBackgroundChange: false,
          hasColorChange: false
        }
      },
      testResult: {
        outcome: 'cantell',
        details: 'Test not yet performed',
        evidence: {
          styleComparison: {
            outline: '',
            outlineColor: '',
            outlineWidth: '',
            outlineStyle: '',
            outlineOffset: '',
            boxShadow: '',
            border: '',
            borderColor: '',
            borderWidth: '',
            borderStyle: '',
            borderRadius: '',
            backgroundColor: '',
            color: '',
            opacity: '',
            visibility: '',
            display: '',
            position: '',
            zIndex: ''
          }
        }
      }
    };
  }
}

/**
 * Utility functions for prompt building
 */

/**
 * Create a focused analysis prompt for a single element
 */
export function createSingleElementPrompt(element: FocusableElement, pageContext?: ElementAnalysisData): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: ACTRulePromptBuilder.buildSystemPrompt(),
    userPrompt: ACTRulePromptBuilder.buildUserPrompt(element, pageContext)
  };
}

/**
 * Create a batch analysis prompt for multiple elements
 */
export function createBatchPrompt(elements: FocusableElement[], pageContext?: ElementAnalysisData): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: ACTRulePromptBuilder.buildSystemPrompt(),
    userPrompt: ACTRulePromptBuilder.buildBatchPrompt(elements, pageContext)
  };
}

/**
 * Validate if an element is applicable for ACT Rule oj04fd testing
 */
export function isElementApplicable(element: FocusableElement): boolean {
  return ACTRulePromptBuilder.validateElementApplicability(element).applicable;
}

/**
 * Get detailed applicability information for an element
 */
export function getApplicabilityInfo(element: FocusableElement): {
  applicable: boolean;
  reason: string;
} {
  return ACTRulePromptBuilder.validateElementApplicability(element);
}