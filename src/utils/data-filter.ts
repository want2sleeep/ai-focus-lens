// Data Filter and Privacy Protection for AI Focus Lens extension
// Requirements: 需求 7.2, 7.3 - 过滤敏感信息和用户输入，确保只发送必要的样式信息

import { 
  FocusableElement, 
  ElementAnalysisData, 
  ComputedStyleData,
  ExtensionConfig 
} from '../types';

/**
 * Sensitive data patterns to filter out
 */
const SENSITIVE_PATTERNS = [
  // Email patterns
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Phone numbers (various formats)
  /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  // Credit card numbers (basic pattern)
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  // Social Security Numbers
  /\b\d{3}-?\d{2}-?\d{4}\b/g,
  // URLs with query parameters (may contain sensitive data)
  /https?:\/\/[^\s]+\?[^\s]+/g,
  // API keys (common patterns)
  /\b[A-Za-z0-9]{32,}\b/g,
  // Tokens and secrets
  /\b(token|secret|key|password|pwd)\s*[:=]\s*[^\s]+/gi
];

/**
 * Attributes that may contain sensitive user input
 */
const SENSITIVE_ATTRIBUTES = [
  'value',
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'aria-describedby',
  'data-*'
];

/**
 * CSS properties that are essential for focus visibility analysis
 * Requirements: 需求 7.2 - 确保只发送必要的样式信息
 */
const ESSENTIAL_STYLE_PROPERTIES = [
  'outline',
  'outlineColor',
  'outlineWidth',
  'outlineStyle',
  'outlineOffset',
  'boxShadow',
  'border',
  'borderColor',
  'borderWidth',
  'borderStyle',
  'borderRadius',
  'backgroundColor',
  'color',
  'opacity',
  'visibility',
  'display',
  'position',
  'zIndex'
] as const;

/**
 * Data filtering configuration
 */
export interface DataFilterConfig {
  filterSensitiveText: boolean;
  filterUserInput: boolean;
  filterNonEssentialStyles: boolean;
  filterDOMContent: boolean;
  anonymizeSelectors: boolean;
  maxTextLength: number;
  allowedDomains: string[];
}

/**
 * Default data filtering configuration
 */
export const DEFAULT_FILTER_CONFIG: DataFilterConfig = {
  filterSensitiveText: true,
  filterUserInput: true,
  filterNonEssentialStyles: true,
  filterDOMContent: true,
  anonymizeSelectors: false,
  maxTextLength: 100,
  allowedDomains: []
};

/**
 * Data filter and privacy protection utility
 * Requirements: 需求 7.2, 7.3 - 过滤敏感信息和用户输入
 */
export class DataFilter {
  private config: DataFilterConfig;

  constructor(config: Partial<DataFilterConfig> = {}) {
    this.config = { ...DEFAULT_FILTER_CONFIG, ...config };
  }

  /**
   * Filter element analysis data for privacy protection
   * Requirements: 需求 7.2, 7.3 - 过滤敏感信息和用户输入
   */
  filterElementAnalysisData(data: ElementAnalysisData): ElementAnalysisData {
    const filteredData: ElementAnalysisData = {
      ...data,
      elements: data.elements.map(element => this.filterFocusableElement(element)),
      pageUrl: this.filterUrl(data.pageUrl),
      pageMetadata: {
        ...data.pageMetadata,
        title: this.filterSensitiveText(data.pageMetadata.title || ''),
        domain: this.extractDomain(data.pageUrl)
      }
    };

    return filteredData;
  }

