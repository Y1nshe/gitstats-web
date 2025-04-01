/**
 * Path selector component
 * @param {string} inputId - DOM ID of the input field
 * @param {string} toggleButtonId - DOM ID of the expand/collapse button
 * @param {string} directorySelectorId - DOM ID of the subdirectory selector container
 * @param {string} rootPathId - DOM ID of the root path input field
 * @param {string} platform - Platform type ('WINDOWS' or 'LINUX')
 */
class PathSelector {
  constructor(inputId, toggleButtonId, directorySelectorId, rootPathId, platform) {
    // Get DOM elements
    this.inputElement = document.getElementById(inputId);
    this.toggleButton = document.getElementById(toggleButtonId);
    this.directorySelector = document.getElementById(directorySelectorId);
    this.rootPathElement = document.getElementById(rootPathId);

    // Check if elements exist
    if (!this.inputElement || !this.toggleButton || !this.directorySelector ||
        !this.rootPathElement) {
      console.error("Required DOM elements not found");
      return;
    }

    // Store platform type
    this.platform = platform;

    // Add base CSS classes
    this.inputElement.classList.add('path-input');
    this.toggleButton.classList.add('toggle-button');
    this.directorySelector.classList.add('directory-selector');

    // Internal state - always use Linux format
    this.expanded = false;
    this.currentPath = '';  // Can be empty as rootPath is guaranteed to be at least '/'
    this.loading = false;

    // Bind events
    this.toggleButton.addEventListener('click', this.toggleExpand.bind(this));
    this.inputElement.addEventListener('input', this.handleInputChange.bind(this), true);
  }

  // Convert Linux path to Windows path for display
  linuxToWindowsPath(linuxPath) {
    if (!linuxPath || linuxPath === '/') return '';

    // Remove leading slash
    linuxPath = linuxPath.substring(1);
    let [drive, ...rest] = linuxPath.split('/');
    // Check if first part is a single letter (drive letter)
    if (/^[a-zA-Z]$/.test(drive)) {
      drive = drive.toUpperCase() + ':';
    }
    const restPath = rest.join('\\');
    const resultPath = drive + '\\' + restPath;
    return restPath ? resultPath + '\\' : resultPath;
  }

  // Convert Windows path to Linux path for internal storage
  windowsToLinuxPath(winPath) {
    if (!winPath || winPath === '/' || winPath === '\\') return '';

    // Handle absolute paths (e.g., C:\path\to\directory)
    if (/^[a-zA-Z]:/.test(winPath)) {
      const [drive, path] = winPath.split(':', 2);
      winPath = `${drive.toLowerCase()}${path}`;
    }

    // Handle relative paths or paths already in Linux format
    return '/' + winPath.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  // Update input display based on platform
  updateInputDisplay(updatePath) {
    // Update input value and trigger input event
    let displayPath = this.platform === 'WINDOWS' ?
      this.linuxToWindowsPath(updatePath) : updatePath;
    this.inputElement.value = displayPath;
  }

  // Get the full path in Linux format for backend communication
  getFullPath() {
    const rootPath = this.rootPathElement.value;
    return rootPath + this.currentPath;
  }

  toggleExpand() {
    this.expanded = !this.expanded;

    if (this.expanded) {
      // Update button and directory selector state
      this.toggleButton.classList.add('expanded');
      this.directorySelector.classList.add('expanded');
      this.toggleButton.textContent = 'Collapse';

      // Initialize with current path
      this.fetchDirectories();
    } else {
      // Collapse directory selector
      this.toggleButton.classList.remove('expanded');
      this.directorySelector.classList.remove('expanded');
      this.toggleButton.textContent = 'Browse';
      this.directorySelector.innerHTML = '';  // Clear directory list
    }
  }

  handleInputChange() {
    // Convert input value to Linux format
    const inputValue = this.inputElement.value;
    this.currentPath = this.platform === 'WINDOWS'
      ? this.windowsToLinuxPath(inputValue) : inputValue;

    // Only fetch directories when expanded
    if (this.expanded) {
      this.fetchDirectories();
    }
  }

  async fetchDirectories() {
    if (this.loading) return;

    this.loading = true;
    this.directorySelector.innerHTML = '<div class="loading-indicator">Loading...</div>';

    try {
      const response = await fetch('/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: this.getFullPath() })
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      this.renderDirectories(data.directories);
    } catch (error) {
      this.directorySelector.innerHTML = `
        <div class="error-message">
          ${error.message}
        </div>`;
      console.error('Error fetching directories:', error);
    } finally {
      this.loading = false;
    }
  }

  renderDirectories(directories) {
    // Clear and prepare content
    this.directorySelector.innerHTML = '';

    // Create directory list
    const list = document.createElement('ul');
    list.className = 'directory-list';

    // Add parent directory option if not at root
    if (this.currentPath) {
      const parentItem = this.createDirectoryItem('..', true);
      list.appendChild(parentItem);
    }

    // Filter and format directories based on platform and root path
    let processedDirectories = directories;
    if (this.platform === 'WINDOWS' && !this.currentPath) {
      processedDirectories = directories
        .filter(dir => /^[a-zA-Z]$/.test(dir))  // Only keep single letter directories (drive letters)
        .map(dir => dir.toUpperCase() + ':');   // Convert to drive letter format (e.g., 'C:')
    }

    // Add directories
    processedDirectories.forEach(dir => {
      const item = this.createDirectoryItem(dir);
      list.appendChild(item);
    });

    this.directorySelector.appendChild(list);
  }

  createDirectoryItem(text, isParentDir = false) {
    const item = document.createElement('li');
    item.className = 'directory-item';
    if (isParentDir) {
      item.classList.add('parent-dir');
    }
    item.textContent = text;

    item.addEventListener('click', () => {
      if (isParentDir) {
        this.navigateUp();
      } else {
        this.selectDirectory(text);
      }
    });

    return item;
  }

  navigateUp() {
    const parts = this.currentPath.split('/');
    parts.pop();
    this.updateInputDisplay(parts.join('/'));
    this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  }

  selectDirectory(directoryName) {
    let processedDirectoryName = directoryName;
    // Handle Windows drive letter selection
    if (this.platform === 'WINDOWS' && !this.currentPath) {
      // If a drive letter is selected (e.g., 'C:'), remove the colon and convert to lowercase
      if (directoryName.endsWith(':')) {
        processedDirectoryName = directoryName.slice(0, -1).toLowerCase();
      }
    }

    this.updateInputDisplay(this.currentPath + '/' + processedDirectoryName);
    this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Export the PathSelector class
export default PathSelector;
