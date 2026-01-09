// Storage Manager for AI Focus Lens extension
// Handles secure configuration storage and retrieval using Chrome Storage API
// Requirements: 需求 3.2, 7.1 - 安全地存储配置信息

import { 
  ExtensionConfig, 
  StoredConfig, 
  DEFAULT_STORED_CONFIG,
  ValidationResult,
  ExtensionError
} from '../types';

/**
 * Storage Manager class for handling configuration persistence
 * Requirements: 需求 3.2 - 使用 Chrome Storage API 安全存储配置
 */
export class StorageManager {
  private static instance: StorageManager | null = null;
  private readonly STORAGE_KEYS = {
    CONFIG: 'ai_focus_lens_config',
    MIGRATION_VERSION: 'ai_focus_lens_migration_version'
  } as const;

  private constructor() {}

  /**
   * Get singleton instance of StorageManager
   */
  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * Save configuration securely to Chrome Storage
   * Requirements: 需求 3.2 - 安全地存储这些配置信息
   */
  public async saveConfig(config: ExtensionConfig): Promise<void> {
    try {
      // Validate configuration before saving
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Create stored config with metadata
      const storedConfig: StoredConfig = {
        version: '1.0.0',
        apiKey: await this.encryptApiKey(config.apiKey),
        baseUrl: config.baseUrl,
        model: config.model,
        preferences: {
          batchSize: config.batchSize,
          cacheEnabled: config.cacheEnabled,
          highlightColor: '#ff6b6b', // Default highlight color
          autoScan: false, // Default auto scan setting
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          retryDelay: config.retryDelay,
          enableLogging: true,
          logLevel: 'info'
        },
        lastUpdated: Date.now(),
        migrationVersion: 1
      };

      // Save to Chrome Storage Sync for cross-device synchronization
      await chrome.storage.sync.set({
        [this.STORAGE_KEYS.CONFIG]: storedConfig
      });

      console.log('Configuration saved successfully');
    } catch (error) {
      const storageError: ExtensionError = {
        code: 'STORAGE_ERROR',
        message: 'Failed to save configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        context: {
          component: 'storage-manager',
          action: 'save-config'
        },
        recoverable: true,
        retryable: true
      };
      throw storageError;
    }
  }

  /**
   * Load configuration from Chrome Storage
   * Requirements: 需求 3.2 - 实现配置的读取、写入和验证
   */
  public async loadConfig(): Promise<ExtensionConfig> {
    try {
      const result = await chrome.storage.sync.get([this.STORAGE_KEYS.CONFIG]);
      const storedConfig: StoredConfig = result[this.STORAGE_KEYS.CONFIG];

      if (!storedConfig) {
        // Return default configuration if none exists
        console.log('No stored configuration found, using defaults');
        return this.convertStoredToExtensionConfig(DEFAULT_STORED_CONFIG);
      }

      // Check if migration is needed
      await this.migrateConfigIfNeeded(storedConfig);

      // Decrypt API key and convert to ExtensionConfig
      const config = await this.convertStoredToExtensionConfig(storedConfig);
      
      // Validate loaded configuration
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        console.warn('Loaded configuration is invalid:', validation.errors);
        // Return default config if loaded config is invalid
        return this.convertStoredToExtensionConfig(DEFAULT_STORED_CONFIG);
      }

      return config;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      // Return default configuration on error
      return this.convertStoredToExtensionConfig(DEFAULT_STORED_CONFIG);
    }
  }

  /**
   * Update specific configuration fields
   */
  public async updateConfig(updates: Partial<ExtensionConfig>): Promise<void> {
    try {
      const currentConfig = await this.loadConfig();
      const updatedConfig: ExtensionConfig = {
        ...currentConfig,
        ...updates
      };
      
      await this.saveConfig(updatedConfig);
    } catch (error) {
      const storageError: ExtensionError = {
        code: 'STORAGE_ERROR',
        message: 'Failed to update configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        context: {
          component: 'storage-manager',
          action: 'update-config'
        },
        recoverable: true,
        retryable: true
      };
      throw storageError;
    }
  }

  /**
   * Clear all stored configuration
   */
  public async clearConfig(): Promise<void> {
    try {
      await chrome.storage.sync.remove([this.STORAGE_KEYS.CONFIG]);
      console.log('Configuration cleared successfully');
    } catch (error) {
      const storageError: ExtensionError = {
        code: 'STORAGE_ERROR',
        message: 'Failed to clear configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        context: {
          component: 'storage-manager',
          action: 'clear-config'
        },
        recoverable: true,
        retryable: false
      };
      throw storageError;
    }
  }

  /**
   * Check if configuration exists
   */
  public async hasConfig(): Promise<boolean> {
    try {
      const result = await chrome.storage.sync.get([this.STORAGE_KEYS.CONFIG]);
      return !!result[this.STORAGE_KEYS.CONFIG];
    } catch (error) {
      console.error('Failed to check configuration existence:', error);
      return false;
    }
  }

  /**
   * Get storage usage information
   */
  public async getStorageInfo(): Promise<{ bytesInUse: number; quota: number }> {
    try {
      const bytesInUse = await chrome.storage.sync.getBytesInUse();
      const quota = chrome.storage.sync.QUOTA_BYTES;
      return { bytesInUse, quota };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { bytesInUse: 0, quota: 0 };
    }
  }

  /**
   * Validate configuration object
   * Requirements: 需求 3.2 - 实现配置的读取、写入和验证
   */
  private validateConfig(config: ExtensionConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate API key
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      errors.push('API key is required');
    } else if (config.apiKey.length < 10) {
      warnings.push('API key seems too short');
    }

    // Validate base URL
    if (!config.baseUrl || config.baseUrl.trim().length === 0) {
      errors.push('Base URL is required');
    } else {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push('Base URL is not a valid URL');
      }
    }

    // Validate model
    if (!config.model || config.model.trim().length === 0) {
      errors.push('Model is required');
    }

    // Validate numeric values
    if (config.batchSize <= 0 || config.batchSize > 50) {
      errors.push('Batch size must be between 1 and 50');
    }

    if (config.timeout <= 0 || config.timeout > 300000) {
      errors.push('Timeout must be between 1ms and 5 minutes');
    }

    if (config.maxRetries < 0 || config.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10');
    }

    if (config.retryDelay < 0 || config.retryDelay > 60000) {
      errors.push('Retry delay must be between 0ms and 1 minute');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Encrypt API key for secure storage
   * Requirements: 需求 7.1 - 使用浏览器的安全存储机制
   */
  private async encryptApiKey(apiKey: string): Promise<string> {
    // For Chrome extensions, we rely on Chrome's built-in encryption
    // Chrome Storage API automatically encrypts data when synced
    // For additional security, we could implement client-side encryption here
    
    // Simple obfuscation to prevent casual inspection
    // In production, consider using Web Crypto API for stronger encryption
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const obfuscated = Array.from(data)
      .map(byte => byte ^ 0x42) // Simple XOR obfuscation
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    
    return `enc_${obfuscated}`;
  }

  /**
   * Decrypt API key from storage
   */
  private async decryptApiKey(encryptedKey: string): Promise<string> {
    if (!encryptedKey.startsWith('enc_')) {
      // Legacy unencrypted key
      return encryptedKey;
    }

    try {
      const obfuscated = encryptedKey.substring(4); // Remove 'enc_' prefix
      const bytes = [];
      
      for (let i = 0; i < obfuscated.length; i += 2) {
        const hex = obfuscated.substring(i, i + 2);
        const byte = parseInt(hex, 16) ^ 0x42; // Reverse XOR obfuscation
        bytes.push(byte);
      }
      
      const decoder = new TextDecoder();
      return decoder.decode(new Uint8Array(bytes));
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return ''; // Return empty string on decryption failure
    }
  }

  /**
   * Convert StoredConfig to ExtensionConfig
   */
  private async convertStoredToExtensionConfig(storedConfig: StoredConfig): Promise<ExtensionConfig> {
    const decryptedApiKey = await this.decryptApiKey(storedConfig.apiKey);
    
    return {
      apiKey: decryptedApiKey,
      baseUrl: storedConfig.baseUrl,
      model: storedConfig.model,
      batchSize: storedConfig.preferences.batchSize,
      cacheEnabled: storedConfig.preferences.cacheEnabled,
      timeout: storedConfig.preferences.timeout,
      maxRetries: storedConfig.preferences.maxRetries,
      retryDelay: storedConfig.preferences.retryDelay
    };
  }

  /**
   * Migrate configuration if needed
   * Requirements: 需求 7.4 - 保持用户配置的向后兼容性
   */
  private async migrateConfigIfNeeded(storedConfig: StoredConfig): Promise<void> {
    const currentMigrationVersion = 1;
    
    if (storedConfig.migrationVersion >= currentMigrationVersion) {
      return; // No migration needed
    }

    console.log(`Migrating configuration from version ${storedConfig.migrationVersion} to ${currentMigrationVersion}`);

    // Perform migration based on version
    if (storedConfig.migrationVersion < 1) {
      // Migration from version 0 to 1
      // Add new fields with defaults
      storedConfig.preferences = {
        ...storedConfig.preferences,
        enableLogging: storedConfig.preferences.enableLogging ?? true,
        logLevel: storedConfig.preferences.logLevel ?? 'info'
      };
    }

    // Update migration version
    storedConfig.migrationVersion = currentMigrationVersion;
    storedConfig.lastUpdated = Date.now();

    // Save migrated configuration
    await chrome.storage.sync.set({
      [this.STORAGE_KEYS.CONFIG]: storedConfig
    });

    console.log('Configuration migration completed');
  }

  /**
   * Export configuration for backup
   */
  public async exportConfig(): Promise<string> {
    try {
      const config = await this.loadConfig();
      // Remove sensitive data for export
      const exportConfig = {
        ...config,
        apiKey: '***REDACTED***'
      };
      return JSON.stringify(exportConfig, null, 2);
    } catch (error) {
      throw new Error(`Failed to export configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Import configuration from backup
   */
  public async importConfig(configJson: string): Promise<void> {
    try {
      const importedConfig = JSON.parse(configJson) as Partial<ExtensionConfig>;
      
      // Don't import redacted API key
      if (importedConfig.apiKey === '***REDACTED***') {
        delete importedConfig.apiKey;
      }

      // Merge with current config to preserve API key if not provided
      const currentConfig = await this.loadConfig();
      const mergedConfig: ExtensionConfig = {
        ...currentConfig,
        ...importedConfig
      };

      await this.saveConfig(mergedConfig);
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Factory function to create StorageManager instance
 */
export function createStorageManager(): StorageManager {
  return StorageManager.getInstance();
}

/**
 * Utility functions for storage operations
 */
export const StorageUtils = {
  /**
   * Check if Chrome Storage API is available
   */
  isStorageAvailable(): boolean {
    return !!(chrome && chrome.storage && chrome.storage.sync);
  },

  /**
   * Get storage quota information
   */
  async getQuotaInfo(): Promise<{ used: number; total: number; percentage: number }> {
    try {
      const used = await chrome.storage.sync.getBytesInUse();
      const total = chrome.storage.sync.QUOTA_BYTES;
      const percentage = (used / total) * 100;
      
      return { used, total, percentage };
    } catch (error) {
      console.error('Failed to get quota info:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  },

  /**
   * Clear all extension data
   */
  async clearAllData(): Promise<void> {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      console.log('All extension data cleared');
    } catch (error) {
      throw new Error(`Failed to clear all data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};