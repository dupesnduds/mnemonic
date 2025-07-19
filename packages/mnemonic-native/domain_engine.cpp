#include "domain_engine.h"
#include <sstream>
#include <iomanip>
#include <random>
#include <json/json.h>

namespace brains {

// DomainEvent Implementation
std::string DomainEvent::generateEventId() const {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(0, 15);
    static const char* chars = "0123456789ABCDEF";
    
    std::string id = "evt_";
    for (int i = 0; i < 16; ++i) {
        id += chars[dis(gen)];
    }
    return id;
}

// EventBus Implementation
EventBus::EventBus() = default;

EventBus::~EventBus() {
    stop();
}

void EventBus::subscribe(const std::string& event_type, EventHandler handler) {
    std::lock_guard<std::mutex> lock(queue_mutex);
    handlers[event_type].push_back(std::move(handler));
}

void EventBus::publish(const DomainEvent& event) {
    {
        std::lock_guard<std::mutex> lock(queue_mutex);
        event_queue.push(event);
    }
    queue_cv.notify_one();
}

void EventBus::start() {
    if (running.load()) return;
    
    running.store(true);
    processor_thread = std::thread(&EventBus::processEvents, this);
}

void EventBus::stop() {
    if (!running.load()) return;
    
    running.store(false);
    queue_cv.notify_all();
    
    if (processor_thread.joinable()) {
        processor_thread.join();
    }
}

void EventBus::processEvents() {
    while (running.load()) {
        std::unique_lock<std::mutex> lock(queue_mutex);
        queue_cv.wait(lock, [this] { return !event_queue.empty() || !running.load(); });
        
        while (!event_queue.empty()) {
            DomainEvent event = event_queue.front();
            event_queue.pop();
            lock.unlock();
            
            // Process event with handlers
            auto it = handlers.find(event.event_type);
            if (it != handlers.end()) {
                for (const auto& handler : it->second) {
                    try {
                        handler(event);
                    } catch (const std::exception& e) {
                        // Log error but continue processing
                        // In production, use proper logging
                    }
                }
            }
            
            lock.lock();
        }
    }
}

std::string EventBus::getStatistics() const {
    Json::Value stats;
    stats["total_handlers"] = static_cast<int>(handlers.size());
    stats["queue_size"] = static_cast<int>(event_queue.size());
    stats["is_running"] = running.load();
    
    Json::StreamWriterBuilder builder;
    return Json::writeString(builder, stats);
}

// AggregateRoot Implementation
std::vector<DomainEvent> AggregateRoot::getUncommittedEvents() {
    auto events = std::move(uncommitted_events);
    uncommitted_events.clear();
    return events;
}

void AggregateRoot::markEventsAsCommitted() {
    uncommitted_events.clear();
}

void AggregateRoot::raiseEvent(const std::string& event_type, const std::string& event_data) {
    DomainEvent event(id, event_type, event_data);
    event.version = ++version;
    
    uncommitted_events.push_back(event);
    applyEvent(event);
}

// MemoryEntryAggregate Implementation
MemoryEntryAggregate::MemoryEntryAggregate(const std::string& entry_id, const std::string& prob,
                                         const std::string& sol, const std::string& cat)
    : AggregateRoot(entry_id), problem(prob), solution(sol), category(cat), confidence_score(0.0) {
    created_at = std::chrono::system_clock::now();
    updated_at = created_at;
}

std::unique_ptr<MemoryEntryAggregate> MemoryEntryAggregate::create(const std::string& problem,
                                                                  const std::string& solution,
                                                                  const std::string& category) {
    auto entry_id = "mem_" + std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count());
    
    auto aggregate = std::make_unique<MemoryEntryAggregate>(entry_id, problem, solution, category);
    
    Json::Value event_data;
    event_data["problem"] = problem;
    event_data["solution"] = solution;
    event_data["category"] = category;
    
    Json::StreamWriterBuilder builder;
    aggregate->raiseEvent("MemoryEntryCreated", Json::writeString(builder, event_data));
    
    return aggregate;
}

void MemoryEntryAggregate::updateSolution(const std::string& new_solution, const std::string& reason) {
    std::string old_solution = solution;
    solution = new_solution;
    updated_at = std::chrono::system_clock::now();
    
    Json::Value event_data;
    event_data["old_solution"] = old_solution;
    event_data["new_solution"] = new_solution;
    event_data["reason"] = reason;
    
    Json::StreamWriterBuilder builder;
    raiseEvent("MemoryEntryUpdated", Json::writeString(builder, event_data));
}

