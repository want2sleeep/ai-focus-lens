// Simple test to verify CDP integration works
import { createCDPInterface, CDPUtils } from './cdp-interface';
import { createKeyboardInteractionSimulator } from './keyboard-interaction';
import { createMouseTouchInteractionSimulator } from './mouse-touch-interaction';
import { createAccessibilityTestingAgent } from './agent-integration';

/**
 * Test CDP integration functionality
 */
export async function testCDPIntegration(): Promise<boolean> {
  try {
    console.log('Testing CDP integration...');

    // Test CDP availability
    const cdpAvailable = CDPUtils.isCDPAvailable();
    console.log('CDP Available:', cdpAvailable);

    if (!cdpAvailable) {
      console.log('CDP not available in this environment');
      return false;
    }

    // Test CDP interface creation
    const cdpInterface = createCDPInterface();
    console.log('CDP Interface created successfully');

    // Test simulator creation
    const keyboardSimulator = createKeyboardInteractionSimulator(cdpInterface);
    const mouseTouchSimulator = createMouseTouchInteractionSimulator(cdpInterface);
    console.log('Simulators created successfully');

    // Test agent creation
    const agent = createAccessibilityTestingAgent();
    console.log('Agent created successfully');

    // Test agent status (should be uninitialized)
    const status = agent.getStatus();
    console.log('Agent status:', status);

    console.log('CDP integration test completed successfully');
    return true;

  } catch (error) {
    console.error('CDP integration test failed:', error);
    return false;
  }
}

/**
 * Test agent capabilities detection
 */
export async function testAgentCapabilities(): Promise<void> {
  try {
    console.log('Testing agent capabilities...');

    // Check debugger permission
    const hasPermission = await CDPUtils.hasDebuggerPermission();
    console.log('Has debugger permission:', hasPermission);

    // Get active tab
    const activeTab = await CDPUtils.getActiveTab();
    console.log('Active tab:', activeTab?.url);

    if (activeTab) {
      const isValidTab = CDPUtils.isValidTabForCDP(activeTab);
      console.log('Tab valid for CDP:', isValidTab);
    }

  } catch (error) {
    console.error('Agent capabilities test failed:', error);
  }
}

// Export test functions
export { testCDPIntegration as default };