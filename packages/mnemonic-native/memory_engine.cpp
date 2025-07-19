#include "memory_engine.h"
#include <algorithm>
#include <chrono>
#include <sstream>
#include <iomanip>
#include <ctime>

namespace brains {

// SolutionCache Implementation
void SolutionCache::addSolution(const std::string& problem, const Solution& solution, bool is_global) {
    std::unique_lock<std::shared_mutex> lock(cache_mutex);
    
    auto& target_map = is_global ? global_solutions : project_solutions;
    target_map[problem].push_back(solution);
    
    // Keep only the most recent 5 solutions per problem to limit memory usage
    if (target_map[problem].size() > 5) {
        target_map[problem].erase(target_map[problem].begin());
    }
}

std::unique_ptr<ConflictResult> SolutionCache::findSolution(const std::string& problem) const {
    std::shared_lock<std::shared_mutex> lock(cache_mutex);
    
    auto project_it = project_solutions.find(problem);
    auto global_it = global_solutions.find(problem);
    
    bool has_project = (project_it != project_solutions.end() && !project_it->second.empty());
    bool has_global = (global_it != global_solutions.end() && !global_it->second.empty());
    
    if (!has_project && !has_global) {
        return nullptr;
    }
    
    // If only one source has solutions, use it
    if (has_project && !has_global) {
        const auto& latest = project_it->second.back();
        return std::make_unique<ConflictResult>(latest, ConflictStrategy::DEFAULT_LOCAL_PREFERENCE, 
                                              "Only project solution available");
    }
    
    if (has_global && !has_project) {
        const auto& latest = global_it->second.back();
        // Check if global solution is recent enough (within 6 months)
        auto now = std::chrono::system_clock::now();
        auto six_months_ago = now - std::chrono::hours(24 * 180); // 180 days
        auto created_time = std::chrono::system_clock::from_time_t(std::stoll(latest.created_date));
        
        if (created_time > six_months_ago) {
            return std::make_unique<ConflictResult>(latest, ConflictStrategy::DEFAULT_LOCAL_PREFERENCE,
                                                  "Only recent global solution available");
        }
        return nullptr; // Global solution too old
    }
    
    // Both sources have solutions - apply conflict resolution
    const auto& project_solution = project_it->second.back();
    const auto& global_solution = global_it->second.back();
    
    auto now = std::chrono::system_clock::now();
    auto project_time = std::chrono::system_clock::from_time_t(std::stoll(project_solution.created_date));
    auto global_time = std::chrono::system_clock::from_time_t(std::stoll(global_solution.created_date));
    
    // Rule 1: Project solutions < 30 days always win
    auto thirty_days_ago = now - std::chrono::hours(24 * 30);
    if (project_time > thirty_days_ago) {
        return std::make_unique<ConflictResult>(project_solution, ConflictStrategy::RECENT_PROJECT_PRIORITY,
                                              "Recent project solution takes priority");
    }
    
    // Rule 2: Use newer solution if age difference > 90 days
    auto age_diff = std::abs(std::chrono::duration_cast<std::chrono::hours>(project_time - global_time).count()) / 24;
    if (age_diff > 90) {
        const auto& newer_solution = (project_time > global_time) ? project_solution : global_solution;
        std::stringstream reason;
        reason << "Newer solution chosen (age difference: " << age_diff << " days)";
        return std::make_unique<ConflictResult>(newer_solution, ConflictStrategy::NEWER_SOLUTION, reason.str());
    }
    
    // Rule 3: Use solution with higher use count if ratio > 3x
    double use_ratio = static_cast<double>(std::max(project_solution.use_count, global_solution.use_count)) /
                      static_cast<double>(std::min(project_solution.use_count, global_solution.use_count));
    
    if (use_ratio > 3.0) {
        const auto& popular_solution = (project_solution.use_count > global_solution.use_count) ? 
                                      project_solution : global_solution;
        std::stringstream reason;
        reason << "Popular solution chosen (use counts: project=" << project_solution.use_count 
               << ", global=" << global_solution.use_count << ")";
        return std::make_unique<ConflictResult>(popular_solution, ConflictStrategy::POPULARITY_BASED, reason.str());
    }
    
    // Rule 4: Default to project solution
    return std::make_unique<ConflictResult>(project_solution, ConflictStrategy::DEFAULT_LOCAL_PREFERENCE,
                                          "Default local preference");
}

std::vector<Solution> SolutionCache::getAllSolutions(const std::string& problem) const {
    std::shared_lock<std::shared_mutex> lock(cache_mutex);
    
    std::vector<Solution> all_solutions;
    
    auto project_it = project_solutions.find(problem);
    if (project_it != project_solutions.end()) {
        all_solutions.insert(all_solutions.end(), project_it->second.begin(), project_it->second.end());
    }
    
    auto global_it = global_solutions.find(problem);
    if (global_it != global_solutions.end()) {
        all_solutions.insert(all_solutions.end(), global_it->second.begin(), global_it->second.end());
    }
    
    return all_solutions;
}

void SolutionCache::clear() {
    std::unique_lock<std::shared_mutex> lock(cache_mutex);
    project_solutions.clear();
    global_solutions.clear();
}

std::pair<size_t, size_t> SolutionCache::getStats() const {
    std::shared_lock<std::shared_mutex> lock(cache_mutex);
    return {project_solutions.size(), global_solutions.size()};
}

// ErrorCategorizer Implementation
void ErrorCategorizer::loadCategories(const std::unordered_map<std::string, std::vector<std::string>>& categories) {
    std::unique_lock<std::shared_mutex> lock(patterns_mutex);
    category_patterns.clear();
    
    for (const auto& [category, patterns] : categories) {
        for (const auto& pattern : patterns) {
            try {
                category_patterns[category].emplace_back(pattern, std::regex::icase);
            } catch (const std::regex_error& e) {
                // Skip invalid regex patterns
                continue;
            }
        }
    }
}

std::string ErrorCategorizer::categorize(const std::string& error_message) const {
    std::shared_lock<std::shared_mutex> lock(patterns_mutex);
    
    for (const auto& [category, patterns] : category_patterns) {
        for (const auto& regex_pattern : patterns) {
            if (std::regex_search(error_message, regex_pattern)) {
                return category;
            }
        }
    }
    
    return "errors_uncategorised";
}

std::vector<std::string> ErrorCategorizer::getCategories() const {
    std::shared_lock<std::shared_mutex> lock(patterns_mutex);
    
    std::vector<std::string> categories;
    for (const auto& [category, _] : category_patterns) {
        categories.push_back(category);
    }
    
    return categories;
}

// MemoryEngine Implementation
MemoryEngine::MemoryEngine() : error_categorizer(std::make_unique<ErrorCategorizer>()) {}

MemoryEngine::~MemoryEngine() = default;

bool MemoryEngine::initialize(const std::unordered_map<std::string, std::vector<std::string>>& categories) {
    try {
        error_categorizer->loadCategories(categories);
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

bool MemoryEngine::storeSolution(const std::string& problem, 
                                const std::string& category,
                                const std::string& solution_content,
                                bool is_global) {
    auto start_time = std::chrono::high_resolution_clock::now();
    
    std::string final_category = category;
    if (final_category.empty()) {
        final_category = categorizeError(problem);
    }
    
    Solution solution(solution_content, is_global ? "global" : "project");
    
    {
        std::unique_lock<std::shared_mutex> lock(engine_mutex);
        
        if (category_index.find(final_category) == category_index.end()) {
            category_index[final_category] = std::make_unique<SolutionCache>();
        }
        
        category_index[final_category]->addSolution(problem, solution, is_global);
    }
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time);
    total_lookup_time_us += duration.count();
    
    return true;
}

std::unique_ptr<ConflictResult> MemoryEngine::findSolution(const std::string& problem, 
                                                          const std::string& category) const {
    auto start_time = std::chrono::high_resolution_clock::now();
    total_lookups++;
    
    std::string final_category = category;
    if (final_category.empty()) {
        final_category = categorizeError(problem);
    }
    
    std::unique_ptr<ConflictResult> result = nullptr;
    
    {
        std::shared_lock<std::shared_mutex> lock(engine_mutex);
        
        auto it = category_index.find(final_category);
        if (it != category_index.end()) {
            result = it->second->findSolution(problem);
            if (result) {
                cache_hits++;
            }
        }
    }
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time);
    total_lookup_time_us += duration.count();
    
    return result;
}

std::string MemoryEngine::categorizeError(const std::string& error_message) const {
    return error_categorizer->categorize(error_message);
}

std::string MemoryEngine::getStatistics() const {
    std::shared_lock<std::shared_mutex> lock(engine_mutex);
    
    std::stringstream stats;
    stats << "{\n";
    stats << "  \"total_lookups\": " << total_lookups.load() << ",\n";
    stats << "  \"cache_hits\": " << cache_hits.load() << ",\n";
    stats << "  \"hit_rate\": " << (total_lookups > 0 ? 
                                   static_cast<double>(cache_hits) / total_lookups : 0.0) << ",\n";
    stats << "  \"avg_lookup_time_us\": " << (total_lookups > 0 ? 
                                            total_lookup_time_us.load() / total_lookups : 0) << ",\n";
    stats << "  \"categories\": " << category_index.size() << ",\n";
    stats << "  \"category_breakdown\": {\n";
    
    bool first = true;
    for (const auto& [category, cache] : category_index) {
        if (!first) stats << ",\n";
        auto [project_count, global_count] = cache->getStats();
        stats << "    \"" << category << "\": {\"project\": " << project_count 
              << ", \"global\": " << global_count << "}";
        first = false;
    }
    
    stats << "\n  }\n}";
    return stats.str();
}

void MemoryEngine::clear() {
    std::unique_lock<std::shared_mutex> lock(engine_mutex);
    category_index.clear();
    total_lookups = 0;
    cache_hits = 0;
    total_lookup_time_us = 0;
}

void MemoryEngine::loadSolutions(const std::string& category,
                                const std::unordered_map<std::string, Solution>& solutions,
                                bool is_global) {
    std::unique_lock<std::shared_mutex> lock(engine_mutex);
    
    if (category_index.find(category) == category_index.end()) {
        category_index[category] = std::make_unique<SolutionCache>();
    }
    
    for (const auto& [problem, solution] : solutions) {
        category_index[category]->addSolution(problem, solution, is_global);
    }
}

// SolutionScorer Implementation
double SolutionScorer::scoreSolution(const Solution& solution, 
                                    const std::string& problem_context,
                                    const std::unordered_map<std::string, int>& usage_stats) const {
    auto metrics = getDetailedMetrics(solution, problem_context);
    
    // Add reliability scoring based on usage stats
    metrics.reliability_score = scoreReliability(solution, usage_stats);
    
    return metrics.combined_score();
}

SolutionScorer::QualityMetrics SolutionScorer::getDetailedMetrics(
    const Solution& solution, const std::string& problem_context) const {
    
    QualityMetrics metrics;
    metrics.completeness_score = scoreCompleteness(solution.content);
    metrics.clarity_score = scoreClarity(solution.content);
    metrics.specificity_score = scoreSpecificity(solution.content, problem_context);
    metrics.context_relevance = scoreContextRelevance(solution.content, problem_context);
    metrics.reliability_score = 0.5; // Default, will be overridden
    
    return metrics;
}

double SolutionScorer::scoreCompleteness(const std::string& solution_content) const {
    double score = 0.0;
    
    // Length-based scoring (reasonable solutions should have substance)
    if (solution_content.length() > 20) score += 0.3;
    if (solution_content.length() > 100) score += 0.2;
    
    // Check for code snippets
    if (solution_content.find("```") != std::string::npos) score += 0.2;
    if (solution_content.find("npm") != std::string::npos || 
        solution_content.find("yarn") != std::string::npos) score += 0.1;
    
    // Check for step-by-step instructions
    if (solution_content.find("1.") != std::string::npos || 
        solution_content.find("2.") != std::string::npos) score += 0.2;
    
    return std::min(1.0, score);
}

double SolutionScorer::scoreClarity(const std::string& solution_content) const {
    double score = 0.5; // Base score
    
    // Penalty for extremely short solutions
    if (solution_content.length() < 10) score -= 0.3;
    
    // Bonus for clear formatting
    if (solution_content.find("\n") != std::string::npos) score += 0.1;
    if (solution_content.find("- ") != std::string::npos) score += 0.1;
    
    // Check for clear language indicators
    if (solution_content.find("need to") != std::string::npos ||
        solution_content.find("should") != std::string::npos ||
        solution_content.find("try") != std::string::npos) score += 0.2;
    
    // Penalty for unclear language
    if (solution_content.find("maybe") != std::string::npos ||
        solution_content.find("not sure") != std::string::npos) score -= 0.2;
    
    return std::max(0.0, std::min(1.0, score));
}

double SolutionScorer::scoreSpecificity(const std::string& solution_content,
                                       const std::string& problem_context) const {
    double score = 0.2; // Base score
    
    // Convert to lowercase for case-insensitive matching
    std::string lower_solution = solution_content;
    std::string lower_problem = problem_context;
    std::transform(lower_solution.begin(), lower_solution.end(), lower_solution.begin(), ::tolower);
    std::transform(lower_problem.begin(), lower_problem.end(), lower_problem.begin(), ::tolower);
    
    // Extract key terms from problem (simple word extraction)
    std::istringstream problem_stream(lower_problem);
    std::string word;
    int matched_terms = 0;
    int total_terms = 0;
    
    while (problem_stream >> word) {
        if (word.length() > 3) { // Only consider meaningful words
            total_terms++;
            if (lower_solution.find(word) != std::string::npos) {
                matched_terms++;
            }
        }
    }
    
    if (total_terms > 0) {
        score += (double)matched_terms / total_terms * 0.6;
    }
    
    // Bonus for technical specificity
    if (solution_content.find("config") != std::string::npos ||
        solution_content.find(".json") != std::string::npos ||
        solution_content.find("package.json") != std::string::npos) score += 0.2;
    
    return std::min(1.0, score);
}

double SolutionScorer::scoreReliability(const Solution& solution,
                                       const std::unordered_map<std::string, int>& usage_stats) const {
    double score = 0.5; // Base score
    
    // Age-based scoring (newer is generally better)
    auto now = std::chrono::system_clock::now();
    auto created_time = std::chrono::system_clock::from_time_t(std::stoll(solution.created_date));
    auto age_days = std::chrono::duration_cast<std::chrono::hours>(now - created_time).count() / 24;
    
    if (age_days < 30) score += 0.3;
    else if (age_days < 90) score += 0.2;
    else if (age_days < 180) score += 0.1;
    else if (age_days > 365) score -= 0.2;
    
    // Usage-based scoring
    if (solution.use_count > 1) score += 0.1;
    if (solution.use_count > 3) score += 0.1;
    if (solution.use_count > 5) score += 0.1;
    
    return std::max(0.0, std::min(1.0, score));
}

double SolutionScorer::scoreContextRelevance(const std::string& solution_content,
                                            const std::string& problem_context) const {
    double score = 0.3; // Base score
    
    // This is a simplified context relevance check
    // In a real implementation, this could use more sophisticated NLP
    
    // Check for technology stack relevance
    if ((problem_context.find("npm") != std::string::npos && 
         solution_content.find("npm") != std::string::npos) ||
        (problem_context.find("node") != std::string::npos && 
         solution_content.find("node") != std::string::npos)) {
        score += 0.3;
    }
    
    if ((problem_context.find("auth") != std::string::npos && 
         solution_content.find("auth") != std::string::npos) ||
        (problem_context.find("OAuth") != std::string::npos && 
         solution_content.find("OAuth") != std::string::npos)) {
        score += 0.4;
    }
    
    return std::min(1.0, score);
}

// EnhancedMemoryEngine Implementation
EnhancedMemoryEngine::EnhancedMemoryEngine() : MemoryEngine() {
    solution_scorer = std::make_unique<SolutionScorer>();
}

std::vector<std::pair<ConflictResult, double>> EnhancedMemoryEngine::findRankedSolutions(
    const std::string& problem,
    const std::string& category,
    int max_suggestions) const {
    
    std::vector<std::pair<ConflictResult, double>> ranked_solutions;
    
    // Get category to search in
    std::string search_category = category.empty() ? categorizeError(problem) : category;
    
    std::shared_lock<std::shared_mutex> lock(engine_mutex);
    auto it = category_index.find(search_category);
    if (it == category_index.end()) {
        return ranked_solutions; // Empty result
    }
    
    // Get all solutions for the problem
    auto cache = it->second.get();
    auto all_solutions = cache->getAllSolutions(problem);
    
    // Score each solution
    std::unordered_map<std::string, int> usage_stats; // Simplified for now
    
    for (const auto& solution : all_solutions) {
        auto conflict_result = std::make_unique<ConflictResult>(
            solution, ConflictStrategy::DEFAULT_LOCAL_PREFERENCE, "AI-ranked result");
        
        double score = solution_scorer->scoreSolution(solution, problem, usage_stats);
        ranked_solutions.emplace_back(*conflict_result, score);
    }
    
    // Sort by score (highest first)
    std::sort(ranked_solutions.begin(), ranked_solutions.end(),
              [](const auto& a, const auto& b) { return a.second > b.second; });
    
    // Limit results
    if (ranked_solutions.size() > max_suggestions) {
        ranked_solutions.resize(max_suggestions);
    }
    
    return ranked_solutions;
}

std::string EnhancedMemoryEngine::getSuggestions(const std::string& problem,
                                                const std::string& context) const {
    auto ranked_solutions = findRankedSolutions(problem, "", 5);
    
    std::ostringstream json;
    json << "{\"suggestions\":[";
    
    for (size_t i = 0; i < ranked_solutions.size(); ++i) {
        if (i > 0) json << ",";
        
        const auto& [result, score] = ranked_solutions[i];
        json << "{"
             << "\"solution\":\"" << result.solution.content << "\","
             << "\"score\":" << std::fixed << std::setprecision(3) << score << ","
             << "\"source\":\"" << result.solution.source << "\","
             << "\"use_count\":" << result.solution.use_count << ","
             << "\"created_date\":\"" << result.solution.created_date << "\""
             << "}";
    }
    
    json << "],\"total_found\":" << ranked_solutions.size() 
         << ",\"context\":\"" << context << "\"}";
    
    return json.str();
}

} // namespace brains