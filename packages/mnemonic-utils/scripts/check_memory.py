#!/usr/bin/env python3
"""
Memory consistency checker and maintenance script.
Validates YAML integrity and prunes outdated entries.
"""

import os
import sys
import yaml
import glob
import logging
from datetime import datetime, timedelta
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('memory_check.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

def validate_yaml(file_path):
    """Validate YAML file syntax and structure."""
    try:
        if not os.path.exists(file_path):
            logging.warning(f"File does not exist: {file_path}")
            return False
        
        with open(file_path, 'r') as f:
            data = yaml.safe_load(f)
        
        # Check basic structure
        if not isinstance(data, dict):
            logging.error(f"{file_path}: Root should be a dictionary")
            return False
        
        if 'lessons_learned' not in data:
            logging.error(f"{file_path}: Missing 'lessons_learned' section")
            return False
        
        if 'metadata' not in data:
            logging.warning(f"{file_path}: Missing 'metadata' section")
        
        # Validate lessons_learned structure
        lessons = data['lessons_learned']
        if not isinstance(lessons, dict):
            logging.error(f"{file_path}: 'lessons_learned' should be a dictionary")
            return False
        
        # Check each category
        for category, problems in lessons.items():
            if not isinstance(problems, dict):
                logging.error(f"{file_path}: Category '{category}' should contain a dictionary")
                return False
            
            # Check each problem
            for problem, details in problems.items():
                if not isinstance(details, dict):
                    logging.error(f"{file_path}: Problem '{problem}' should have dictionary details")
                    return False
                
                required_fields = ['solution', 'created_date', 'use_count']
                for field in required_fields:
                    if field not in details:
                        logging.error(f"{file_path}: Problem '{problem}' missing '{field}' field")
                        return False
                
                # Validate date format
                try:
                    datetime.fromisoformat(details['created_date'].replace('Z', '+00:00'))
                except (ValueError, AttributeError):
                    logging.error(f"{file_path}: Invalid date format in problem '{problem}'")
                    return False
        
        logging.info(f"{file_path}: Valid YAML structure")
        return True
        
    except yaml.YAMLError as e:
        logging.error(f"{file_path}: YAML syntax error - {e}")
        return False
    except Exception as e:
        logging.error(f"{file_path}: Validation error - {e}")
        return False

def prune_old_entries(file_path, max_age_days=180, dry_run=False):
    """Remove entries older than specified days."""
    try:
        if not os.path.exists(file_path):
            logging.warning(f"File does not exist: {file_path}")
            return 0
        
        with open(file_path, 'r') as f:
            data = yaml.safe_load(f)
        
        if not data or 'lessons_learned' not in data:
            logging.warning(f"{file_path}: No lessons_learned section found")
            return 0
        
        cutoff_date = datetime.now() - timedelta(days=max_age_days)
        pruned_count = 0
        
        for category, problems in data['lessons_learned'].items():
            if not isinstance(problems, dict):
                continue
                
            problems_to_remove = []
            for problem, details in problems.items():
                if not isinstance(details, dict) or 'created_date' not in details:
                    continue
                
                try:
                    # Handle different date formats
                    date_str = details['created_date']
                    if date_str.endswith('Z'):
                        date_str = date_str.replace('Z', '+00:00')
                    
                    created_date = datetime.fromisoformat(date_str)
                    
                    # Make both dates timezone-naive for comparison
                    if created_date.tzinfo is not None:
                        created_date = created_date.replace(tzinfo=None)
                    
                    if created_date < cutoff_date:
                        problems_to_remove.append(problem)
                        pruned_count += 1
                        logging.info(f"Pruning old entry: {category}/{problem} (created: {created_date.date()})")
                except (ValueError, AttributeError) as e:
                    logging.warning(f"Invalid date in {category}/{problem}: {e}")
            
            # Remove old problems
            if not dry_run:
                for problem in problems_to_remove:
                    del problems[problem]
        
        # Update metadata
        if not dry_run and pruned_count > 0:
            if 'metadata' not in data:
                data['metadata'] = {}
            
            data['metadata']['last_pruned'] = datetime.now().isoformat()
            data['metadata']['last_updated'] = datetime.now().isoformat()
            
            # Recalculate total solutions
            total_solutions = sum(
                len(category_data) 
                for category_data in data['lessons_learned'].values()
                if isinstance(category_data, dict)
            )
            data['metadata']['total_solutions'] = total_solutions
            
            # Write back to file
            with open(file_path, 'w') as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            
            logging.info(f"{file_path}: Pruned {pruned_count} old entries, {total_solutions} solutions remaining")
        else:
            logging.info(f"{file_path}: Would prune {pruned_count} old entries (dry run)")
        
        return pruned_count
        
    except Exception as e:
        logging.error(f"Error pruning {file_path}: {e}")
        return 0

def check_file_sizes():
    """Check memory file sizes and warn if they're getting large."""
    files_to_check = [
        'structured_memory.yaml',
        'global_structured_memory.yaml',
        'error_categories.yaml'
    ]
    
    for file_path in files_to_check:
        if os.path.exists(file_path):
            size_mb = os.path.getsize(file_path) / (1024 * 1024)
            if size_mb > 10:  # Warn if larger than 10MB
                logging.warning(f"{file_path}: Large file size ({size_mb:.2f} MB)")
            elif size_mb > 1:  # Info if larger than 1MB
                logging.info(f"{file_path}: File size: {size_mb:.2f} MB")

def generate_stats():
    """Generate memory usage statistics."""
    stats = {
        'timestamp': datetime.now().isoformat(),
        'files': {}
    }
    
    files_to_check = ['structured_memory.yaml', 'global_structured_memory.yaml']
    
    for file_path in files_to_check:
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = yaml.safe_load(f)
                
                if data and 'lessons_learned' in data:
                    categories = len(data['lessons_learned'])
                    total_solutions = sum(
                        len(cat_data) for cat_data in data['lessons_learned'].values()
                        if isinstance(cat_data, dict)
                    )
                    
                    stats['files'][file_path] = {
                        'categories': categories,
                        'total_solutions': total_solutions,
                        'size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 3)
                    }
                    
                    logging.info(f"{file_path}: {categories} categories, {total_solutions} solutions")
            except Exception as e:
                logging.error(f"Error reading {file_path}: {e}")
                stats['files'][file_path] = {'error': str(e)}
    
    return stats

def validate_error_categories_yaml(file_path):
    """Validate error_categories.yaml file structure."""
    try:
        if not os.path.exists(file_path):
            logging.warning(f"File does not exist: {file_path}")
            return False
        
        with open(file_path, 'r') as f:
            data = yaml.safe_load(f)
        
        if not isinstance(data, dict):
            logging.error(f"{file_path}: Root should be a dictionary")
            return False
        
        if 'error_categories' not in data:
            logging.error(f"{file_path}: Missing 'error_categories' section")
            return False
        
        categories = data['error_categories']
        if not isinstance(categories, dict):
            logging.error(f"{file_path}: 'error_categories' should be a dictionary")
            return False
        
        # Validate regex patterns
        import re
        for category, pattern in categories.items():
            try:
                re.compile(pattern)
            except re.error as e:
                logging.error(f"{file_path}: Invalid regex in category '{category}': {e}")
                return False
        
        logging.info(f"{file_path}: Valid error categories structure")
        return True
        
    except yaml.YAMLError as e:
        logging.error(f"{file_path}: YAML syntax error - {e}")
        return False
    except Exception as e:
        logging.error(f"{file_path}: Validation error - {e}")
        return False

def main():
    """Main consistency check routine."""
    logging.info("Starting memory consistency check")
    
    # Files to check
    memory_files = ['structured_memory.yaml', 'global_structured_memory.yaml']
    
    # Validate YAML files
    all_valid = True
    for file_path in memory_files:
        if not validate_yaml(file_path):
            all_valid = False
    
    # Validate error categories separately
    if not validate_error_categories_yaml('error_categories.yaml'):
        all_valid = False
    
    if not all_valid:
        logging.error("Some files failed validation. Fix errors before continuing.")
        sys.exit(1)
    
    # Check file sizes
    check_file_sizes()
    
    # Generate statistics
    stats = generate_stats()
    
    # Prune old entries (default: entries older than 180 days)
    total_pruned = 0
    dry_run = '--dry-run' in sys.argv
    max_age = 180
    
    if '--max-age' in sys.argv:
        try:
            idx = sys.argv.index('--max-age')
            max_age = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            logging.error("Invalid --max-age value")
            sys.exit(1)
    
    for file_path in memory_files:
        pruned = prune_old_entries(file_path, max_age, dry_run)
        total_pruned += pruned
    
    # Summary
    logging.info(f"Consistency check completed. Total entries pruned: {total_pruned}")
    
    if dry_run:
        logging.info("Dry run mode - no changes were made")
    
    return 0

if __name__ == '__main__':
    if '--help' in sys.argv:
        print("Usage: python check_memory.py [--dry-run] [--max-age DAYS]")
        print("  --dry-run    Show what would be pruned without making changes")
        print("  --max-age    Maximum age in days before pruning (default: 180)")
        sys.exit(0)
    
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logging.info("Interrupted by user")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        sys.exit(1)