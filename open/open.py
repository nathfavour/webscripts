import os
import re
import webbrowser
import subprocess

# Allowed file extensions and URL schemes
ALLOWED_EXTENSIONS = ['.txt', '.md', '.log']
ALLOWED_SCHEMES = ['http', 'https']

def is_android():
    """Detect if the script is running on Android."""
    return (
        'ANDROID_ROOT' in os.environ
        or 'ANDROID_DATA' in os.environ
        or (hasattr(os, 'uname') and 'android' in os.uname().release.lower())
    )

def find_files(root_dir, extensions):
    """Recursively find files with allowed extensions."""
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if any(filename.lower().endswith(ext) for ext in extensions):
                yield os.path.join(dirpath, filename)

def extract_links(text, schemes):
    """Extract URLs with allowed schemes from text."""
    pattern = re.compile(r'\b(' + '|'.join(schemes) + r')://[^\s<>"\'\]\)]+', re.IGNORECASE)
    return pattern.findall(text), pattern.finditer(text)

def get_all_links(files, schemes):
    """Get all links from the given files."""
    links = []
    for file in files:
        try:
            with open(file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                matches = re.findall(r'\b(?:' + '|'.join(schemes) + r')://[^\s<>"\'\]\)]+', content, re.IGNORECASE)
                links.extend(matches)
        except Exception as e:
            print(f"Error reading {file}: {e}")
    return links

def main():
    cwd = os.getcwd()
    print(f"Scanning directory: {cwd}")
    files = list(find_files(cwd, ALLOWED_EXTENSIONS))
    print(f"Found {len(files)} files with allowed extensions.")

    links = get_all_links(files, ALLOWED_SCHEMES)
    unique_links = list(dict.fromkeys(links))  # Remove duplicates, preserve order

    if not unique_links:
        print("No links found.")
        return

    print(f"Found {len(unique_links)} unique links.")
    use_xdg_open = is_android()

    for idx, link in enumerate(unique_links, 1):
        print(f"\n[{idx}/{len(unique_links)}] Opening: {link}")
        if use_xdg_open:
            subprocess.run(['xdg-open', link])
        else:
            webbrowser.open(link)
        input("Press Enter to open the next link...")

if __name__ == "__main__":
    main()