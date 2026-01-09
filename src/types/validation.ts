/**
 * Validation utilities for AI Focus Lens extension
 * Requirements: Data validation and type safety
 */

import { 
  ExtensionConfig, 
  StoredConfig, 
  ElementAnalysisData, 
  FocusableElement,
  LLMRequest,
  LLMResponse,
  ValidationResult,
  HSLColor
} from './index';

/**
 * Configuration validation
 */
export class ConfigValidator {
  static validateExtensionConfig(config: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return { isValid: false, errors, warnings };
    }

    const cfg = config as Partial<ExtensionConfig>;

    // API Key validation
    if (!cfg.apiKey || typeof cfg.apiKey !== 'string') {
      errors.push('API key is required and must be a string');
    } else if (cfg.apiKey.length < 10) {
      warnings.push('API key seems too short, please verify');
    }

    // Base URL validation
    if (!cfg.baseUrl || typeof cfg.baseUrl !== 'string') {
      errors.push('Base URL is required and must be a string');
    } else {
      try {
        new URL(cfg.baseUrl);
      } catch {
        errors.push('Base URL must be a valid URL');
      }
    }

    // Model validation
    if (!cfg.model || typeof cfg.model !== 'string') {
      errors.push('Model is required and must be a string');
    }

    // Batch size validation
    if (cfg.batchSize !== undefined) {
      if (typeof cfg.batchSize !== 'number' || cfg.batchSize < 1 || cfg.batchSize > 50) {
        errors.push('Batch size must be a number between 1 and 50');
      }
    }

    // Timeout validation
    if (cfg.timeout !== undefined) {
      if (typeof cfg.timeout !== 'number' || cfg.timeout < 1000 || cfg.timeout > 300000) {
        errors.push('Timeout must be a number between 1000 and 300000 milliseconds');
      }
    }