void MemoryEntryAggregate::addConflict(const std::string& conflict_id, const std::string& strategy) {
    conflict_ids.push_back(conflict_id);
    
    Json::Value event_data;
    event_data["conflict_id"] = conflict_id;
    event_data["strategy"] = strategy;
    event_data["total_conflicts"] = static_cast<int>(conflict_ids.size());
    
    Json::StreamWriterBuilder builder;
    raiseEvent("ConflictDetected", Json::writeString(builder, event_data));
}

void MemoryEntryAggregate::setConfidence(double score) {
    double old_score = confidence_score;
    confidence_score = score;
    
    Json::Value event_data;
    event_data["old_confidence"] = old_score;
    event_data["new_confidence"] = score;
    
    Json::StreamWriterBuilder builder;
    raiseEvent("ConfidenceUpdated", Json::writeString(builder, event_data));
}

void MemoryEntryAggregate::applyEvent(const DomainEvent& event) {
    // Event replay for aggregate reconstruction
    Json::Reader reader;
    Json::Value data;
    reader.parse(event.event_data, data);
    
    if (event.event_type == "MemoryEntryCreated") {
        // State already set in constructor
    } else if (event.event_type == "MemoryEntryUpdated") {
        solution = data["new_solution"].asString();
        updated_at = event.timestamp;
    } else if (event.event_type == "ConflictDetected") {
        std::string conflict_id = data["conflict_id"].asString();
        if (std::find(conflict_ids.begin(), conflict_ids.end(), conflict_id) == conflict_ids.end()) {
            conflict_ids.push_back(conflict_id);
        }
    } else if (event.event_type == "ConfidenceUpdated") {
        confidence_score = data["new_confidence"].asDouble();
    }
}

// SearchSessionAggregate Implementation
SearchSessionAggregate::SearchSessionAggregate(const std::string& session_id, const std::string& search_query)
    : AggregateRoot(session_id), query(search_query), final_confidence(0.0), session_status("active") {
    started_at = std::chrono::system_clock::now();
}

std::unique_ptr<SearchSessionAggregate> SearchSessionAggregate::create(const std::string& query) {
    auto session_id = "search_" + std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count());
    
    auto aggregate = std::make_unique<SearchSessionAggregate>(session_id, query);
    
    Json::Value event_data;
    event_data["query"] = query;
    event_data["started_at"] = std::chrono::duration_cast<std::chrono::seconds>(
        aggregate->started_at.time_since_epoch()).count();
    
    Json::StreamWriterBuilder builder;
    aggregate->raiseEvent("SearchSessionStarted", Json::writeString(builder, event_data));
    
    return aggregate;
}

void SearchSessionAggregate::addLayer(const std::string& layer_type) {
    layers_used.push_back(layer_type);
    
    Json::Value event_data;
    event_data["layer_type"] = layer_type;
    event_data["layer_order"] = static_cast<int>(layers_used.size());
    
    Json::StreamWriterBuilder builder;
    raiseEvent("LayerAdded", Json::writeString(builder, event_data));
}

void SearchSessionAggregate::addResult(const std::string& result_id, double confidence) {
    result_ids.push_back(result_id);
    
    Json::Value event_data;
    event_data["result_id"] = result_id;
    event_data["confidence"] = confidence;
    event_data["total_results"] = static_cast<int>(result_ids.size());
    
    Json::StreamWriterBuilder builder;
    raiseEvent("ResultAdded", Json::writeString(builder, event_data));
}

void SearchSessionAggregate::complete(double final_conf) {
    session_status = "completed";
    final_confidence = final_conf;
    completed_at = std::chrono::system_clock::now();
    
    Json::Value event_data;
    event_data["final_confidence"] = final_conf;
    event_data["duration_ms"] = std::chrono::duration_cast<std::chrono::milliseconds>(
        completed_at - started_at).count();
    event_data["layers_used"] = static_cast<int>(layers_used.size());
    event_data["results_found"] = static_cast<int>(result_ids.size());
    
    Json::StreamWriterBuilder builder;
    raiseEvent("SearchSessionCompleted", Json::writeString(builder, event_data));
}

void SearchSessionAggregate::fail(const std::string& reason) {
    session_status = "failed";
    completed_at = std::chrono::system_clock::now();
    
    Json::Value event_data;
    event_data["reason"] = reason;
    event_data["duration_ms"] = std::chrono::duration_cast<std::chrono::milliseconds>(
        completed_at - started_at).count();
    
    Json::StreamWriterBuilder builder;
    raiseEvent("SearchSessionFailed", Json::writeString(builder, event_data));
}

