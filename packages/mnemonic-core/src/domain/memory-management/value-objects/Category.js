/**
 * Category Value Object - Represents memory categorization
 */

class Category {
  constructor(name, description, patterns = []) {
    this.name = name;
    this.description = description;
    this.patterns = patterns;
    this.createdAt = new Date();
    
    this.validate();
  }

  static create(name, description, patterns = []) {
    return new Category(name, description, patterns);
  }

  static fromString(categoryString) {
    const validCategories = [
      'authentication',
      'networking', 
      'database',
      'filesystem',
      'memory',
      'configuration',
      'api',
      'concurrency',
      'validation',
      'build',
      'general'
    ];
    
    const normalizedName = categoryString.toLowerCase().trim();
    
    if (!validCategories.includes(normalizedName)) {
      return Category.create('general', 'General category for uncategorized items');
    }
    
    const descriptions = {
      'authentication': 'Authentication and authorization issues',
      'networking': 'Network connectivity and HTTP issues',
      'database': 'Database connection and query issues',
      'filesystem': 'File system operations and permissions',
      'memory': 'Memory allocation and management issues',
      'configuration': 'Configuration and environment issues',
      'api': 'API-related issues and integrations',
      'concurrency': 'Threading and concurrency issues',
      'validation': 'Data validation and schema issues',
      'build': 'Build process and dependency issues',
      'general': 'General category for uncategorized items'
    };
    
    return Category.create(normalizedName, descriptions[normalizedName]);
  }

  equals(other) {
    return other instanceof Category && 
           this.name === other.name &&
           this.description === other.description;
  }

  isValid() {
    return this.name && 
           this.name.trim().length > 0 &&
           this.description &&
           this.description.trim().length > 0;
  }

  validate() {
    if (!this.isValid()) {
      throw new Error('Invalid category: name and description are required');
    }
    
    if (this.name.length > 50) {
      throw new Error('Category name must be 50 characters or less');
    }
    
    if (this.description.length > 200) {
      throw new Error('Category description must be 200 characters or less');
    }
  }

  addPattern(pattern) {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      throw new Error('Pattern must be a non-empty string');
    }
    
    // Test if pattern is a valid regex
    try {
      new RegExp(pattern);
    } catch (e) {
      throw new Error('Pattern must be a valid regular expression');
    }
    
    this.patterns.push(pattern);
  }

  matchesPattern(text) {
    if (!text || this.patterns.length === 0) {
      return false;
    }
    
    return this.patterns.some(pattern => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(text);
      } catch (e) {
        return false;
      }
    });
  }

  toString() {
    return this.name;
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      patterns: this.patterns,
      createdAt: this.createdAt
    };
  }
}

module.exports = Category;