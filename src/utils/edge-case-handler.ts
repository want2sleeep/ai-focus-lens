// Edge Case Handler for AI Focus Lens extension
// Requirements: 需求 5.1, 5.2, 5.3 - 处理边缘情况

import { 
  ExtensionError, 
  ErrorCode,
  ElementAnalysisData,
  FocusableElement,
  AnalysisResult,
  FocusVisibilityResult
} from '../types';

/**
 * Edge Case Handler for managing various edge cases and boundary conditions
 * Requirements: 需求 5.1, 5.2, 5.3 - 无可检测元素的情况，网络异常和 API 限制处理
 */
export class EdgeCaseHandler {
  private static instance: EdgeCaseHandler | null = null;

  private constructor() {}

  static getInstance(): EdgeCaseHandler {
    if (!EdgeCaseHandler.instance) {
      EdgeCaseHandler.instance = new EdgeCaseHandler();
    }
    return EdgeCaseHandler.instance;
  }

  /**
   * Handle case when no focusable elements are found
   * Requirements: 需求 5.3 - 页面没有可检测元素时，显示相应的提示信息
   */
  handleNoFocusableElements(pageUrl: string): {
    shouldProceed: boolean;
    message: string;
    suggestions: string[];
    mockResults?: AnalysisResult[];
  } {
    console.log('Handling no focusable elements case for:', pageUrl);

    // Check if this is a special page type that typically has no focusable elements
    const specialPageTypes = this.detectSpecialPageType(pageUrl);
    
    if (specialPageTypes.length > 0) {
      return {
        shouldProceed: false,
        message: `此页面类型（${specialPageTypes.join('、')}）通常不包含可聚焦的交互元素。`,
        suggestions: [
          '这是正常现象，无需担心',
          '如果页面应该包含交互元素，请检查页面是否完全加载',
          '尝试在包含表单或按钮的页面上使用此扩展'
        ]
      };
    }

    // For regular pages with no focusable elements
    return {
      shouldProceed: false,
      message: '在当前页面上未找到可聚焦的元素。',
      suggestions: [
        '确保页面已完全加载',
        '检查页面是否包含链接、按钮、输入框等交互元素',
        '尝试刷新页面后重新扫描',
        '在包含表单或导航的页面上使用此扩展',
        '某些单页应用可能需要等待内容动态加载'
      ]
    };
  }

  /**
   * Handle network-related edge cases
   * Requirements: 需求 5.1, 5.2 - API 密钥无效时和网络请求超时时的处理
   */
  handleNetworkEdgeCases(error: ExtensionError): {
    shouldRetry: boolean;
    retryDelay: number;
    userMessage: string;
    suggestions: string[];
    fallbackAction?: string;
  } {
    console.log('Handling network edge case:', error.code);

    switch (error.code) {
      case 'API_KEY_INVALID':
        return {
          shouldRetry: false,
          retryDelay: 0,
          userMessage: 'API 密钥无效或已过期。',
          suggestions: [
            '检查您的 OpenAI API 密钥是否正确输入',
            '确认 API 密钥具有必要的权限',
            '检查 API 密钥是否有足够的使用额度',
            '如果最近更换了密钥，请更新扩展设置',
            '联系 OpenAI 支持以验证账户状态'
          ],
          fallbackAction: 'open-settings'
        };

      case 'API_ENDPOINT_UNREACHABLE':
        return {
          shouldRetry: true,
          retryDelay: 5000,
          userMessage: '无法连接到 AI 服务端点。',
          suggestions: [
            '检查您的网络连接是否正常',
            '验证 API 端点 URL 是否正确',
            '检查防火墙或代理设置',
            '尝试使用不同的网络连接',
            '如果使用自定义端点，请联系服务提供商'
          ],
          fallbackAction: 'check-connection'
        };

      case 'API_RATE_LIMIT_EXCEEDED':
        return {
          shouldRetry: true,
          retryDelay: 60000, // 1 minute
          userMessage: 'API 调用频率超出限制。',
          suggestions: [
            '请等待一分钟后重试',
            '考虑减少批处理大小以降低调用频率',
            '升级您的 API 计划以获得更高的速率限制',
            '避免在短时间内进行多次扫描',
            '使用缓存功能减少重复的 API 调用'
          ],
          fallbackAction: 'enable-caching'
        };

      case 'NETWORK_ERROR':
        return {
          shouldRetry: true,
          retryDelay: 3000,
          userMessage: '网络连接出现问题。',
          suggestions: [
            '检查您的网络连接',
            '尝试刷新页面',
            '如果使用 VPN，请尝试断开连接',
            '检查浏览器的网络设置',
            '稍后重试'
          ],
          fallbackAction: 'retry-scan'
        };

      case 'TIMEOUT_ERROR':
        return {
          shouldRetry: true,
          retryDelay: 5000,
          userMessage: '请求超时，服务器响应缓慢。',
          suggestions: [
            '减少批处理大小以加快处理速度',
            '检查网络连接速度',
            '在网络条件较好时重试',
            '考虑增加超时设置',
            'AI 服务可能正在经历高负载'
          ],
          fallbackAction: 'reduce-batch-size'
        };

      default:
        return {
          shouldRetry: false,
          retryDelay: 0,
          userMessage: '发生了未知的网络错误。',
          suggestions: [
            '检查网络连接',
            '刷新页面后重试',
            '检查浏览器控制台获取更多信息',
            '如果问题持续存在，请联系支持'
          ]
        };
    }
  }