void SearchSessionAggregate::applyEvent(const DomainEvent& event) {
    Json::Reader reader;
    Json::Value data;
    reader.parse(event.event_data, data);
    
    if (event.event_type == "SearchSessionStarted") {
        // State already set in constructor
    } else if (event.event_type == "LayerAdded") {
        std::string layer_type = data["layer_type"].asString();
        if (std::find(layers_used.begin(), layers_used.end(), layer_type) == layers_used.end()) {
            layers_used.push_back(layer_type);
        }
    } else if (event.event_type == "ResultAdded") {
        std::string result_id = data["result_id"].asString();
        if (std::find(result_ids.begin(), result_ids.end(), result_id) == result_ids.end()) {
            result_ids.push_back(result_id);
        }
    } else if (event.event_type == "SearchSessionCompleted") {
        session_status = "completed";
        final_confidence = data["final_confidence"].asDouble();
        completed_at = event.timestamp;
    } else if (event.event_type == "SearchSessionFailed") {
        session_status = "failed";
        completed_at = event.timestamp;
    }
}

// DomainMemoryEngine Implementation
DomainMemoryEngine::DomainMemoryEngine() : event_bus(std::make_unique<EventBus>()) {}

DomainMemoryEngine::~DomainMemoryEngine() {
    if (event_bus) {
        event_bus->stop();
    }
}

bool DomainMemoryEngine::initializeDomain(const std::unordered_map<std::string, std::vector<std::string>>& categories) {
    // Initialize base engine
    if (!EnhancedMemoryEngine::initialize(categories)) {
        return false;
    }
    
    // Subscribe to domain events
    event_bus->subscribe("MemoryEntryCreated", 
        [this](const DomainEvent& event) { handleMemoryEntryCreated(event); });
    event_bus->subscribe("MemoryEntryUpdated", 
        [this](const DomainEvent& event) { handleMemoryEntryUpdated(event); });
    event_bus->subscribe("SearchSessionStarted", 
        [this](const DomainEvent& event) { handleSearchSessionStarted(event); });
    event_bus->subscribe("SearchSessionCompleted", 
        [this](const DomainEvent& event) { handleSearchSessionCompleted(event); });
    
    event_bus->start();
    return true;
}

std::string DomainMemoryEngine::createMemoryEntry(const std::string& problem,
                                                  const std::string& solution,
                                                  const std::string& category) {
    auto aggregate = MemoryEntryAggregate::create(problem, solution, category);
    std::string entry_id = aggregate->getId();
    
    {
        std::unique_lock<std::shared_mutex> lock(domain_mutex);
        commitAggregateEvents(*aggregate);
        memory_aggregates[entry_id] = std::move(aggregate);
    }
    
    // Also store in base engine for compatibility
    storeSolution(problem, category, solution, false);
    
    return entry_id;
}

bool DomainMemoryEngine::updateMemoryEntry(const std::string& entry_id,
                                          const std::string& new_solution,
                                          const std::string& reason) {
    std::unique_lock<std::shared_mutex> lock(domain_mutex);
    
    auto it = memory_aggregates.find(entry_id);
    if (it == memory_aggregates.end()) {
        return false;
    }
    
    it->second->updateSolution(new_solution, reason);
    commitAggregateEvents(*it->second);
    
    return true;
}

std::string DomainMemoryEngine::startSearchSession(const std::string& query) {
    auto aggregate = SearchSessionAggregate::create(query);
    std::string session_id = aggregate->getId();
    
    {
        std::unique_lock<std::shared_mutex> lock(domain_mutex);
        commitAggregateEvents(*aggregate);
        search_aggregates[session_id] = std::move(aggregate);
    }
    
    return session_id;
}

bool DomainMemoryEngine::addSearchLayer(const std::string& session_id, const std::string& layer_type) {
    std::unique_lock<std::shared_mutex> lock(domain_mutex);
    
    auto it = search_aggregates.find(session_id);
    if (it == search_aggregates.end()) {
        return false;
    }
    
    it->second->addLayer(layer_type);
    commitAggregateEvents(*it->second);
    
    return true;
}

bool DomainMemoryEngine::completeSearchSession(const std::string& session_id, double confidence) {
    std::unique_lock<std::shared_mutex> lock(domain_mutex);
    
    auto it = search_aggregates.find(session_id);
    if (it == search_aggregates.end()) {
        return false;
    }
    
    it->second->complete(confidence);
    commitAggregateEvents(*it->second);
    
    return true;
}

const MemoryEntryAggregate* DomainMemoryEngine::getMemoryEntry(const std::string& entry_id) const {
    std::shared_lock<std::shared_mutex> lock(domain_mutex);
    
    auto it = memory_aggregates.find(entry_id);
    return (it != memory_aggregates.end()) ? it->second.get() : nullptr;
}