    // Max retries validation
    if (cfg.maxRetries !== undefined) {
      if (typeof cfg.maxRetries !== 'number' || cfg.maxRetries < 0 || cfg.maxRetries > 10) {
        errors.push('Max retries must be a number between 0 and 10');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  static validateStoredConfig(config: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('Stored configuration must be an object');
      return { isValid: false, errors, warnings };
    }

    const cfg = config as Partial<StoredConfig>;

    // Version validation
    if (!cfg.version || typeof cfg.version !== 'string') {
      errors.push('Version is required and must be a string');
    }

    // Preferences validation
    if (!cfg.preferences || typeof cfg.preferences !== 'object') {
      errors.push('Preferences are required and must be an object');
    } else {
      const prefs = cfg.preferences;
      
      if (prefs.logLevel && !['error', 'warn', 'info', 'debug'].includes(prefs.logLevel)) {
        errors.push('Log level must be one of: error, warn, info, debug');
      }

      if (prefs.highlightColor && typeof prefs.highlightColor === 'string') {
        if (!/^#[0-9A-F]{6}$/i.test(prefs.highlightColor)) {
          warnings.push('Highlight color should be a valid hex color');
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Element data validation
 */
export class ElementValidator {
  static validateFocusableElement(element: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!element || typeof element !== 'object') {
      errors.push('Element must be an object');
      return { isValid: false, errors, warnings };
    }

    const el = element as Partial<FocusableElement>;

    // Required fields
    if (!el.selector || typeof el.selector !== 'string') {
      errors.push('Element selector is required and must be a string');
    }

    if (!el.tagName || typeof el.tagName !== 'string') {
      errors.push('Element tagName is required and must be a string');
    }

    if (el.tabIndex === undefined || typeof el.tabIndex !== 'number') {
      errors.push('Element tabIndex is required and must be a number');
    }

    if (!el.computedStyle || typeof el.computedStyle !== 'object') {
      errors.push('Element computedStyle is required and must be an object');
    }

    if (!el.boundingRect || typeof el.boundingRect !== 'object') {
      errors.push('Element boundingRect is required and must be an object');
    }

    // Validate bounding rect
    if (el.boundingRect) {
      const rect = el.boundingRect as any;
      const requiredRectProps = ['top', 'left', 'bottom', 'right', 'width', 'height'];
      for (const prop of requiredRectProps) {
        if (typeof rect[prop] !== 'number') {
          errors.push(`BoundingRect.${prop} must be a number`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  static validateElementAnalysisData(data: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Analysis data must be an object');
      return { isValid: false, errors, warnings };
    }

    const analysisData = data as Partial<ElementAnalysisData>;

    // Required fields
    if (!Array.isArray(analysisData.elements)) {
      errors.push('Elements must be an array');
    } else {
      // Validate each element
      for (let i = 0; i < analysisData.elements.length; i++) {
        const elementValidation = this.validateFocusableElement(analysisData.elements[i]);
        if (!elementValidation.isValid) {
          errors.push(`Element ${i}: ${elementValidation.errors.join(', ')}`);
        }
      }

      if (analysisData.elements.length === 0) {
        warnings.push('No elements found for analysis');
      } else if (analysisData.elements.length > 100) {
        warnings.push('Large number of elements may impact performance');
      }
    }

    if (!analysisData.pageUrl || typeof analysisData.pageUrl !== 'string') {
      errors.push('Page URL is required and must be a string');
    } else {
      try {
        new URL(analysisData.pageUrl);
      } catch {
        errors.push('Page URL must be a valid URL');
      }
    }

    if (!analysisData.timestamp || typeof analysisData.timestamp !== 'number') {
      errors.push('Timestamp is required and must be a number');
    }

    if (!analysisData.viewport || typeof analysisData.viewport !== 'object') {
      errors.push('Viewport is required and must be an object');
    } else {
      const viewport = analysisData.viewport;
      if (typeof viewport.width !== 'number' || typeof viewport.height !== 'number') {
        errors.push('Viewport width and height must be numbers');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * API validation
 */
export class APIValidator {
  static validateLLMRequest(request: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!request || typeof request !== 'object') {
      errors.push('LLM request must be an object');
      return { isValid: false, errors, warnings };
    }

    const req = request as Partial<LLMRequest>;

    // Required fields
    if (!req.model || typeof req.model !== 'string') {
      errors.push('Model is required and must be a string');
    }

    if (!Array.isArray(req.messages)) {
      errors.push('Messages must be an array');
    } else {
      for (let i = 0; i < req.messages.length; i++) {
        const msg = req.messages[i];
        if (!msg || typeof msg !== 'object') {
          errors.push(`Message ${i} must be an object`);
          continue;
        }

        if (!['system', 'user', 'assistant'].includes(msg.role)) {
          errors.push(`Message ${i} role must be system, user, or assistant`);
        }

        if (!msg.content || typeof msg.content !== 'string') {
          errors.push(`Message ${i} content is required and must be a string`);
        }
      }
    }

    // Optional fields validation
    if (req.temperature !== undefined) {
      if (typeof req.temperature !== 'number' || req.temperature < 0 || req.temperature > 2) {
        errors.push('Temperature must be a number between 0 and 2');
      }
    }

    if (req.max_tokens !== undefined) {
      if (typeof req.max_tokens !== 'number' || req.max_tokens < 1 || req.max_tokens > 4096) {
        errors.push('Max tokens must be a number between 1 and 4096');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  static validateLLMResponse(response: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!response || typeof response !== 'object') {
      errors.push('LLM response must be an object');
      return { isValid: false, errors, warnings };
    }

    const res = response as Partial<LLMResponse>;

    // Required fields
    if (!Array.isArray(res.choices)) {
      errors.push('Choices must be an array');
    } else {
      if (res.choices.length === 0) {
        errors.push('Response must contain at least one choice');
      }

      for (let i = 0; i < res.choices.length; i++) {
        const choice = res.choices[i];
        if (!choice || typeof choice !== 'object') {
          errors.push(`Choice ${i} must be an object`);
          continue;
        }

        if (!choice.message || typeof choice.message !== 'object') {
          errors.push(`Choice ${i} message must be an object`);
          continue;
        }

        if (!choice.message.content || typeof choice.message.content !== 'string') {
          errors.push(`Choice ${i} message content is required and must be a string`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Color validation utilities
 */
export class ColorValidator {
  static validateHSLColor(color: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!color || typeof color !== 'object') {
      errors.push('HSL color must be an object');
      return { isValid: false, errors, warnings };
    }

    const hsl = color as Partial<HSLColor>;

    if (typeof hsl.hue !== 'number' || hsl.hue < 0 || hsl.hue > 360) {
      errors.push('Hue must be a number between 0 and 360');
    }

    if (typeof hsl.saturation !== 'number' || hsl.saturation < 0 || hsl.saturation > 100) {
      errors.push('Saturation must be a number between 0 and 100');
    }

    if (typeof hsl.lightness !== 'number' || hsl.lightness < 0 || hsl.lightness > 100) {
      errors.push('Lightness must be a number between 0 and 100');
    }

    if (hsl.alpha !== undefined) {
      if (typeof hsl.alpha !== 'number' || hsl.alpha < 0 || hsl.alpha > 1) {
        errors.push('Alpha must be a number between 0 and 1');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  static validateCSSColor(colorValue: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!colorValue || typeof colorValue !== 'string') {
      errors.push('Color value must be a string');
      return { isValid: false, errors, warnings };
    }

    // Check for common CSS color formats
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const rgbaPattern = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;
    const hslPattern = /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/;
    const hslaPattern = /^hsla\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*,\s*[\d.]+\s*\)$/;

    const namedColors = [
      'transparent', 'black', 'white', 'red', 'green', 'blue', 'yellow', 
      'cyan', 'magenta', 'gray', 'grey', 'orange', 'purple', 'brown', 'pink'
    ];

    const isValid = 
      hexPattern.test(colorValue) ||
      rgbPattern.test(colorValue) ||
      rgbaPattern.test(colorValue) ||
      hslPattern.test(colorValue) ||
      hslaPattern.test(colorValue) ||
      namedColors.includes(colorValue.toLowerCase());

    if (!isValid) {
      errors.push('Invalid CSS color format');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * General utility validators
 */
export class GeneralValidator {
  static validateURL(url: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const urlObj = new URL(url);
      
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        warnings.push('URL should use HTTP or HTTPS protocol');
      }
      
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        warnings.push('Using localhost URL');
      }
    } catch {
      errors.push('Invalid URL format');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  static validateSelector(selector: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!selector || typeof selector !== 'string') {
      errors.push('Selector must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    try {
      // Test if selector is valid by trying to use it
      document.querySelector(selector);
    } catch {
      errors.push('Invalid CSS selector');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  static validateTimestamp(timestamp: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      errors.push('Timestamp must be a valid number');
      return { isValid: false, errors, warnings };
    }

    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    const oneYearFromNow = now + (365 * 24 * 60 * 60 * 1000);

    if (timestamp < oneYearAgo) {
      warnings.push('Timestamp is more than a year old');
    } else if (timestamp > oneYearFromNow) {
      warnings.push('Timestamp is more than a year in the future');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}