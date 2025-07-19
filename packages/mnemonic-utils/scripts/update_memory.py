#!/usr/bin/env python3
"""
Minimalist structured memory updater with backup retention policy.
Updates YAML memory files and maintains backup history.
"""

import os
import sys
import yaml
import glob
import shutil
import logging
from datetime import datetime, timedelta
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('memory.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

def backup_memory(memory_file='structured_memory.yaml', max_backups=5):
    """Create timestamped backup and cleanup old backups."""
    if not os.path.exists(memory_file):
        logging.warning(f"{memory_file} does not exist, skipping backup")
        return
    
    # Create backups directory
    backup_dir = Path('backups')
    backup_dir.mkdir(exist_ok=True)
    
    # Create timestamped backup
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_name = f"{backup_dir}/structured_memory_{timestamp}.yaml"
    shutil.copy2(memory_file, backup_name)
    logging.info(f"Backup created: {backup_name}")
    
    # Cleanup old backups
    cleanup_backups(backup_dir, max_backups)

def cleanup_backups(backup_dir, max_backups=5):
    """Keep only the latest N backups and those within 6 months."""
    pattern = f"{backup_dir}/structured_memory_*.yaml"
    backups = sorted(glob.glob(pattern))
    
    # Keep recent backups (by count)
    if len(backups) > max_backups:
        for old_backup in backups[:-max_backups]:
            # Check if backup is older than 6 months
            try:
                # Extract timestamp from filename
                filename = os.path.basename(old_backup)
                timestamp_str = filename.replace('structured_memory_', '').replace('.yaml', '')
                backup_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                
                six_months_ago = datetime.now() - timedelta(days=180)
                if backup_date < six_months_ago:
                    os.remove(old_backup)
                    logging.info(f"Removed old backup: {old_backup}")
            except (ValueError, OSError) as e:
                logging.warning(f"Could not process backup {old_backup}: {e}")

def load_memory(memory_file='structured_memory.yaml'):
    """Load existing memory or create new structure."""
    if os.path.exists(memory_file):
        try:
            with open(memory_file, 'r') as f:
                data = yaml.safe_load(f) or {}
        except yaml.YAMLError as e:
            logging.error(f"Error parsing {memory_file}: {e}")
            data = {}
    else:
        data = {}
    
    # Ensure proper structure
    if 'lessons_learned' not in data:
        data['lessons_learned'] = {}
    if 'metadata' not in data:
        data['metadata'] = {
            'created_date': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat(),
            'sdk_version': '1.0.0',
            'total_solutions': 0
        }
    
    return data

def update_metadata(data):
    """Update metadata with current stats."""
    total_solutions = sum(
        len(category_data) 
        for category_data in data['lessons_learned'].values()
    )
    
    data['metadata'].update({
        'last_updated': datetime.now().isoformat(),
        'total_solutions': total_solutions
    })

def add_solution(problem, category, solution, memory_file='structured_memory.yaml'):
    """Add or update a solution in memory."""
    # Create backup before modifying
    backup_memory(memory_file)
    
    # Load existing data
    data = load_memory(memory_file)
    
    # Ensure category exists
    if category not in data['lessons_learned']:
        data['lessons_learned'][category] = {}
    
    # Add solution with metadata
    solution_data = {
        'solution': solution,
        'created_date': datetime.now().isoformat(),
        'use_count': 1
    }
    
    # If solution already exists, increment use_count
    if problem in data['lessons_learned'][category]:
        existing = data['lessons_learned'][category][problem]
        solution_data['use_count'] = existing.get('use_count', 0) + 1
        solution_data['created_date'] = existing.get('created_date', solution_data['created_date'])
    
    data['lessons_learned'][category][problem] = solution_data
    
    # Update metadata
    update_metadata(data)
    
    # Save updated data
    with open(memory_file, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    
    logging.info(f"Solution added to {category}: {problem}")
    return data

def categorise_error_cli(error_message):
    """Simple CLI-based error categorization."""
    error_keywords = {
        'authentication': ['oauth', 'auth', 'token', 'credential', 'unauthorized'],
        'networking': ['http', 'connection', 'network', 'timeout', 'dns'],
        'database': ['db', 'database', 'sql', 'query', 'deadlock'],
        'filesystem': ['file', 'permission', 'disk', 'directory', 'path'],
        'memory': ['memory', 'heap', 'stack', 'allocation'],
        'configuration': ['config', 'env', 'property', 'setting', 'yaml'],
        'api': ['rate', 'quota', 'endpoint', 'request', 'service'],
        'concurrency': ['race', 'deadlock', 'thread', 'async', 'promise'],
        'validation': ['schema', 'invalid', 'mismatch', 'format', 'required'],
        'build': ['compilation', 'dependency', 'version', 'build', 'import']
    }
    
    error_lower = error_message.lower()
    for category, keywords in error_keywords.items():
        if any(keyword in error_lower for keyword in keywords):
            return category
    
    return 'errors_uncategorised'

def main():
    """CLI interface for updating memory."""
    if len(sys.argv) < 3:
        print("Usage: python update_memory.py <problem> <solution> [category]")
        print("       python update_memory.py <problem> <category> <solution>")
        print("\nExample:")
        print("  python update_memory.py 'OAuth PKCE intent not triggering' 'Check manifest.json permissions' authentication")
        sys.exit(1)
    
    if len(sys.argv) == 3:
        problem, solution = sys.argv[1], sys.argv[2]
        category = categorise_error_cli(problem)
    elif len(sys.argv) == 4:
        problem, arg2, arg3 = sys.argv[1], sys.argv[2], sys.argv[3]
        # Try to determine if arg2 is category or solution
        categories = ['authentication', 'networking', 'database', 'filesystem', 
                     'memory', 'configuration', 'api', 'concurrency', 'validation', 
                     'build', 'errors_uncategorised']
        
        if arg2 in categories:
            category, solution = arg2, arg3
        else:
            solution, category = arg2, arg3
    
    try:
        logging.info(f"Updating memory for problem: {problem}, category: {category}")
        result = add_solution(problem, category, solution)
        logging.info(f"Memory updated successfully! Total solutions: {result['metadata']['total_solutions']}")
    except Exception as e:
        logging.error(f"Error updating memory: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()