  /**
   * Handle API response edge cases
   * Requirements: 需求 5.2 - 处理 API 响应异常
   */
  handleAPIResponseEdgeCases(
    response: any,
    elementData: FocusableElement
  ): {
    isValid: boolean;
    result?: FocusVisibilityResult;
    fallbackResult?: FocusVisibilityResult;
    error?: string;
  } {
    console.log('Handling API response edge case for element:', elementData.selector);

    // Handle null or undefined response
    if (!response) {
      return {
        isValid: false,
        fallbackResult: this.createFallbackResult('CANTELL', 'API 返回空响应', elementData),
        error: 'API returned null or undefined response'
      };
    }

    // Handle malformed response structure
    if (typeof response !== 'object') {
      return {
        isValid: false,
        fallbackResult: this.createFallbackResult('CANTELL', 'API 响应格式无效', elementData),
        error: 'API response is not an object'
      };
    }

    // Handle missing required fields
    const requiredFields = ['status', 'reason'];
    const missingFields = requiredFields.filter(field => !(field in response));
    
    if (missingFields.length > 0) {
      return {
        isValid: false,
        fallbackResult: this.createFallbackResult(
          'CANTELL', 
          `API 响应缺少必需字段: ${missingFields.join(', ')}`, 
          elementData
        ),
        error: `Missing required fields: ${missingFields.join(', ')}`
      };
    }

    // Handle invalid status values
    const validStatuses = ['PASS', 'FAIL', 'INAPPLICABLE', 'CANTELL'];
    if (!validStatuses.includes(response.status)) {
      return {
        isValid: false,
        fallbackResult: this.createFallbackResult(
          'CANTELL', 
          `API 返回无效状态: ${response.status}`, 
          elementData
        ),
        error: `Invalid status: ${response.status}`
      };
    }

    // Handle empty or invalid reason
    if (!response.reason || typeof response.reason !== 'string' || response.reason.trim().length === 0) {
      return {
        isValid: false,
        fallbackResult: this.createFallbackResult(
          response.status || 'CANTELL',
          '未提供分析原因',
          elementData
        ),
        error: 'Missing or invalid reason field'
      };
    }

    // Response is valid
    return {
      isValid: true,
      result: {
        status: response.status,
        reason: response.reason,
        suggestion: response.suggestion || this.generateDefaultSuggestion(response.status),
        confidence: response.confidence || 0.5,
        actRuleCompliance: {
          ruleId: 'oj04fd',
          outcome: response.status === 'PASS' ? 'passed' : response.status === 'FAIL' ? 'failed' : response.status === 'INAPPLICABLE' ? 'inapplicable' : 'cantell',
          details: response.reason
        }
      }
    };
  }

