import os

mapping = {
    # Old pure black palette
    '#333': '#344027',
    '#666': '#A2B38B',
    '#888': '#C9DEB0',
    '#111': '#161C10',
    '#222': '#222B18',
    '#0a0a0a': '#11150C',
    
    # First attempt olive palette (which lacked contrast)
    '#3B4433': '#344027',
    '#6B735E': '#A2B38B',
    '#8B947A': '#C9DEB0',
    '#161B12': '#11150C',
    '#1A1F16': '#161C10',
    '#2D3526': '#222B18'
}

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    original = content
    for old, new in mapping.items():
        # Replace only if it's likely a hex color (e.g., ends a class or string)
        content = content.replace(f'{old}]', f'{new}]')
        content = content.replace(f'{old}"', f'{new}"')
        content = content.replace(f'{old};', f'{new};')
        
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

component_dir = os.path.join(os.path.dirname(__file__), '..', 'src', 'components')
app_file = os.path.join(os.path.dirname(__file__), '..', 'src', 'App.jsx')

for root, _, files in os.walk(component_dir):
    for file in files:
        if file.endswith('.jsx'):
            replace_in_file(os.path.join(root, file))
            
replace_in_file(app_file)
