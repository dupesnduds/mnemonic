#ifndef MEMORY_ENGINE_H
#define MEMORY_ENGINE_H

#include <string>
#include <unordered_map>
#include <vector>
#include <regex>
#include <chrono>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <atomic>

namespace brains {

/**
 * @brief Structure representing a solution with metadata
 */
struct Solution {
    std::string content;
    std::string created_date;
    int use_count;
    std::string source; // "project" or "global"
    
    Solution() : use_count(1), source("project") {}
    Solution(const std::string& content, const std::string& source = "project") 
        : content(content), use_count(1), source(source) {
        auto now = std::chrono::system_clock::now();
        auto time_t = std::chrono::system_clock::to_time_t(now);
        created_date = std::to_string(time_t);
    }
};

/**
 * @brief Conflict resolution strategies
 */
enum class ConflictStrategy {
    RECENT_PROJECT_PRIORITY,    // Project solutions < 30 days always win
    NEWER_SOLUTION,            // More recent solution if age diff > 90 days
    POPULARITY_BASED,          // Higher use count if ratio > 3x
    DEFAULT_LOCAL_PREFERENCE   // Default to project solution
};

/**
 * @brief Result of conflict resolution with metadata
 */
struct ConflictResult {
    Solution solution;
    ConflictStrategy strategy;
    std::string reason;
    
    ConflictResult() : strategy(ConflictStrategy::DEFAULT_LOCAL_PREFERENCE), reason("Default") {}
    ConflictResult(const Solution& sol, ConflictStrategy strat, const std::string& reason)
        : solution(sol), strategy(strat), reason(reason) {}
};

/**
 * @brief High-performance cache for category-based solution storage
 */
class SolutionCache {
private:
    std::unordered_map<std::string, std::vector<Solution>> project_solutions;
    std::unordered_map<std::string, std::vector<Solution>> global_solutions;
    mutable std::shared_mutex cache_mutex;
    
public:
    /**
     * @brief Add a solution to the cache
     * @param problem Problem identifier
     * @param solution Solution object
     * @param is_global Whether this is a global solution
     */
    void addSolution(const std::string& problem, const Solution& solution, bool is_global = false);
    
    /**
     * @brief Find the best solution for a problem with conflict resolution
     * @param problem Problem identifier
     * @return ConflictResult with chosen solution and resolution strategy
     */
    std::unique_ptr<ConflictResult> findSolution(const std::string& problem) const;
    
    /**
     * @brief Get all solutions for a problem (for debugging)
     * @param problem Problem identifier
     * @return Vector of all matching solutions
     */
    std::vector<Solution> getAllSolutions(const std::string& problem) const;
    
    /**
     * @brief Clear cache
     */
    void clear();
    
    /**
     * @brief Get cache statistics
     */
    std::pair<size_t, size_t> getStats() const; // {project_count, global_count}
};

/**
 * @brief Fast error categorization engine using compiled regex patterns
 */
class ErrorCategorizer {
private:
    std::unordered_map<std::string, std::vector<std::regex>> category_patterns;
    mutable std::shared_mutex patterns_mutex;
    
public:
    /**
     * @brief Load error categories from configuration
     * @param categories Map of category name to regex patterns
     */
    void loadCategories(const std::unordered_map<std::string, std::vector<std::string>>& categories);
    
    /**
     * @brief Categorize an error message
     * @param error_message The error message to categorize
     * @return Category name or "errors_uncategorised"
     */
    std::string categorize(const std::string& error_message) const;
    
    /**
     * @brief Get all available categories
     * @return Vector of category names
     */
    std::vector<std::string> getCategories() const;
};

/**
 * @brief Main high-performance memory engine
 */
class MemoryEngine {
protected:
    std::unordered_map<std::string, std::unique_ptr<SolutionCache>> category_index;
    std::unique_ptr<ErrorCategorizer> error_categorizer;
    mutable std::shared_mutex engine_mutex;
    
    // Performance metrics
    mutable std::atomic<uint64_t> total_lookups{0};
    mutable std::atomic<uint64_t> cache_hits{0};
    mutable std::atomic<uint64_t> total_lookup_time_us{0};
    
public:
    /**
     * @brief Constructor
     */
    MemoryEngine();
    
    /**
     * @brief Destructor
     */
    ~MemoryEngine();
    
