#ifndef DOMAIN_ENGINE_H
#define DOMAIN_ENGINE_H

#include "memory_engine.h"
#include <functional>
#include <queue>
#include <thread>
#include <condition_variable>

namespace brains {

/**
 * @brief Domain Event structure for event-driven architecture
 */
struct DomainEvent {
    std::string id;
    std::string aggregate_id;
    std::string event_type;
    std::string event_data;  // JSON payload
    std::chrono::system_clock::time_point timestamp;
    int version;
    
    DomainEvent(const std::string& agg_id, const std::string& type, const std::string& data)
        : aggregate_id(agg_id), event_type(type), event_data(data), version(1) {
        timestamp = std::chrono::system_clock::now();
        id = generateEventId();
    }
    
private:
    std::string generateEventId() const;
};

/**
 * @brief Event handler function type
 */
using EventHandler = std::function<void(const DomainEvent&)>;

/**
 * @brief High-performance event bus for domain events
 */
class EventBus {
private:
    std::unordered_map<std::string, std::vector<EventHandler>> handlers;
    std::queue<DomainEvent> event_queue;
    std::mutex queue_mutex;
    std::condition_variable queue_cv;
    std::atomic<bool> running{false};
    std::thread processor_thread;
    
    void processEvents();
    
public:
    EventBus();
    ~EventBus();
    
    /**
     * @brief Subscribe to domain events
     */
    void subscribe(const std::string& event_type, EventHandler handler);
    
    /**
     * @brief Publish domain event
     */
    void publish(const DomainEvent& event);
    
    /**
     * @brief Start event processing
     */
    void start();
    
    /**
     * @brief Stop event processing
     */
    void stop();
    
    /**
     * @brief Get event statistics
     */
    std::string getStatistics() const;
};

/**
 * @brief Aggregate root base class for DDD entities
 */
class AggregateRoot {
protected:
    std::string id;
    int version;
    std::vector<DomainEvent> uncommitted_events;
    
public:
    AggregateRoot(const std::string& aggregate_id) : id(aggregate_id), version(0) {}
    virtual ~AggregateRoot() = default;
    
    const std::string& getId() const { return id; }
    int getVersion() const { return version; }
    
    /**
     * @brief Get uncommitted events and clear them
     */
    std::vector<DomainEvent> getUncommittedEvents();
    
    /**
     * @brief Mark events as committed
     */
    void markEventsAsCommitted();
    
protected:
    /**
     * @brief Raise a domain event
     */
    void raiseEvent(const std::string& event_type, const std::string& event_data);
    
    /**
     * @brief Apply event to aggregate state
     */
    virtual void applyEvent(const DomainEvent& event) = 0;
};

/**
 * @brief Memory Entry aggregate with DDD patterns
 */
class MemoryEntryAggregate : public AggregateRoot {
private:
    std::string problem;
    std::string solution;
    std::string category;
    std::chrono::system_clock::time_point created_at;
    std::chrono::system_clock::time_point updated_at;
    double confidence_score;
    std::vector<std::string> conflict_ids;
    
public:
    MemoryEntryAggregate(const std::string& entry_id, const std::string& prob, 
                        const std::string& sol, const std::string& cat);
    
    /**
     * @brief Create new memory entry
     */
    static std::unique_ptr<MemoryEntryAggregate> create(const std::string& problem,
                                                       const std::string& solution,
                                                       const std::string& category);
    
    /**
     * @brief Update solution with business rules
     */
    void updateSolution(const std::string& new_solution, const std::string& reason);
    
    /**
     * @brief Add conflict resolution
     */
    void addConflict(const std::string& conflict_id, const std::string& strategy);
    
    /**
     * @brief Set confidence score
     */
    void setConfidence(double score);
    
    // Getters
    const std::string& getProblem() const { return problem; }
    const std::string& getSolution() const { return solution; }
    const std::string& getCategory() const { return category; }
    double getConfidenceScore() const { return confidence_score; }
    bool hasConflicts() const { return !conflict_ids.empty(); }
    
protected:
    void applyEvent(const DomainEvent& event) override;
    
private:
    std::string generateEntryId() const;
};

/**
 * @brief Search Session aggregate for retrieval intelligence
 */
class SearchSessionAggregate : public AggregateRoot {
private:
    std::string query;
    std::vector<std::string> layers_used;
    std::vector<std::string> result_ids;
    std::chrono::system_clock::time_point started_at;
    std::chrono::system_clock::time_point completed_at;
    double final_confidence;
    std::string session_status; // active, completed, failed, timeout
    
public:
    SearchSessionAggregate(const std::string& session_id, const std::string& search_query);
    
    /**
     * @brief Create new search session
     */
    static std::unique_ptr<SearchSessionAggregate> create(const std::string& query);
    
    /**
     * @brief Add search layer
     */
    void addLayer(const std::string& layer_type);
    
    /**
     * @brief Add search result
     */
    void addResult(const std::string& result_id, double confidence);
    
    /**
     * @brief Complete search session
     */
    void complete(double final_conf);
    
    /**
     * @brief Fail search session
     */
    void fail(const std::string& reason);
    
