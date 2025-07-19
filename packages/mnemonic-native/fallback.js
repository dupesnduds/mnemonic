/**
 * JavaScript fallback implementation of the Memory Engine
 * Used when C++ addon compilation fails
 */

class JSMemoryEngine {
  constructor() {
    this.categoryIndex = new Map();
    this.errorPatterns = new Map();
    this.stats = {
      totalLookups: 0,
      cacheHits: 0,
      totalLookupTimeMs: 0
    };
  }

  initialize(categories) {
    try {
      this.errorPatterns.clear();
      
      for (const [category, patterns] of Object.entries(categories)) {
        const compiledPatterns = [];
        for (const pattern of patterns) {
          try {
            compiledPatterns.push(new RegExp(pattern, 'i'));
          } catch (e) {
            console.warn(`Invalid regex pattern for category ${category}: ${pattern}`);
          }
        }
        this.errorPatterns.set(category, compiledPatterns);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize JS fallback engine:', error);
      return false;
    }
  }

  storeSolution(problem, category, solutionContent, isGlobal = false) {
    try {
      const startTime = Date.now();
      
      if (!category) {
        category = this.categorizeError(problem);
      }

      if (!this.categoryIndex.has(category)) {
        this.categoryIndex.set(category, {
          project: new Map(),
          global: new Map()
        });
      }

      const categoryData = this.categoryIndex.get(category);
      const targetMap = isGlobal ? categoryData.global : categoryData.project;

      const solution = {
        content: solutionContent,
        created_date: new Date().toISOString(),
        use_count: 1,
        source: isGlobal ? 'global' : 'project'
      };

      // If solution already exists, update use count
      if (targetMap.has(problem)) {
        const existing = targetMap.get(problem);
        solution.use_count = existing.use_count + 1;
        solution.created_date = existing.created_date;
      }

      targetMap.set(problem, solution);

      const endTime = Date.now();
      this.stats.totalLookupTimeMs += (endTime - startTime);

      return true;
    } catch (error) {
      console.error('JS fallback storeSolution error:', error);
      return false;
    }
  }

  findSolution(problem, category = '') {
    try {
      const startTime = Date.now();
      this.stats.totalLookups++;

      if (!category) {
        category = this.categorizeError(problem);
      }

      if (!this.categoryIndex.has(category)) {
        const endTime = Date.now();
        this.stats.totalLookupTimeMs += (endTime - startTime);
        return null;
      }

      const categoryData = this.categoryIndex.get(category);
      const projectSolution = categoryData.project.get(problem);
      const globalSolution = categoryData.global.get(problem);

      let result = null;

      if (projectSolution && !globalSolution) {
        result = {
          solution: projectSolution,
          conflict_resolution: 'default_local_preference',
          reason: 'Only project solution available'
        };
      } else if (globalSolution && !projectSolution) {
        // Check if global solution is recent enough (6 months)
        const createdDate = new Date(globalSolution.created_date);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        if (createdDate > sixMonthsAgo) {
          result = {
            solution: globalSolution,
            conflict_resolution: 'default_local_preference',
            reason: 'Only recent global solution available'
          };
        }
      } else if (projectSolution && globalSolution) {
        // Apply conflict resolution
        result = this._resolveConflict(projectSolution, globalSolution);
      }

      if (result) {
        this.stats.cacheHits++;
      }

      const endTime = Date.now();
      this.stats.totalLookupTimeMs += (endTime - startTime);

      return result;
    } catch (error) {
      console.error('JS fallback findSolution error:', error);
      return null;
    }
  }

  _resolveConflict(projectSolution, globalSolution) {
    const projectDate = new Date(projectSolution.created_date);
    const globalDate = new Date(globalSolution.created_date);
    const now = new Date();

    // Rule 1: Recent project solutions (< 30 days) always win
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (projectDate > thirtyDaysAgo) {
      return {
        solution: projectSolution,
        conflict_resolution: 'recent_project_priority',
        reason: `Recent project solution (created: ${projectDate.toISOString()})`
      };
    }

    // Rule 2: Newer solution if age difference > 90 days
    const ageDiffDays = Math.abs(projectDate.getTime() - globalDate.getTime()) / (1000 * 60 * 60 * 24);

    if (ageDiffDays > 90) {
      const newerSolution = projectDate > globalDate ? projectSolution : globalSolution;
      return {
        solution: newerSolution,
        conflict_resolution: 'newer_solution',
        reason: `Newer solution chosen (age difference: ${Math.round(ageDiffDays)} days)`
      };
    }

    // Rule 3: Popular solution if use count ratio > 3x
    const useCountRatio = Math.max(projectSolution.use_count, globalSolution.use_count) /
                         Math.min(projectSolution.use_count, globalSolution.use_count);

    if (useCountRatio > 3) {
      const popularSolution = projectSolution.use_count > globalSolution.use_count ? 
                              projectSolution : globalSolution;
      return {
        solution: popularSolution,
        conflict_resolution: 'popularity_based',
        reason: `Popular solution chosen (use counts: project=${projectSolution.use_count}, global=${globalSolution.use_count})`
      };
    }

    // Rule 4: Default to project solution
    return {
      solution: projectSolution,
      conflict_resolution: 'default_local_preference',
      reason: 'Default local preference'
    };
  }

  categorizeError(errorMessage) {
    try {
      for (const [category, patterns] of this.errorPatterns) {
        for (const regex of patterns) {
          if (regex.test(errorMessage)) {
            return category;
          }
        }
      }
      return 'errors_uncategorised';
    } catch (error) {
      console.error('JS fallback categorizeError error:', error);
      return 'errors_uncategorised';
    }
  }

  getStatistics() {
    try {
      const hitRate = this.stats.totalLookups > 0 ? 
                     this.stats.cacheHits / this.stats.totalLookups : 0;
      const avgLookupTime = this.stats.totalLookups > 0 ? 
                           this.stats.totalLookupTimeMs / this.stats.totalLookups : 0;

      const categoryBreakdown = {};
      for (const [category, data] of this.categoryIndex) {
        categoryBreakdown[category] = {
          project: data.project.size,
          global: data.global.size
        };
      }

      return JSON.stringify({
        total_lookups: this.stats.totalLookups,
        cache_hits: this.stats.cacheHits,
        hit_rate: hitRate,
        avg_lookup_time_ms: avgLookupTime,
        categories: this.categoryIndex.size,
        category_breakdown: categoryBreakdown,
        engine_type: 'JavaScript_Fallback'
      });
    } catch (error) {
      console.error('JS fallback getStatistics error:', error);
      return JSON.stringify({ error: error.message });
    }
  }

  clear() {
    this.categoryIndex.clear();
    this.stats = {
      totalLookups: 0,
      cacheHits: 0,
      totalLookupTimeMs: 0
    };
  }

  loadSolutions(category, solutions, isGlobal = false) {
    try {
      for (const [problem, solutionContent] of Object.entries(solutions)) {
        this.storeSolution(problem, category, solutionContent, isGlobal);
      }
      return true;
    } catch (error) {
      console.error('JS fallback loadSolutions error:', error);
      return false;
    }
  }
}

module.exports = JSMemoryEngine;