  /**
   * Filter a single focusable element
   */
  private filterFocusableElement(element: FocusableElement): FocusableElement {
    // Create base filtered element
    const filtered: FocusableElement = {
      selector: this.config.anonymizeSelectors ? this.anonymizeSelector(element.selector) : element.selector,
      tagName: element.tagName,
      tabIndex: element.tabIndex,
      computedStyle: this.filterComputedStyle(element.computedStyle),
      boundingRect: element.boundingRect,
      isSequentialFocusElement: element.isSequentialFocusElement,
      isInViewport: element.isInViewport
    };

    // Handle optional properties
    if (element.focusedStyle) {
      filtered.focusedStyle = this.filterComputedStyle(element.focusedStyle);
    }
    
    if (element.unfocusedStyle) {
      filtered.unfocusedStyle = this.filterComputedStyle(element.unfocusedStyle);
    }
    
    if (element.elementId) {
      filtered.elementId = this.config.filterUserInput ? 
        this.filterSensitiveText(element.elementId) : element.elementId;
    }
    
    if (element.className) {
      filtered.className = this.config.filterUserInput ? 
        this.filterSensitiveText(element.className) : element.className;
    }
    
    if (element.ariaLabel) {
      filtered.ariaLabel = this.config.filterUserInput ? 
        this.filterSensitiveText(element.ariaLabel) : element.ariaLabel;
    }

    if (element.externalIndicators) {
      filtered.externalIndicators = element.externalIndicators.map(indicator => 
        this.config.filterSensitiveText ? this.filterSensitiveText(indicator) : indicator
      );
    }

    return filtered;
  }

  /**
   * Filter computed style data to include only essential properties
   * Requirements: 需求 7.2 - 确保只发送必要的样式信息
   */
  private filterComputedStyle(style: ComputedStyleData): ComputedStyleData {
    if (!this.config.filterNonEssentialStyles) {
      return style;
    }

    // Create filtered style object with only essential properties
    const filteredStyle: Partial<ComputedStyleData> = {};
    
    ESSENTIAL_STYLE_PROPERTIES.forEach(prop => {
      if (prop in style) {
        filteredStyle[prop] = style[prop];
      }
    });

    // Always include HSL values if present (essential for ACT rule analysis)
    if (style.hslValues) {
      filteredStyle.hslValues = style.hslValues;
    }

    return filteredStyle as ComputedStyleData;
  }

  /**
   * Filter sensitive text content
   * Requirements: 需求 7.3 - 过滤掉用户输入和个人信息
   */
  private filterSensitiveText(text: string): string {
    if (!this.config.filterSensitiveText || !text) {
      return text;
    }

    let filteredText = text;

    // Apply sensitive pattern filters
    SENSITIVE_PATTERNS.forEach(pattern => {
      filteredText = filteredText.replace(pattern, '[FILTERED]');
    });

    // Truncate long text to prevent data leakage
    if (filteredText.length > this.config.maxTextLength) {
      filteredText = filteredText.substring(0, this.config.maxTextLength) + '...';
    }

    return filteredText;
  }

  /**
   * Filter URL to remove query parameters and fragments
   */
  private filterUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Check if domain is in allowed list
      if (this.config.allowedDomains.length > 0) {
        const isAllowed = this.config.allowedDomains.some(domain => 
          urlObj.hostname.endsWith(domain)
        );
        if (!isAllowed) {
          return '[FILTERED_DOMAIN]';
        }
      }

