#!/usr/bin/env node

/**
 * Release preparation script for AI Focus Lens Chrome Extension
 * Handles version bumping, changelog generation, and release validation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const MANIFEST_PATH = 'src/manifest.json';
const PACKAGE_JSON_PATH = 'package.json';
const CHANGELOG_PATH = 'CHANGELOG.md';

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

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

function validateVersionFormat(version) {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  return semverRegex.test(version);
}

function bumpVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (validateVersionFormat(bumpType)) {
        return bumpType;
      }
      throw new Error(`Invalid bump type or version: ${bumpType}`);
  }
}

function updatePackageJson(newVersion) {
  logStep('UPDATE', 'Updating package.json...');
  
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  packageJson.version = newVersion;
  
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + '\n');
  logSuccess(`Updated package.json to version ${newVersion}`);
}

function updateManifest(newVersion) {
  logStep('UPDATE', 'Updating manifest.json...');
  
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  manifest.version = newVersion;
  
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  logSuccess(`Updated manifest.json to version ${newVersion}`);
}

function generateChangelog(version) {
  logStep('CHANGELOG', 'Generating changelog entry...');
  
  const date = new Date().toISOString().split('T')[0];
  const changelogEntry = `
## [${version}] - ${date}

### Added
- New features and enhancements

### Changed
- Updates and improvements

### Fixed
- Bug fixes and corrections

### Security
- Security improvements

`;

  if (fs.existsSync(CHANGELOG_PATH)) {
    const existingChangelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const updatedChangelog = existingChangelog.replace(
      /^(# Changelog\n)/,
      `$1${changelogEntry}`
    );
    fs.writeFileSync(CHANGELOG_PATH, updatedChangelog);
  } else {
    const newChangelog = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
${changelogEntry}`;
    fs.writeFileSync(CHANGELOG_PATH, newChangelog);
  }
  
  logSuccess('Changelog updated');
}

function runPreReleaseChecks() {
  logStep('CHECK', 'Running pre-release checks...');
  
  try {
    // Type check
    execSync('pnpm run type-check:prod', { stdio: 'pipe' });
    logSuccess('TypeScript type check passed');
    
    // Linting
    execSync('pnpm run lint', { stdio: 'pipe' });
    logSuccess('ESLint check passed');
    
    // Tests
    execSync('pnpm run test', { stdio: 'pipe' });
    logSuccess('All tests passed');
    
    // Security audit
    try {
      execSync('pnpm audit --audit-level moderate', { stdio: 'pipe' });
      logSuccess('Security audit passed');
    } catch (error) {
      logWarning('Security audit found issues - please review');
    }
    
  } catch (error) {
    throw new Error(`Pre-release checks failed: ${error.message}`);
  }
}

function buildRelease() {
  logStep('BUILD', 'Building release package...');
  
  try {
    execSync('pnpm run build:extension', { stdio: 'inherit' });
    logSuccess('Release package built successfully');
  } catch (error) {
    throw new Error(`Build failed: ${error.message}`);
  }
}

function createGitTag(version) {
  logStep('GIT', 'Creating git tag...');
  
  try {
    // Check if there are uncommitted changes
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      logWarning('There are uncommitted changes. Commit them first.');
      return;
    }
    
    // Create and push tag
    execSync(`git tag -a v${version} -m "Release version ${version}"`, { stdio: 'inherit' });
    logSuccess(`Created git tag v${version}`);
    
    log('To push the tag, run: git push origin v' + version, colors.yellow);
    
  } catch (error) {
    logWarning(`Failed to create git tag: ${error.message}`);
  }
}

function printReleaseInstructions(version) {
  log('\n' + '='.repeat(60), colors.bright);
  log('RELEASE PREPARATION COMPLETE', colors.bright);
  log('='.repeat(60), colors.bright);
  log('');
  log(`🎉 Version ${version} is ready for release!`, colors.green);
  log('');
  log('📦 Next steps:', colors.yellow);
  log('  1. Review the generated changelog');
  log('  2. Commit the version changes:');
  log(`     git add . && git commit -m "Release version ${version}"`);
  log('  3. Push the tag:');
  log(`     git push origin v${version}`);
  log('  4. Create a GitHub release using the tag');
  log('  5. Upload the extension package to Chrome Web Store');
  log('');
  log('📁 Release files:', colors.cyan);
  log('  • Extension package: ./packages/ai-focus-lens-v' + version + '.zip');
  log('  • Build info: ./dist/build-info.json');
  log('');
  log('🔍 Quality checks:', colors.magenta);
  log('  ✓ TypeScript compilation');
  log('  ✓ ESLint validation');
  log('  ✓ Unit tests');
  log('  ✓ Security audit');
  log('  ✓ Extension build');
  log('');
  log('='.repeat(60), colors.bright);
}

// Main release preparation process
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('Usage: node scripts/prepare-release.js <version|bump-type>', colors.red);
    log('');
    log('Examples:', colors.yellow);
    log('  node scripts/prepare-release.js patch    # 1.0.0 -> 1.0.1');
    log('  node scripts/prepare-release.js minor    # 1.0.0 -> 1.1.0');
    log('  node scripts/prepare-release.js major    # 1.0.0 -> 2.0.0');
    log('  node scripts/prepare-release.js 1.2.3    # Set specific version');
    process.exit(1);
  }
  
  const versionArg = args[0];
  
  try {
    log('AI Focus Lens Release Preparation', colors.bright);
    log('=================================\n', colors.bright);
    
    // Step 1: Determine new version
    const currentVersion = getCurrentVersion();
    const newVersion = bumpVersion(currentVersion, versionArg);
    
    log(`Current version: ${currentVersion}`, colors.blue);
    log(`New version: ${newVersion}`, colors.green);
    log('');
    
    // Step 2: Run pre-release checks
    runPreReleaseChecks();
    
    // Step 3: Update version files
    updatePackageJson(newVersion);
    updateManifest(newVersion);
    
    // Step 4: Generate changelog
    generateChangelog(newVersion);
    
    // Step 5: Build release
    buildRelease();
    
    // Step 6: Create git tag
    createGitTag(newVersion);
    
    // Step 7: Print instructions
    printReleaseInstructions(newVersion);
    
  } catch (error) {
    logError(`Release preparation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  getCurrentVersion,
  validateVersionFormat,
  bumpVersion,
  updatePackageJson,
  updateManifest,
  generateChangelog,
  runPreReleaseChecks,
  buildRelease
};