const SearchSessionAggregate* DomainMemoryEngine::getSearchSession(const std::string& session_id) const {
    std::shared_lock<std::shared_mutex> lock(domain_mutex);
    
    auto it = search_aggregates.find(session_id);
    return (it != search_aggregates.end()) ? it->second.get() : nullptr;
}

std::string DomainMemoryEngine::searchWithContext(const std::string& problem,
                                                  const std::string& context,
                                                  int max_results) const {
    // Use enhanced search capabilities from base class
    return getSuggestions(problem, context);
}

std::string DomainMemoryEngine::getDomainStatistics() const {
    Json::Value stats;
    
    {
        std::shared_lock<std::shared_mutex> lock(domain_mutex);
        stats["memory_entries"] = static_cast<int>(memory_aggregates.size());
        stats["search_sessions"] = static_cast<int>(search_aggregates.size());
    }
    
    // Add base engine statistics
    Json::Reader reader;
    Json::Value base_stats;
    reader.parse(getStatistics(), base_stats);
    stats["engine_stats"] = base_stats;
    
    // Add event bus statistics
    Json::Value event_stats;
    reader.parse(event_bus->getStatistics(), event_stats);
    stats["event_stats"] = event_stats;
    
    Json::StreamWriterBuilder builder;
    return Json::writeString(builder, stats);
}

void DomainMemoryEngine::subscribeToEvents(const std::string& event_type, EventHandler handler) {
    event_bus->subscribe(event_type, std::move(handler));
}

void DomainMemoryEngine::commitAggregateEvents(AggregateRoot& aggregate) {
    auto events = aggregate.getUncommittedEvents();
    for (const auto& event : events) {
        event_bus->publish(event);
    }
    aggregate.markEventsAsCommitted();
}

std::string DomainMemoryEngine::generateAggregateId(const std::string& prefix) const {
    return prefix + "_" + std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count());
}

// Event handlers
void DomainMemoryEngine::handleMemoryEntryCreated(const DomainEvent& event) {
    // Log or perform side effects for memory entry creation
}

void DomainMemoryEngine::handleMemoryEntryUpdated(const DomainEvent& event) {
    // Log or perform side effects for memory entry updates
}

void DomainMemoryEngine::handleSearchSessionStarted(const DomainEvent& event) {
    // Log or perform side effects for search session start
}

void DomainMemoryEngine::handleSearchSessionCompleted(const DomainEvent& event) {
    // Log or perform side effects for search session completion
}

// MemoryApplicationService Implementation
MemoryApplicationService::MemoryApplicationService() 
    : domain_engine(std::make_unique<DomainMemoryEngine>()),
      memory_repository(std::make_unique<MemoryEntryRepository>()) {}

MemoryApplicationService::~MemoryApplicationService() = default;

bool MemoryApplicationService::initialize(const std::unordered_map<std::string, std::vector<std::string>>& categories) {
    return domain_engine->initializeDomain(categories);
}

std::string MemoryApplicationService::createMemoryEntry(const std::string& problem,
                                                       const std::string& solution,
                                                       const std::string& category) {
    return domain_engine->createMemoryEntry(problem, solution, category);
}

bool MemoryApplicationService::updateMemoryEntry(const std::string& entry_id,
                                                const std::string& new_solution,
                                                const std::string& reason) {
    return domain_engine->updateMemoryEntry(entry_id, new_solution, reason);
}

std::string MemoryApplicationService::searchMemories(const std::string& query,
                                                     const std::string& category,
                                                     int max_results) {
    return domain_engine->searchWithContext(query, category, max_results);
}

std::string MemoryApplicationService::getMemoryEntry(const std::string& entry_id) {
    const auto* entry = domain_engine->getMemoryEntry(entry_id);
    if (!entry) {
        return "{}";
    }
    
    Json::Value result;
    result["id"] = entry->getId();
    result["problem"] = entry->getProblem();
    result["solution"] = entry->getSolution();
    result["category"] = entry->getCategory();
    result["confidence"] = entry->getConfidenceScore();
    result["has_conflicts"] = entry->hasConflicts();
    
    Json::StreamWriterBuilder builder;
    return Json::writeString(builder, result);
}

std::string MemoryApplicationService::getStatistics() {
    return domain_engine->getDomainStatistics();
}

void MemoryApplicationService::subscribeToEvents(const std::string& event_type, EventHandler handler) {
    domain_engine->subscribeToEvents(event_type, std::move(handler));
}

} // namespace brains