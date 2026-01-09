// Cache Manager for AI Focus Lens extension
// Handles result caching with page hash calculation and expiration
// Requirements: 需求 6.2 - 缓存结果以减少重复 API 调用

import { 
  CacheEntry, 
  AnalysisResult, 
  ElementAnalysisData,
  ExtensionConfig,
  ExtensionError,
  CACHE_EXPIRY_TIME
} from '../types';

/**
 * Cache Manager class for handling analysis result caching
 * Requirements: 需求 6.2 - 实现页面哈希计算和缓存策略
 */
export class CacheManager {
  private static instance: CacheManager | null = null;
  private readonly STORAGE_KEYS = {
    CACHE_PREFIX: 'ai_focus_lens_cache_',
    CACHE_INDEX: 'ai_focus_lens_cache_index',
    CACHE_STATS: 'ai_focus_lens_cache_stats'
  } as const;

  private readonly MAX_CACHE_ENTRIES = 100;
  private readonly CLEANUP_THRESHOLD = 0.8; // Clean up when 80% full

  private constructor() {}

  /**
   * Get singleton instance of CacheManager
   */
  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Generate page hash for cache key
   * Requirements: 需求 6.2 - 实现页面哈希计算
   */
  public async generatePageHash(pageData: ElementAnalysisData, config: ExtensionConfig): Promise<string> {
    try {
      // Create a deterministic string representation of the page content
      const pageContent = {
        url: pageData.pageUrl,
        elementCount: pageData.elements.length,
        elements: pageData.elements.map(element => ({
          selector: element.selector,
          tagName: element.tagName,
          tabIndex: element.tabIndex,
          boundingRect: {
            x: Math.round(element.boundingRect.x),
            y: Math.round(element.boundingRect.y),
            width: Math.round(element.boundingRect.width),
            height: Math.round(element.boundingRect.height)
          },
          // Include key style properties that affect focus visibility
          keyStyles: {
            outline: element.computedStyle.outline,
            outlineColor: element.computedStyle.outlineColor,
            outlineWidth: element.computedStyle.outlineWidth,
            boxShadow: element.computedStyle.boxShadow,
            border: element.computedStyle.border,
            borderColor: element.computedStyle.borderColor
          }
        })),
        viewport: pageData.viewport,
        // Include configuration that affects analysis
        configHash: this.generateConfigHash(config)
      };

      // Convert to JSON string for hashing
      const contentString = JSON.stringify(pageContent);
      
      // Generate SHA-256 hash
      const encoder = new TextEncoder();
      const data = encoder.encode(contentString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (error) {
      console.error('Failed to generate page hash:', error);
      // Fallback to simple hash based on URL and timestamp
      return `fallback_${pageData.pageUrl}_${Date.now()}`;
    }
  }

  /**
   * Generate configuration hash to invalidate cache when config changes
   */
  private generateConfigHash(config: ExtensionConfig): string {
    // Only include config properties that affect analysis results
    const relevantConfig = {
      model: config.model,
      baseUrl: config.baseUrl,
      // Don't include API key for security
      batchSize: config.batchSize
    };
    
    return btoa(JSON.stringify(relevantConfig));
  }

  /**
   * Store analysis results in cache
   * Requirements: 需求 6.2 - 缓存结果以减少重复 API 调用
   */
  public async storeResults(
    pageData: ElementAnalysisData, 
    results: AnalysisResult[], 
    config: ExtensionConfig,
    scanId: string
  ): Promise<void> {
    try {
      const pageHash = await this.generatePageHash(pageData, config);
      const configHash = this.generateConfigHash(config);
      const now = Date.now();
      
      const cacheEntry: CacheEntry = {
        pageUrl: pageData.pageUrl,
        pageHash,
        results,
        timestamp: now,
        expiresAt: now + CACHE_EXPIRY_TIME,
        scanId,
        configHash,
        metadata: {
          elementCount: results.length,
          scanDuration: results.reduce((sum, r) => sum + r.processingTime, 0),
          cacheHits: 0
        }
      };

      // Store cache entry
      const cacheKey = `${this.STORAGE_KEYS.CACHE_PREFIX}${pageHash}`;
      await chrome.storage.local.set({
        [cacheKey]: cacheEntry
      });

      // Update cache index
      await this.updateCacheIndex(pageHash, pageData.pageUrl, now);

      // Update cache statistics
      await this.updateCacheStats('store');

      // Perform cleanup if needed
      await this.cleanupIfNeeded();

      console.log(`Cached results for ${pageData.pageUrl} with hash ${pageHash}`);
    } catch (error) {
      const cacheError: ExtensionError = {
        code: 'STORAGE_ERROR',
        message: 'Failed to store cache results',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        context: {
          component: 'cache-manager',
          action: 'store-results'
        },
        recoverable: true,
        retryable: true
      };
      throw cacheError;
    }
  }

  /**
   * Retrieve cached results if available and valid
   * Requirements: 需求 6.2 - 检测相同页面时使用缓存结果
   */
  public async getCachedResults(
    pageData: ElementAnalysisData, 
    config: ExtensionConfig
  ): Promise<AnalysisResult[] | null> {
    try {
      const pageHash = await this.generatePageHash(pageData, config);
      const configHash = this.generateConfigHash(config);
      const cacheKey = `${this.STORAGE_KEYS.CACHE_PREFIX}${pageHash}`;
      
      const result = await chrome.storage.local.get([cacheKey]);
      const cacheEntry: CacheEntry = result[cacheKey];
      
      if (!cacheEntry) {
        console.log(`No cache entry found for hash ${pageHash}`);
        await this.updateCacheStats('miss');
        return null;
      }

      // Check if cache entry is expired
      const now = Date.now();
      if (now > cacheEntry.expiresAt) {
        console.log(`Cache entry expired for ${pageData.pageUrl}`);
        await this.removeCacheEntry(pageHash);
        await this.updateCacheStats('expired');
        return null;
      }

      // Check if configuration has changed
      if (cacheEntry.configHash !== configHash) {
        console.log(`Configuration changed, invalidating cache for ${pageData.pageUrl}`);
        await this.removeCacheEntry(pageHash);
        await this.updateCacheStats('invalidated');
        return null;
      }

      // Update cache hit statistics
      cacheEntry.metadata.cacheHits++;
      await chrome.storage.local.set({
        [cacheKey]: cacheEntry
      });
      
      await this.updateCacheStats('hit');
      
      console.log(`Cache hit for ${pageData.pageUrl} (${cacheEntry.results.length} results)`);
      return cacheEntry.results;
    } catch (error) {
      console.error('Failed to retrieve cached results:', error);
      await this.updateCacheStats('error');
      return null;
    }
  }

  /**
   * Check if results are cached for a page
   */
  public async isCached(pageData: ElementAnalysisData, config: ExtensionConfig): Promise<boolean> {
    try {
      const pageHash = await this.generatePageHash(pageData, config);
      const cacheKey = `${this.STORAGE_KEYS.CACHE_PREFIX}${pageHash}`;
      
      const result = await chrome.storage.local.get([cacheKey]);
      const cacheEntry: CacheEntry = result[cacheKey];
      
      if (!cacheEntry) {
        return false;
      }

      // Check expiration
      const now = Date.now();
      if (now > cacheEntry.expiresAt) {
        await this.removeCacheEntry(pageHash);
        return false;
      }

      // Check configuration compatibility
      const configHash = this.generateConfigHash(config);
      if (cacheEntry.configHash !== configHash) {
        await this.removeCacheEntry(pageHash);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to check cache status:', error);
      return false;
    }
  }

  /**
   * Clear all cached results
   */
  public async clearCache(): Promise<void> {
    try {
      // Get all cache keys
      const cacheIndex = await this.getCacheIndex();
      const cacheKeys = Object.keys(cacheIndex).map(hash => `${this.STORAGE_KEYS.CACHE_PREFIX}${hash}`);
      
      // Remove all cache entries
      if (cacheKeys.length > 0) {
        await chrome.storage.local.remove(cacheKeys);
      }

      // Clear cache index and stats
      await chrome.storage.local.remove([
        this.STORAGE_KEYS.CACHE_INDEX,
        this.STORAGE_KEYS.CACHE_STATS
      ]);

      console.log(`Cleared ${cacheKeys.length} cache entries`);
    } catch (error) {
      const cacheError: ExtensionError = {
        code: 'STORAGE_ERROR',
        message: 'Failed to clear cache',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        context: {
          component: 'cache-manager',
          action: 'clear-cache'
        },
        recoverable: true,
        retryable: true
      };
      throw cacheError;
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    totalMisses: number;
    totalExpired: number;
    totalInvalidated: number;
    totalErrors: number;
    hitRate: number;
    storageUsed: number;
  }> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.CACHE_STATS]);
      const stats = result[this.STORAGE_KEYS.CACHE_STATS] || {
        hits: 0,
        misses: 0,
        stores: 0,
        expired: 0,
        invalidated: 0,
        errors: 0
      };

      const cacheIndex = await this.getCacheIndex();
      const totalEntries = Object.keys(cacheIndex).length;
      const totalRequests = stats.hits + stats.misses;
      const hitRate = totalRequests > 0 ? (stats.hits / totalRequests) * 100 : 0;

      // Calculate storage usage
      const cacheKeys = Object.keys(cacheIndex).map(hash => `${this.STORAGE_KEYS.CACHE_PREFIX}${hash}`);
      const storageUsed = cacheKeys.length > 0 ? await chrome.storage.local.getBytesInUse(cacheKeys) : 0;

      return {
        totalEntries,
        totalHits: stats.hits,
        totalMisses: stats.misses,
        totalExpired: stats.expired,
        totalInvalidated: stats.invalidated,
        totalErrors: stats.errors,
        hitRate: Math.round(hitRate * 100) / 100,
        storageUsed
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        totalEntries: 0,
        totalHits: 0,
        totalMisses: 0,
        totalExpired: 0,
        totalInvalidated: 0,
        totalErrors: 0,
        hitRate: 0,
        storageUsed: 0
      };
    }
  }

