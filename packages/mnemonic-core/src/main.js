/**
 * Main Entry Point - Brains Memory System v2.0
 * Domain-Driven Design Architecture
 */

const BrainsApplication = require('./BrainsApplication');
const ConfigurationManager = require('./infrastructure/configuration/ConfigurationManager');

async function main() {
  try {
    console.log('🧠 Brains Memory System v2.0 - Starting...');
    console.log('📐 Architecture: Domain-Driven Design');
    console.log('🏗️ Implementation: Layered Architecture with CQRS');
    
    // Initialize configuration
    const configManager = new ConfigurationManager();
    const config = configManager.getAll();
    
    console.log('⚙️  Configuration loaded');
    console.log(`   - Server: ${config.server.host}:${config.server.port}`);
    console.log(`   - Security: ${config.security.enableAuth ? 'Enabled' : 'Disabled'}`);
    console.log(`   - Monitoring: ${config.monitoring.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`   - Memory Engine: ${config.memoryEngine.type}`);
    
    // Validate configuration
    const validationErrors = configManager.validate();
    if (validationErrors.length > 0) {
      console.error('❌ Configuration validation failed:');
      validationErrors.forEach(error => console.error(`   - ${error}`));
      process.exit(1);
    }
    
    // Create and initialize application
    const app = new BrainsApplication(config);
    await app.initialize();
    
    console.log('✅ Application initialized successfully');
    
    // Start server
    const port = config.server.port || 8081;
    const server = await app.start(port);
    
    console.log(`🚀 Server started on port ${port}`);
    console.log(`📡 API v2: http://localhost:${port}/api/v2`);
    console.log(`🔍 Health Check: http://localhost:${port}/health`);
    console.log(`📊 Metrics: http://localhost:${port}/metrics`);
    console.log(`📖 Documentation: http://localhost:${port}/api/v2/docs`);
    
    // Graceful shutdown handling
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
        
        // Shutdown application services
        const eventBus = app.getEventBus();
        if (eventBus) {
          await eventBus.shutdown();
          console.log('✅ Event bus shutdown');
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
    
    console.log('🎯 Brains Memory System v2.0 is ready!');
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}

module.exports = main;