  /**
   * Handle large page edge cases
   * Requirements: 需求 5.3 - 处理大量元素的情况
   */
  handleLargePageEdgeCases(elements: FocusableElement[]): {
    shouldProceed: boolean;
    recommendedBatchSize: number;
    estimatedTime: number;
    warnings: string[];
    suggestions: string[];
  } {
    const elementCount = elements.length;
    console.log(`Handling large page edge case with ${elementCount} elements`);

    // Define thresholds
    const LARGE_PAGE_THRESHOLD = 50;
    const VERY_LARGE_PAGE_THRESHOLD = 100;
    const EXTREME_PAGE_THRESHOLD = 200;

    if (elementCount < LARGE_PAGE_THRESHOLD) {
      return {
        shouldProceed: true,
        recommendedBatchSize: Math.min(elementCount, 10),
        estimatedTime: elementCount * 2, // 2 seconds per element
        warnings: [],
        suggestions: []
      };
    }

    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (elementCount >= EXTREME_PAGE_THRESHOLD) {
      warnings.push(`检测到 ${elementCount} 个元素，这是一个非常大的页面`);
      warnings.push('处理可能需要较长时间，建议分批处理');
      
      suggestions.push('考虑只扫描页面的特定区域');
      suggestions.push('启用缓存以避免重复处理');
      suggestions.push('在网络条件良好时进行扫描');
      suggestions.push('考虑增加批处理大小以提高效率');

      return {
        shouldProceed: true,
        recommendedBatchSize: 3, // Smaller batches for extreme cases
        estimatedTime: elementCount * 3, // 3 seconds per element
        warnings,
        suggestions
      };
    }

    if (elementCount >= VERY_LARGE_PAGE_THRESHOLD) {
      warnings.push(`检测到 ${elementCount} 个元素，这是一个大型页面`);
      
      suggestions.push('处理可能需要几分钟时间');
      suggestions.push('建议启用缓存功能');
      suggestions.push('可以考虑分批处理以获得更好的性能');

      return {
        shouldProceed: true,
        recommendedBatchSize: 5,
        estimatedTime: elementCount * 2.5,
        warnings,
        suggestions
      };
    }

    // Large page but manageable
    suggestions.push('页面包含较多元素，处理可能需要一些时间');
    suggestions.push('建议启用缓存以提高后续扫描速度');

    return {
      shouldProceed: true,
      recommendedBatchSize: 8,
      estimatedTime: elementCount * 2,
      warnings,
      suggestions
    };
  }

  /**
   * Handle browser compatibility edge cases
   */
  handleBrowserCompatibilityEdgeCases(): {
    isSupported: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for required APIs
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      issues.push('Chrome 扩展 API 不可用');
      suggestions.push('请在支持的 Chrome 浏览器中使用此扩展');
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.storage) {
      issues.push('Chrome Storage API 不可用');
      suggestions.push('请检查浏览器权限设置');
    }

    // Check for modern JavaScript features
    if (typeof Promise === 'undefined') {
      issues.push('浏览器不支持 Promise');
      suggestions.push('请更新到更新版本的浏览器');
    }

    if (typeof fetch === 'undefined') {
      issues.push('浏览器不支持 Fetch API');
      suggestions.push('请更新到更新版本的浏览器');
    }

    // Check for DOM APIs
    if (typeof document.querySelector === 'undefined') {
      issues.push('浏览器不支持现代 DOM API');
      suggestions.push('请更新到更新版本的浏览器');
    }