  /**
   * Remove expired cache entries
   * Requirements: 需求 6.2 - 处理缓存过期和清理
   */
  public async cleanupExpiredEntries(): Promise<number> {
    try {
      const cacheIndex = await this.getCacheIndex();
      const now = Date.now();
      let cleanedCount = 0;

      const expiredHashes: string[] = [];
      
      for (const [hash, indexEntry] of Object.entries(cacheIndex)) {
        if (now > indexEntry.expiresAt) {
          expiredHashes.push(hash);
        }
      }

      if (expiredHashes.length > 0) {
        // Remove expired cache entries
        const expiredKeys = expiredHashes.map(hash => `${this.STORAGE_KEYS.CACHE_PREFIX}${hash}`);
        await chrome.storage.local.remove(expiredKeys);

        // Update cache index
        const updatedIndex = { ...cacheIndex };
        expiredHashes.forEach(hash => {
          delete updatedIndex[hash];
        });
        
        await chrome.storage.local.set({
          [this.STORAGE_KEYS.CACHE_INDEX]: updatedIndex
        });

        cleanedCount = expiredHashes.length;
        console.log(`Cleaned up ${cleanedCount} expired cache entries`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup expired entries:', error);
      return 0;
    }
  }

  /**
   * Remove least recently used entries when cache is full
   */
  private async cleanupIfNeeded(): Promise<void> {
    try {
      const cacheIndex = await this.getCacheIndex();
      const entryCount = Object.keys(cacheIndex).length;

      if (entryCount >= this.MAX_CACHE_ENTRIES * this.CLEANUP_THRESHOLD) {
        console.log(`Cache cleanup needed: ${entryCount}/${this.MAX_CACHE_ENTRIES} entries`);
        
        // First, clean up expired entries
        const expiredCleaned = await this.cleanupExpiredEntries();
        
        const remainingCount = entryCount - expiredCleaned;
        if (remainingCount >= this.MAX_CACHE_ENTRIES * this.CLEANUP_THRESHOLD) {
          // Still too many entries, remove LRU entries
          await this.cleanupLRUEntries(remainingCount - Math.floor(this.MAX_CACHE_ENTRIES * 0.5));
        }
      }
    } catch (error) {
      console.error('Failed to perform cache cleanup:', error);
    }
  }

  /**
   * Remove least recently used entries
   */
  private async cleanupLRUEntries(countToRemove: number): Promise<void> {
    try {
      const cacheIndex = await this.getCacheIndex();
      
      // Sort by timestamp (oldest first)
      const sortedEntries = Object.entries(cacheIndex)
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
        .slice(0, countToRemove);

      if (sortedEntries.length > 0) {
        const hashesToRemove = sortedEntries.map(([hash]) => hash);
        const keysToRemove = hashesToRemove.map(hash => `${this.STORAGE_KEYS.CACHE_PREFIX}${hash}`);
        
        // Remove cache entries
        await chrome.storage.local.remove(keysToRemove);

        // Update cache index
        const updatedIndex = { ...cacheIndex };
        hashesToRemove.forEach(hash => {
          delete updatedIndex[hash];
        });
        
        await chrome.storage.local.set({
          [this.STORAGE_KEYS.CACHE_INDEX]: updatedIndex
        });

        console.log(`Removed ${sortedEntries.length} LRU cache entries`);
      }
    } catch (error) {
      console.error('Failed to cleanup LRU entries:', error);
    }
  }

  /**
   * Update cache index with new entry
   */
  private async updateCacheIndex(hash: string, url: string, timestamp: number): Promise<void> {
    try {
      const cacheIndex = await this.getCacheIndex();
      cacheIndex[hash] = {
        url,
        timestamp,
        expiresAt: timestamp + CACHE_EXPIRY_TIME
      };
      
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.CACHE_INDEX]: cacheIndex
      });
    } catch (error) {
      console.error('Failed to update cache index:', error);
    }
  }

  /**
   * Get cache index
   */
  private async getCacheIndex(): Promise<Record<string, { url: string; timestamp: number; expiresAt: number }>> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.CACHE_INDEX]);
      return result[this.STORAGE_KEYS.CACHE_INDEX] || {};
    } catch (error) {
      console.error('Failed to get cache index:', error);
      return {};
    }
  }

  /**
   * Remove specific cache entry
   */
  private async removeCacheEntry(hash: string): Promise<void> {
    try {
      const cacheKey = `${this.STORAGE_KEYS.CACHE_PREFIX}${hash}`;
      await chrome.storage.local.remove([cacheKey]);

      // Update cache index
      const cacheIndex = await this.getCacheIndex();
      delete cacheIndex[hash];
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.CACHE_INDEX]: cacheIndex
      });
    } catch (error) {
      console.error('Failed to remove cache entry:', error);
    }
  }

  /**
   * Update cache statistics
   */
  private async updateCacheStats(operation: 'hit' | 'miss' | 'store' | 'expired' | 'invalidated' | 'error'): Promise<void> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.CACHE_STATS]);
      const stats = result[this.STORAGE_KEYS.CACHE_STATS] || {
        hits: 0,
        misses: 0,
        stores: 0,
        expired: 0,
        invalidated: 0,
        errors: 0
      };

      stats[operation === 'hit' ? 'hits' : 
            operation === 'miss' ? 'misses' :
            operation === 'store' ? 'stores' :
            operation === 'expired' ? 'expired' :
            operation === 'invalidated' ? 'invalidated' : 'errors']++;

      await chrome.storage.local.set({
        [this.STORAGE_KEYS.CACHE_STATS]: stats
      });
    } catch (error) {
      console.error('Failed to update cache stats:', error);
    }
  }
}

/**
 * Factory function to create CacheManager instance
 */
export function createCacheManager(): CacheManager {
  return CacheManager.getInstance();
}

/**
 * Utility functions for cache operations
 */
export const CacheUtils = {
  /**
   * Calculate cache key from page data
   */
  async calculateCacheKey(pageData: ElementAnalysisData, config: ExtensionConfig): Promise<string> {
    const cacheManager = CacheManager.getInstance();
    return await cacheManager.generatePageHash(pageData, config);
  },

  /**
   * Check if caching is enabled in configuration
   */
  isCachingEnabled(config: ExtensionConfig): boolean {
    return config.cacheEnabled === true;
  },

  /**
   * Get cache expiry time in milliseconds
   */
  getCacheExpiryTime(): number {
    return CACHE_EXPIRY_TIME;
  },

  /**
   * Format cache statistics for display
   */
  formatCacheStats(stats: {
    totalEntries: number;
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    storageUsed: number;
  }): string {
    return `Cache: ${stats.totalEntries} entries, ${stats.hitRate}% hit rate, ${Math.round(stats.storageUsed / 1024)}KB used`;
  }
};