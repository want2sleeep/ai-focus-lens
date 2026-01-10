#!/usr/bin/env node

/**
 * Build script for AI Focus Lens Chrome Extension
 * Handles production builds, packaging, and validation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const BUILD_DIR = 'dist';
const PACKAGE_DIR = 'packages';
const MANIFEST_PATH = path.join(BUILD_DIR, 'manifest.json');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`[${step}] ${message}`, colors.cyan);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

// Validation functions
function validateManifest() {
  logStep('VALIDATE', 'Checking manifest.json...');
  
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('manifest.json not found in dist directory');
  }
  
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  
  // Required fields validation
  const requiredFields = ['name', 'version', 'manifest_version', 'description'];
  for (const field of requiredFields) {
    if (!manifest[field]) {
      throw new Error(`Missing required field in manifest: ${field}`);
    }
  }
  
  // Manifest V3 validation
  if (manifest.manifest_version !== 3) {
    throw new Error('Extension must use Manifest V3');
  }
  
  // Service worker validation
  if (!manifest.background || !manifest.background.service_worker) {
    throw new Error('Service worker not defined in manifest');
  }
  
  // Content scripts validation
  if (!manifest.content_scripts || manifest.content_scripts.length === 0) {
    logWarning('No content scripts defined in manifest');
  }
  
  // Permissions validation
  if (!manifest.permissions || manifest.permissions.length === 0) {
    logWarning('No permissions defined in manifest');
  }
  
  logSuccess('Manifest validation passed');
  return manifest;
}

function validateBuildFiles() {
  logStep('VALIDATE', 'Checking build files...');
  
  const requiredFiles = [
    'service-worker.js',
    'content-script.js',
    'popup.js',
    'popup.html'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(BUILD_DIR, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required build file missing: ${file}`);
    }
    
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error(`Build file is empty: ${file}`);
    }
  }
  
  logSuccess('Build files validation passed');
}

function checkFileSize() {
  logStep('VALIDATE', 'Checking file sizes...');
  
  const maxSizes = {
    'service-worker.js': 1024 * 1024, // 1MB
    'content-script.js': 512 * 1024,  // 512KB
    'popup.js': 256 * 1024,           // 256KB
    'popup.html': 64 * 1024           // 64KB
  };
  
  let totalSize = 0;
  
  for (const [file, maxSize] of Object.entries(maxSizes)) {
    const filePath = path.join(BUILD_DIR, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
      
      if (stats.size > maxSize) {
        logWarning(`File ${file} is larger than recommended (${Math.round(stats.size / 1024)}KB > ${Math.round(maxSize / 1024)}KB)`);
      } else {
        log(`  ${file}: ${Math.round(stats.size / 1024)}KB`);
      }
    }
  }
  
  log(`Total extension size: ${Math.round(totalSize / 1024)}KB`);
  
  if (totalSize > 2 * 1024 * 1024) { // 2MB
    logWarning('Extension size is larger than 2MB, consider optimization');
  }
  
  logSuccess('File size check completed');
}

function createPackage(manifest) {
  logStep('PACKAGE', 'Creating extension package...');
  
  // Create packages directory
  if (!fs.existsSync(PACKAGE_DIR)) {
    fs.mkdirSync(PACKAGE_DIR, { recursive: true });
  }
  
  const version = manifest.version;
  const packageName = `ai-focus-lens-v${version}`;
  const zipPath = path.join(PACKAGE_DIR, `${packageName}.zip`);
  
  try {
    // Use web-ext to build the package
    const webExtCmd = `pnpm web-ext build --source-dir=${BUILD_DIR} --artifacts-dir=${PACKAGE_DIR} --filename=${packageName}.zip --overwrite-dest`;
    execSync(webExtCmd, { stdio: 'inherit' });
    
    logSuccess(`Extension packaged: ${zipPath}`);
    
    // Get package size
    if (fs.existsSync(zipPath)) {
      const stats = fs.statSync(zipPath);
      log(`Package size: ${Math.round(stats.size / 1024)}KB`);
    }
    
    return zipPath;
  } catch (error) {
    throw new Error(`Failed to create package: ${error.message}`);
  }
}

function generateBuildInfo(manifest, packagePath) {
  logStep('INFO', 'Generating build information...');
  
  const buildInfo = {
    name: manifest.name,
    version: manifest.version,
    buildDate: new Date().toISOString(),
    buildMode: 'production',
    manifestVersion: manifest.manifest_version,
    packagePath: packagePath,
    files: {
      manifest: 'manifest.json',
      serviceWorker: 'service-worker.js',
      contentScript: 'content-script.js',
      popup: {
        html: 'popup.html',
        js: 'popup.js'
      }
    },
    validation: {
      manifestValid: true,
      filesValid: true,
      sizeCheck: true
    }
  };
  
  const buildInfoPath = path.join(BUILD_DIR, 'build-info.json');
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
  
  logSuccess(`Build info saved: ${buildInfoPath}`);
  return buildInfo;
}

function printSummary(buildInfo) {
  log('\n' + '='.repeat(50), colors.bright);
  log('BUILD SUMMARY', colors.bright);
  log('='.repeat(50), colors.bright);
  log(`Extension: ${buildInfo.name}`);
  log(`Version: ${buildInfo.version}`);
  log(`Build Date: ${buildInfo.buildDate}`);
  log(`Package: ${buildInfo.packagePath}`);
  log('='.repeat(50), colors.bright);
}

// Main build process
async function main() {
  try {
    log('AI Focus Lens Extension Build Script', colors.bright);
    log('=====================================\n', colors.bright);
    
    // Step 1: Clean and build
    logStep('BUILD', 'Running production build...');
    execSync('pnpm run clean', { stdio: 'inherit' });
    execSync('pnpm run build', { stdio: 'inherit' });
    logSuccess('Production build completed');
    
    // Step 2: Validate build
    const manifest = validateManifest();
    validateBuildFiles();
    checkFileSize();
    
    // Step 3: Create package
    const packagePath = createPackage(manifest);
    
    // Step 4: Generate build info
    const buildInfo = generateBuildInfo(manifest, packagePath);
    
    // Step 5: Print summary
    printSummary(buildInfo);
    
    logSuccess('Extension build completed successfully!');
    
  } catch (error) {
    logError(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  validateManifest,
  validateBuildFiles,
  checkFileSize,
  createPackage,
  generateBuildInfo
};