      // Return URL without query parameters and fragments
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      console.warn('Failed to parse URL for filtering:', error);
      return '[INVALID_URL]';
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      console.warn('Failed to extract domain:', error);
      return 'unknown';
    }
  }

  /**
   * Anonymize CSS selector to remove potentially identifying information
   */
  private anonymizeSelector(selector: string): string {
    // Replace IDs and classes with generic placeholders
    let anonymized = selector
      .replace(/#[a-zA-Z0-9_-]+/g, '#[ID]')
      .replace(/\.[a-zA-Z0-9_-]+/g, '.[CLASS]')
      .replace(/\[data-[^=\]]+[=][^]]*\]/g, '[data-attr]')
      .replace(/\[id[=][^]]*\]/g, '[id]')
      .replace(/\[class[=][^]]*\]/g, '[class]');

    return anonymized;
  }

  /**
   * Check if element contains user input
   */
  private isUserInputElement(element: FocusableElement): boolean {
    const inputTags = ['input', 'textarea', 'select'];
    return inputTags.includes(element.tagName.toLowerCase()) ||
           element.selector.includes('[contenteditable]');
  }

  /**
   * Validate that filtered data is safe to send
   */
  validateFilteredData(data: ElementAnalysisData): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for remaining sensitive patterns
    const dataString = JSON.stringify(data);
    SENSITIVE_PATTERNS.forEach((pattern, index) => {
      if (pattern.test(dataString)) {
        issues.push(`Sensitive pattern ${index + 1} detected in filtered data`);
      }
    });

    // Check data size
    const dataSize = new Blob([dataString]).size;
    if (dataSize > 1024 * 1024) { // 1MB limit
      issues.push(`Data size too large: ${dataSize} bytes`);
    }

    // Check element count
    if (data.elements.length > 100) {
      issues.push(`Too many elements: ${data.elements.length}`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Update filter configuration
   */
  updateConfig(newConfig: Partial<DataFilterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current filter configuration
   */
  getConfig(): DataFilterConfig {
    return { ...this.config };
  }

  /**
   * Get filtering statistics for the last operation
   */
  getFilteringStats(originalData: ElementAnalysisData, filteredData: ElementAnalysisData): {
    originalSize: number;
    filteredSize: number;
    compressionRatio: number;
    elementsFiltered: number;
    sensitiveDataRemoved: boolean;
  } {
    const originalSize = new Blob([JSON.stringify(originalData)]).size;
    const filteredSize = new Blob([JSON.stringify(filteredData)]).size;
    
    return {
      originalSize,
      filteredSize,
      compressionRatio: filteredSize / originalSize,
      elementsFiltered: originalData.elements.length - filteredData.elements.length,
      sensitiveDataRemoved: originalSize > filteredSize
    };
  }
}

/**
 * Factory function to create data filter instance
 */
export function createDataFilter(config?: Partial<DataFilterConfig>): DataFilter {
  return new DataFilter(config);
}

/**
 * Utility functions for data filtering
 */
export const DataFilterUtils = {
  /**
   * Check if text contains sensitive information
   */
  containsSensitiveData(text: string): boolean {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(text));
  },

  /**
   * Get recommended filter configuration based on domain
   */
  getRecommendedConfig(domain: string): Partial<DataFilterConfig> {
    // More restrictive filtering for sensitive domains
    const sensitiveDomains = ['bank', 'medical', 'healthcare', 'finance', 'gov'];
    const isSensitiveDomain = sensitiveDomains.some(sensitive => 
      domain.toLowerCase().includes(sensitive)
    );

    if (isSensitiveDomain) {
      return {
        filterSensitiveText: true,
        filterUserInput: true,
        filterNonEssentialStyles: true,
        filterDOMContent: true,
        anonymizeSelectors: true,
        maxTextLength: 50
      };
    }

    return DEFAULT_FILTER_CONFIG;
  },

  /**
   * Sanitize element selector for safe transmission
   */
  sanitizeSelector(selector: string): string {
    // Remove potentially dangerous characters
    return selector
      .replace(/[<>'"]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .trim();
  },

  /**
   * Check if element is likely to contain sensitive data
   */
  isLikelySensitive(element: FocusableElement): boolean {
    const sensitiveTypes = ['password', 'email', 'tel', 'number', 'search'];
    const sensitiveNames = ['ssn', 'social', 'credit', 'card', 'cvv', 'pin'];
    
    const selector = element.selector.toLowerCase();
    const tagName = element.tagName.toLowerCase();
    
    // Check input types
    if (tagName === 'input') {
      const typeMatch = selector.match(/type=["']?([^"'\s]+)/);
      if (typeMatch && typeMatch[1] && sensitiveTypes.includes(typeMatch[1])) {
        return true;
      }
    }

    // Check names and IDs
    return sensitiveNames.some(name => selector.includes(name));
  }
};