#!/usr/bin/env node

/**
 * Development build script for AI Focus Lens Chrome Extension
 * Handles development builds with hot reloading and debugging features
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Configuration
const BUILD_DIR = 'dist';
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

function setupDevelopmentManifest() {
  logStep('DEV', 'Setting up development manifest...');
  
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('manifest.json not found. Run build first.');
  }
  
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  
  // Add development-specific configurations
  manifest.name = `${manifest.name} (Development)`;
  
  // Add development permissions
  if (!manifest.permissions.includes('tabs')) {
    manifest.permissions.push('tabs');
  }
  
  // Enable debugging
  if (manifest.content_security_policy) {
    manifest.content_security_policy.extension_pages = 
      "script-src 'self' 'unsafe-eval'; object-src 'self'";
  }
  
  // Add development-specific content scripts for hot reloading
  if (!manifest.content_scripts) {
    manifest.content_scripts = [];
  }
  
  // Write back the modified manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  
  logSuccess('Development manifest configured');
  return manifest;
}

function createDevBuildInfo() {
  logStep('DEV', 'Creating development build info...');
  
  const buildInfo = {
    mode: 'development',
    buildDate: new Date().toISOString(),
    hotReload: true,
    debugging: true,
    sourceMap: true,
    features: {
      liveReload: true,
      debugConsole: true,
      verboseLogging: true,
      testMode: true
    },
    devServer: {
      enabled: false,
      port: 9000
    }
  };
  
  const buildInfoPath = path.join(BUILD_DIR, 'dev-build-info.json');
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
  
  logSuccess(`Development build info saved: ${buildInfoPath}`);
  return buildInfo;
}

function watchFiles() {
  logStep('WATCH', 'Starting file watcher...');
  
  try {
    // Start webpack in watch mode
    const webpackProcess = spawn('pnpm', ['run', 'dev'], {
      stdio: 'inherit',
      shell: true
    });
    
    webpackProcess.on('error', (error) => {
      logError(`Webpack watch failed: ${error.message}`);
    });
    
    webpackProcess.on('exit', (code) => {
      if (code !== 0) {
        logError(`Webpack watch exited with code ${code}`);
      }
    });
    
    logSuccess('File watcher started');
    return webpackProcess;
    
  } catch (error) {
    throw new Error(`Failed to start file watcher: ${error.message}`);
  }
}

function runTypeCheck() {
  logStep('TYPE', 'Running TypeScript type check...');
  
  try {
    execSync('pnpm run type-check', { stdio: 'inherit' });
    logSuccess('TypeScript type check passed');
  } catch (error) {
    logWarning('TypeScript type check failed - continuing with build');
  }
}

function runLinter() {
  logStep('LINT', 'Running ESLint...');
  
  try {
    execSync('pnpm run lint', { stdio: 'inherit' });
    logSuccess('ESLint check passed');
  } catch (error) {
    logWarning('ESLint check failed - continuing with build');
  }
}

function printDevInstructions() {
  log('\n' + '='.repeat(60), colors.bright);
  log('DEVELOPMENT BUILD READY', colors.bright);
  log('='.repeat(60), colors.bright);
  log('');
  log('📁 Extension files are in: ./dist/', colors.cyan);
  log('');
  log('🔧 To load in Chrome:', colors.yellow);
  log('  1. Open Chrome and go to chrome://extensions/');
  log('  2. Enable "Developer mode" (top right toggle)');
  log('  3. Click "Load unpacked" and select the ./dist/ folder');
  log('');
  log('🔄 File watching is active - changes will rebuild automatically', colors.green);
  log('');
  log('🛠️  Development features enabled:', colors.magenta);
  log('  • Source maps for debugging');
  log('  • Verbose console logging');
  log('  • Development permissions');
  log('  • Hot reloading (manual refresh required)');
  log('');
  log('📝 Useful commands:', colors.blue);
  log('  • pnpm test          - Run tests');
  log('  • pnpm run lint      - Run linter');
  log('  • pnpm run type-check - Check TypeScript');
  log('');
  log('Press Ctrl+C to stop watching files', colors.yellow);
  log('='.repeat(60), colors.bright);
}

// Main development build process
async function main() {
  try {
    log('AI Focus Lens Development Build', colors.bright);
    log('===============================\n', colors.bright);
    
    // Step 1: Clean and build development version
    logStep('BUILD', 'Running development build...');
    execSync('pnpm run clean', { stdio: 'inherit' });
    execSync('pnpm run build:dev', { stdio: 'inherit' });
    logSuccess('Development build completed');
    
    // Step 2: Setup development environment
    const manifest = setupDevelopmentManifest();
    const buildInfo = createDevBuildInfo();
    
    // Step 3: Run quality checks (non-blocking)
    runTypeCheck();
    runLinter();
    
    // Step 4: Print instructions
    printDevInstructions();
    
    // Step 5: Start file watcher
    const watchProcess = watchFiles();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      log('\n\nShutting down development build...', colors.yellow);
      if (watchProcess) {
        watchProcess.kill();
      }
      process.exit(0);
    });
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    logError(`Development build failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  setupDevelopmentManifest,
  createDevBuildInfo,
  watchFiles,
  runTypeCheck,
  runLinter
};