    return {
      isSupported: issues.length === 0,
      issues,
      suggestions
    };
  }

  /**
   * Detect special page types that typically don't have focusable elements
   */
  private detectSpecialPageType(pageUrl: string): string[] {
    const specialTypes: string[] = [];

    try {
      const url = new URL(pageUrl);
      
      // Chrome internal pages
      if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') {
        specialTypes.push('浏览器内部页面');
      }

      // File protocol
      if (url.protocol === 'file:') {
        specialTypes.push('本地文件');
      }

      // Data URLs
      if (url.protocol === 'data:') {
        specialTypes.push('数据 URL');
      }

      // About pages
      if (url.href.startsWith('about:')) {
        specialTypes.push('关于页面');
      }

      // Error pages
      if (url.hostname === '' && (
        url.pathname.includes('error') || 
        url.pathname.includes('404') ||
        url.pathname.includes('offline')
      )) {
        specialTypes.push('错误页面');
      }

      // PDF files
      if (url.pathname.toLowerCase().endsWith('.pdf')) {
        specialTypes.push('PDF 文档');
      }

      // Image files
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
      if (imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext))) {
        specialTypes.push('图片文件');
      }

    } catch (error) {
      console.warn('Failed to parse URL for special page detection:', error);
    }

    return specialTypes;
  }

  /**
   * Create fallback result for edge cases
   */
  private createFallbackResult(
    status: 'PASS' | 'FAIL' | 'INAPPLICABLE' | 'CANTELL',
    reason: string,
    elementData: FocusableElement
  ): FocusVisibilityResult {
    return {
      status,
      reason,
      suggestion: this.generateDefaultSuggestion(status),
      confidence: 0.1, // Low confidence for fallback results
      actRuleCompliance: {
        ruleId: 'oj04fd',
        outcome: status === 'PASS' ? 'passed' : status === 'FAIL' ? 'failed' : status === 'INAPPLICABLE' ? 'inapplicable' : 'cantell',
        details: reason
      }
    };
  }

  /**
   * Generate default suggestions based on status
   */
  private generateDefaultSuggestion(status: string): string {
    const suggestions: Record<string, string> = {
      'PASS': '元素具有适当的焦点指示器，无需修改。',
      'FAIL': '请添加或改进焦点指示器，确保用户能够清楚地看到焦点状态。',
      'INAPPLICABLE': '此元素不参与焦点导航，无需焦点指示器。',
      'CANTELL': '无法确定焦点指示器状态，建议手动检查或联系开发者。'
    };

    return suggestions[status] || '请参考 WCAG 2.4.7 指南进行相应的修改。';
  }

  /**
   * Check if page is in a problematic state
   */
  isPageInProblematicState(): {
    isProblematic: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check if page is still loading
    if (document.readyState === 'loading') {
      issues.push('页面仍在加载中');
      suggestions.push('等待页面完全加载后重试');
    }

    // Check if page has no body
    if (!document.body) {
      issues.push('页面没有 body 元素');
      suggestions.push('确保页面是有效的 HTML 文档');
    }

    // Check if page is very small (might be an error page)
    if (document.body && document.body.children.length < 3) {
      issues.push('页面内容极少，可能是错误页面');
      suggestions.push('检查页面是否正确加载');
    }

    // Check for common error indicators
    const errorIndicators = [
      'error', '404', '500', 'not found', 'server error',
      '错误', '未找到', '服务器错误'
    ];
    
    const pageText = document.body?.textContent?.toLowerCase() || '';
    const hasErrorIndicators = errorIndicators.some(indicator => 
      pageText.includes(indicator.toLowerCase())
    );

    if (hasErrorIndicators && pageText.length < 1000) {
      issues.push('页面可能显示错误信息');
      suggestions.push('确认页面 URL 正确并重新加载');
    }

    return {
      isProblematic: issues.length > 0,
      issues,
      suggestions
    };
  }
}

/**
 * Factory function to create edge case handler
 */
export function createEdgeCaseHandler(): EdgeCaseHandler {
  return EdgeCaseHandler.getInstance();
}

/**
 * Utility functions for edge case detection
 */
export const EdgeCaseUtils = {
  /**
   * Check if error is a critical edge case that should stop processing
   */
  isCriticalEdgeCase(error: ExtensionError): boolean {
    const criticalCodes: ErrorCode[] = [
      'API_KEY_INVALID',
      'API_ENDPOINT_UNREACHABLE'
    ];
    
    return criticalCodes.includes(error.code as ErrorCode);
  },

  /**
   * Check if error is a temporary edge case that should allow retry
   */
  isTemporaryEdgeCase(error: ExtensionError): boolean {
    const temporaryCodes: ErrorCode[] = [
      'API_RATE_LIMIT_EXCEEDED',
      'NETWORK_ERROR',
      'TIMEOUT_ERROR'
    ];
    
    return temporaryCodes.includes(error.code as ErrorCode);
  },

  /**
   * Get recommended action for edge case
   */
  getRecommendedAction(error: ExtensionError): 'retry' | 'configure' | 'wait' | 'abort' {
    switch (error.code) {
      case 'API_KEY_INVALID':
      case 'API_ENDPOINT_UNREACHABLE':
        return 'configure';
      
      case 'API_RATE_LIMIT_EXCEEDED':
        return 'wait';
      
      case 'NETWORK_ERROR':
      case 'TIMEOUT_ERROR':
        return 'retry';
      
      default:
        return 'abort';
    }
  }
};