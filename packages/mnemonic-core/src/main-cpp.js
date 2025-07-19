/**
 * Main Entry Point - Mnemonic C++ Core with JS API Layer
 * Production-focused architecture leveraging C++ domain engine
 * NZ-developed high-performance memory system
 */

const fs = require('fs');
const yaml = require('js-yaml');
const ApiServer = require('./ApiServer');

async function loadConfiguration() {
  const config = {
    server: {
      port: parseInt(process.env.MNEMONIC_PORT) || 8081,
      enableAuth: process.env.MNEMONIC_ENABLE_AUTH !== 'false',
      apiKeys: process.env.MNEMONIC_API_KEYS ? process.env.MNEMONIC_API_KEYS.split(',') : []
    },
    categories: {}
  };

  // Load categories from YAML
  try {
    if (fs.existsSync('./error_categories.yaml')) {
      const categoriesData = yaml.load(fs.readFileSync('./error_categories.yaml', 'utf8'));
      config.categories = categoriesData.error_categories || {};
      console.log('✅ Categories loaded from error_categories.yaml');
    } else {
      console.log('ℹ️  Using default categories (error_categories.yaml not found)');
    }
  } catch (error) {
    console.warn('⚠️  Failed to load categories:', error.message);
  }

  return config;
}

async function main() {
  try {
    console.log('🧠 Brains Memory System v2.0 - C++ Core + JS API');
    console.log('🏗️  Architecture: C++ Domain Engine with JavaScript API Layer');
    console.log('⚡ Performance: Native C++ for all domain operations');
    
    // Load configuration
    const config = await loadConfiguration();
    
    console.log('⚙️  Configuration:');
    console.log(`   - Server Port: ${config.server.port}`);
    console.log(`   - Authentication: ${config.server.enableAuth ? 'Enabled' : 'Disabled'}`);
    console.log(`   - API Keys: ${config.server.apiKeys.length} configured`);
    console.log(`   - Categories: ${Object.keys(config.categories).length} loaded`);
    
    // Initialize API server with C++ bridge
    const apiServer = new ApiServer({
      port: config.server.port,
      enableAuth: config.server.enableAuth,
      apiKeys: config.server.apiKeys
    });
    
    // Initialize C++ domain engine
    console.log('🔧 Initializing C++ domain engine...');
    await apiServer.initialize(config.categories);
    
    // Start server
    console.log('🚀 Starting API server...');
    const server = await apiServer.start();
    
    console.log('✅ Brains Memory System is ready!');
    console.log(`📡 API Server: http://localhost:${config.server.port}`);
    console.log(`🔍 Health Check: http://localhost:${config.server.port}/health`);
    console.log(`📊 Statistics: http://localhost:${config.server.port}/api/statistics`);
    console.log(`📖 Memory API: http://localhost:${config.server.port}/api/memory/entries`);
    
    // Test C++ engine
    console.log('🧪 Testing C++ engine...');
    const bridge = apiServer.getBridge();
    
    // Create test entry
    const testEntryId = bridge.createMemoryEntry(
      'Test problem for C++ engine',
      'Test solution from C++ domain engine',
      'general'
    );
    
    if (testEntryId) {
      console.log(`✅ C++ engine test passed - Entry ID: ${testEntryId}`);
      
      // Test search
      const searchResults = bridge.searchMemories('Test problem');
      console.log(`✅ Search test passed - Found ${searchResults.length} results`);
    } else {
      console.log('❌ C++ engine test failed');
    }
    
    // Display performance statistics
    const stats = bridge.getStatistics();
    console.log('📈 Engine Statistics:', JSON.stringify(stats, null, 2));
    
    // Setup graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        // Close server
        if (server) {
          await new Promise((resolve) => {
            server.close(resolve);
          });
          console.log('✅ HTTP server closed');
        }
        
        console.log('🎉 Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
    
  } catch (error) {
    console.error('❌ Failed to start Brains Memory System:', error);
    
    if (error.message.includes('Cannot find module')) {
      console.error('');
      console.error('🔧 C++ Engine Setup Required:');
      console.error('   1. Install build dependencies: npm install');
      console.error('   2. Build C++ addon: npm run build-addon');
      console.error('   3. Test C++ addon: npm run test-addon');
      console.error('');
      console.error('   Alternative: Use JavaScript fallback with npm run start:legacy');
    }
    
    process.exit(1);
  }
}

// Enhanced error handling for C++ addon issues
process.on('uncaughtException', (error) => {
  if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('native')) {
    console.error('❌ C++ addon not available. Please build the native addon first:');
    console.error('   npm run build-addon');
    console.error('   Or use legacy JavaScript mode: npm run start:legacy');
  } else {
    console.error('❌ Uncaught Exception:', error);
  }
  process.exit(1);
});

// Run the application
if (require.main === module) {
  main();
}

module.exports = main;