    /**
     * @brief Initialize the engine with error categories
     * @param categories Map of category name to regex patterns
     * @return true if successful
     */
    bool initialize(const std::unordered_map<std::string, std::vector<std::string>>& categories);
    
    /**
     * @brief Store a solution in the memory system
     * @param problem Problem description
     * @param category Problem category (empty for auto-categorization)
     * @param solution Solution content
     * @param is_global Whether to store as global solution
     * @return true if successful
     */
    bool storeSolution(const std::string& problem, 
                      const std::string& category,
                      const std::string& solution_content,
                      bool is_global = false);
    
    /**
     * @brief Find a solution for a problem
     * @param problem Problem description
     * @param category Optional category hint (empty for auto-categorization)
     * @return ConflictResult with solution and metadata, nullptr if not found
     */
    std::unique_ptr<ConflictResult> findSolution(const std::string& problem, 
                                                const std::string& category = "") const;
    
    /**
     * @brief Categorize an error message
     * @param error_message Error message to categorize
     * @return Category name
     */
    std::string categorizeError(const std::string& error_message) const;
    
    /**
     * @brief Get performance statistics
     * @return JSON-formatted statistics string
     */
    std::string getStatistics() const;
    
    /**
     * @brief Clear all cached data
     */
    void clear();
    
    /**
     * @brief Load solutions from external source (for bulk loading)
     * @param category Category name
     * @param solutions Map of problem to solution
     * @param is_global Whether these are global solutions
     */
    void loadSolutions(const std::string& category,
                      const std::unordered_map<std::string, Solution>& solutions,
                      bool is_global = false);
};

/**
 * @brief AI-powered solution quality scoring system
 */
class SolutionScorer {
private:
    struct QualityMetrics {
        double completeness_score;   // How complete the solution appears
        double clarity_score;        // How clear and readable it is
        double specificity_score;    // How specific to the problem it is
        double reliability_score;    // Based on usage patterns and age
        double context_relevance;    // How relevant to current context
        
        double combined_score() const {
            return (completeness_score * 0.25 + clarity_score * 0.20 + 
                   specificity_score * 0.25 + reliability_score * 0.15 + 
                   context_relevance * 0.15);
        }
    };
    
public:
    /**
     * @brief Score a solution's quality
     * @param solution The solution to score
     * @param problem_context The original problem context
     * @param usage_stats Usage statistics for reliability scoring
     * @return Quality score between 0.0 and 1.0
     */
    double scoreSolution(const Solution& solution, 
                        const std::string& problem_context,
                        const std::unordered_map<std::string, int>& usage_stats) const;
    
    /**
     * @brief Get detailed quality metrics for a solution
     * @param solution The solution to analyze
     * @param problem_context The original problem context
     * @return QualityMetrics structure with detailed scores
     */
    QualityMetrics getDetailedMetrics(const Solution& solution,
                                     const std::string& problem_context) const;
    
private:
    double scoreCompleteness(const std::string& solution_content) const;
    double scoreClarity(const std::string& solution_content) const;
    double scoreSpecificity(const std::string& solution_content,
                           const std::string& problem_context) const;
    double scoreReliability(const Solution& solution,
                           const std::unordered_map<std::string, int>& usage_stats) const;
    double scoreContextRelevance(const std::string& solution_content,
                                const std::string& problem_context) const;
};

/**
 * @brief Enhanced memory engine with AI-powered solution ranking
 */
class EnhancedMemoryEngine : public MemoryEngine {
private:
    std::unique_ptr<SolutionScorer> solution_scorer;
    
public:
    /**
     * @brief Constructor with AI enhancement
     */
    EnhancedMemoryEngine();
    
    /**
     * @brief Find ranked solutions for a problem
     * @param problem Problem description
     * @param category Optional category hint
     * @param max_suggestions Maximum number of suggestions to return
     * @return Vector of ranked solutions with scores
     */
    std::vector<std::pair<ConflictResult, double>> findRankedSolutions(
        const std::string& problem,
        const std::string& category = "",
        int max_suggestions = 5) const;
    
    /**
     * @brief Get solution suggestions with AI scoring
     * @param problem Problem description
     * @param context Additional context for relevance scoring
     * @return JSON-formatted suggestions with scores and explanations
     */
    std::string getSuggestions(const std::string& problem,
                              const std::string& context = "") const;
};

} // namespace brains

#endif // MEMORY_ENGINE_H