    // Getters
    const std::string& getQuery() const { return query; }
    const std::vector<std::string>& getLayersUsed() const { return layers_used; }
    const std::string& getStatus() const { return session_status; }
    double getFinalConfidence() const { return final_confidence; }
    
protected:
    void applyEvent(const DomainEvent& event) override;
    
private:
    std::string generateSessionId() const;
};

/**
 * @brief Domain-driven memory engine with event sourcing
 */
class DomainMemoryEngine : public EnhancedMemoryEngine {
private:
    std::unique_ptr<EventBus> event_bus;
    std::unordered_map<std::string, std::unique_ptr<MemoryEntryAggregate>> memory_aggregates;
    std::unordered_map<std::string, std::unique_ptr<SearchSessionAggregate>> search_aggregates;
    mutable std::shared_mutex domain_mutex;
    
    // Event handlers
    void handleMemoryEntryCreated(const DomainEvent& event);
    void handleMemoryEntryUpdated(const DomainEvent& event);
    void handleSearchSessionStarted(const DomainEvent& event);
    void handleSearchSessionCompleted(const DomainEvent& event);
    
public:
    DomainMemoryEngine();
    ~DomainMemoryEngine();
    
    /**
     * @brief Initialize with event handlers
     */
    bool initializeDomain(const std::unordered_map<std::string, std::vector<std::string>>& categories);
    
    /**
     * @brief Create memory entry using domain aggregate
     */
    std::string createMemoryEntry(const std::string& problem, 
                                 const std::string& solution,
                                 const std::string& category);
    
    /**
     * @brief Update memory entry through aggregate
     */
    bool updateMemoryEntry(const std::string& entry_id, 
                          const std::string& new_solution,
                          const std::string& reason);
    
    /**
     * @brief Start search session
     */
    std::string startSearchSession(const std::string& query);
    
    /**
     * @brief Add layer to search session
     */
    bool addSearchLayer(const std::string& session_id, const std::string& layer_type);
    
    /**
     * @brief Complete search session
     */
    bool completeSearchSession(const std::string& session_id, double confidence);
    
    /**
     * @brief Get memory entry aggregate
     */
    const MemoryEntryAggregate* getMemoryEntry(const std::string& entry_id) const;
    
    /**
     * @brief Get search session aggregate
     */
    const SearchSessionAggregate* getSearchSession(const std::string& session_id) const;
    
    /**
     * @brief Enhanced search with domain aggregates
     */
    std::string searchWithContext(const std::string& problem,
                                 const std::string& context = "",
                                 int max_results = 5) const;
    
    /**
     * @brief Get domain statistics
     */
    std::string getDomainStatistics() const;
    
    /**
     * @brief Subscribe to domain events
     */
    void subscribeToEvents(const std::string& event_type, EventHandler handler);
    
private:
    void commitAggregateEvents(AggregateRoot& aggregate);
    std::string generateAggregateId(const std::string& prefix) const;
};

/**
 * @brief Repository interface for persistence abstraction
 */
template<typename T>
class Repository {
public:
    virtual ~Repository() = default;
    virtual void save(const T& aggregate) = 0;
    virtual std::unique_ptr<T> findById(const std::string& id) = 0;
    virtual std::vector<std::unique_ptr<T>> findAll() = 0;
    virtual void remove(const std::string& id) = 0;
};

/**
 * @brief Memory entry repository
 */
class MemoryEntryRepository : public Repository<MemoryEntryAggregate> {
private:
    std::unordered_map<std::string, std::unique_ptr<MemoryEntryAggregate>> entries;
    mutable std::shared_mutex repo_mutex;
    
public:
    void save(const MemoryEntryAggregate& aggregate) override;
    std::unique_ptr<MemoryEntryAggregate> findById(const std::string& id) override;
    std::vector<std::unique_ptr<MemoryEntryAggregate>> findAll() override;
    void remove(const std::string& id) override;
    
    /**
     * @brief Find by category
     */
    std::vector<std::unique_ptr<MemoryEntryAggregate>> findByCategory(const std::string& category);
    
    /**
     * @brief Search by problem text
     */
    std::vector<std::unique_ptr<MemoryEntryAggregate>> searchByProblem(const std::string& query);
};

/**
 * @brief Application service for memory operations
 */
class MemoryApplicationService {
private:
    std::unique_ptr<DomainMemoryEngine> domain_engine;
    std::unique_ptr<MemoryEntryRepository> memory_repository;
    
public:
    MemoryApplicationService();
    ~MemoryApplicationService();
    
    /**
     * @brief Initialize service
     */
    bool initialize(const std::unordered_map<std::string, std::vector<std::string>>& categories);
    
    /**
     * @brief Create memory entry
     */
    std::string createMemoryEntry(const std::string& problem,
                                 const std::string& solution,
                                 const std::string& category);
    
    /**
     * @brief Update memory entry
     */
    bool updateMemoryEntry(const std::string& entry_id,
                          const std::string& new_solution,
                          const std::string& reason);
    
    /**
     * @brief Search memories
     */
    std::string searchMemories(const std::string& query,
                              const std::string& category = "",
                              int max_results = 10);
    
    /**
     * @brief Get memory entry
     */
    std::string getMemoryEntry(const std::string& entry_id);
    
    /**
     * @brief Get service statistics
     */
    std::string getStatistics();
    
    /**
     * @brief Subscribe to domain events for external integrations
     */
    void subscribeToEvents(const std::string& event_type, EventHandler handler);
};

} // namespace brains

#endif // DOMAIN_ENGINE_H