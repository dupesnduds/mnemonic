/**
 * Event Bus - Simple event bus implementation for domain events
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners for complex applications
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.started = new Date();
  }

  // Override emit to add event history tracking
  emit(eventName, eventData) {
    const event = {
      name: eventName,
      data: eventData,
      timestamp: new Date(),
      id: this.generateEventId()
    };

    // Add to history
    this.addToHistory(event);

    // Log event
    console.log(`[EventBus] Event emitted: ${eventName}`, { id: event.id, timestamp: event.timestamp });

    // Emit the event
    return super.emit(eventName, eventData);
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  addToHistory(event) {
    this.eventHistory.push(event);
    
    // Keep history size under control
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  // Get event history
  getEventHistory(limit = 50) {
    return this.eventHistory.slice(-limit);
  }

  // Get events by name
  getEventsByName(eventName, limit = 50) {
    return this.eventHistory
      .filter(event => event.name === eventName)
      .slice(-limit);
  }

  // Get events in time range
  getEventsByTimeRange(startTime, endTime) {
    return this.eventHistory.filter(event => {
      return event.timestamp >= startTime && event.timestamp <= endTime;
    });
  }

  // Clear event history
  clearHistory() {
    this.eventHistory = [];
  }

  // Get statistics
  getStatistics() {
    const stats = {
      totalEvents: this.eventHistory.length,
      uptime: Date.now() - this.started.getTime(),
      eventTypes: {},
      recentEvents: this.getEventHistory(10)
    };

    // Count events by type
    this.eventHistory.forEach(event => {
      stats.eventTypes[event.name] = (stats.eventTypes[event.name] || 0) + 1;
    });

    return stats;
  }

  // Health check
  async healthCheck() {
    const stats = this.getStatistics();
    
    return {
      status: 'healthy',
      message: 'Event bus is operational',
      statistics: {
        totalEvents: stats.totalEvents,
        eventTypes: Object.keys(stats.eventTypes).length,
        uptime: `${Math.round(stats.uptime / 1000)}s`,
        listeners: this.eventNames().length
      },
      timestamp: new Date().toISOString()
    };
  }

  // Domain event helper methods
  publishDomainEvent(eventType, aggregateId, eventData) {
    const domainEvent = {
      type: eventType,
      aggregateId: aggregateId,
      data: eventData,
      timestamp: new Date(),
      version: 1
    };

    this.emit('domain.event', domainEvent);
    this.emit(`domain.${eventType}`, domainEvent);
    
    return domainEvent;
  }

  subscribeToDomainEvents(eventType, handler) {
    this.on(`domain.${eventType}`, handler);
  }

  // Integration event helper methods
  publishIntegrationEvent(eventType, service, eventData) {
    const integrationEvent = {
      type: eventType,
      service: service,
      data: eventData,
      timestamp: new Date(),
      correlationId: eventData.correlationId || this.generateEventId()
    };

    this.emit('integration.event', integrationEvent);
    this.emit(`integration.${eventType}`, integrationEvent);
    
    return integrationEvent;
  }

  subscribeToIntegrationEvents(eventType, handler) {
    this.on(`integration.${eventType}`, handler);
  }

  // Async event handling with error handling
  async emitAsync(eventName, eventData) {
    return new Promise((resolve, reject) => {
      try {
        const result = this.emit(eventName, eventData);
        resolve(result);
      } catch (error) {
        console.error(`[EventBus] Error emitting event ${eventName}:`, error);
        reject(error);
      }
    });
  }

  // Batch event processing
  emitBatch(events) {
    const results = [];
    
    for (const event of events) {
      try {
        const result = this.emit(event.name, event.data);
        results.push({ success: true, eventName: event.name, result });
      } catch (error) {
        console.error(`[EventBus] Error in batch emit for ${event.name}:`, error);
        results.push({ success: false, eventName: event.name, error: error.message });
      }
    }
    
    return results;
  }

  // Event middleware support
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    
    const originalEmit = this.emit;
    
    this.emit = (eventName, eventData) => {
      return middleware(eventName, eventData, (name, data) => {
        return originalEmit.call(this, name || eventName, data || eventData);
      });
    };
  }

  // Remove all listeners for cleanup
  removeAllListeners(eventName) {
    console.log(`[EventBus] Removing all listeners for ${eventName || 'all events'}`);
    return super.removeAllListeners(eventName);
  }

  // Safe shutdown
  async shutdown() {
    console.log('[EventBus] Shutting down event bus...');
    
    // Clear all listeners
    this.removeAllListeners();
    
    // Clear history
    this.clearHistory();
    
    console.log('[EventBus] Event bus shutdown complete');
  }
}

module.exports = EventBus;