/**
 * Path selector component
 * @param {string} inputId - DOM ID of the input field
 * @param {string} toggleButtonId - DOM ID of the expand/collapse button
 * @param {string} directorySelectorId - DOM ID of the subdirectory selector container
 */
class PathSelector {
  constructor(inputId, toggleButtonId, directorySelectorId) {
    // Get DOM elements
    this.inputElement = document.getElementById(inputId);
    this.toggleButton = document.getElementById(toggleButtonId);
    this.directorySelector = document.getElementById(directorySelectorId);

    // Check if elements exist
    if (!this.inputElement || !this.toggleButton || !this.directorySelector) {
      console.error("Required DOM elements not found");
      return;
    }

    // Add base CSS classes
    this.inputElement.classList.add('path-input');
    this.toggleButton.classList.add('toggle-button');
    this.directorySelector.classList.add('directory-selector');

    // Internal state
    this.expanded = false;
    this.currentPath = '';
    this.loading = false;

    // Bind events
    this.toggleButton.addEventListener('click', this.toggleExpand.bind(this));
    this.inputElement.addEventListener('input', this.handleInputChange.bind(this));
  }

  toggleExpand() {
    this.expanded = !this.expanded;

    if (this.expanded) {
      // Update button and directory selector state
      this.toggleButton.classList.add('expanded');
      this.directorySelector.classList.add('expanded');
      this.toggleButton.textContent = 'Collapse';

      // Initialize with current input value
      this.currentPath = this.inputElement.value;
      this.fetchDirectories(this.currentPath);
    } else {
      // Collapse directory selector
      this.toggleButton.classList.remove('expanded');
      this.directorySelector.classList.remove('expanded');
      this.toggleButton.textContent = 'Expand';
    }
  }

  handleInputChange() {
    // Only respond to input changes when expanded
    if (this.expanded) {
      this.currentPath = this.inputElement.value;
      this.fetchDirectories(this.currentPath);
    }
  }

  async fetchDirectories(path) {
    if (this.loading) return;

    this.loading = true;
    this.directorySelector.innerHTML = '<div class="loading-indicator">Loading...</div>';

    try {
      const response = await fetch('/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: path })
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      this.renderDirectories(data.directories, data.current_path);
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

    // Add up navigation option (if not root directory)
    if (this.currentPath !== '/' && this.currentPath !== '') {
      const upItem = this.createDirectoryItem('.. (Up)', true);
      upItem.addEventListener('click', () => this.navigateUp(this.currentPath));
      list.appendChild(upItem);
    }

    // Add subdirectory list
    if (directories.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'empty-directory';
      emptyItem.textContent = 'No subdirectories in this directory';
      this.directorySelector.appendChild(emptyItem);
    } else {
      directories.forEach(dir => {
        const item = this.createDirectoryItem(dir);
        item.addEventListener('click', () => this.selectDirectory(dir, this.currentPath));
        list.appendChild(item);
      });
    }

    this.directorySelector.appendChild(list);
  }

  createDirectoryItem(text, isParentDir = false) {
    const item = document.createElement('li');
    item.className = 'directory-item';
    if (isParentDir) {
      item.classList.add('parent-dir');
    }
    item.textContent = text;
    return item;
  }

  navigateUp(currentPath) {
    // Get parent directory
    const lastSlashIndex = currentPath.lastIndexOf('/');
    let parentPath;

    if (lastSlashIndex === -1) {
      parentPath = '';
    } else {
      parentPath = currentPath.substring(0, lastSlashIndex);
      if (parentPath === '') {
        parentPath = '/';
      }
    }

    this.inputElement.value = parentPath;
    this.currentPath = parentPath;
    this.fetchDirectories(parentPath);
  }

  selectDirectory(directoryName, currentPath) {
    // Build new path
    let newPath;

    if (currentPath === '/' || currentPath === '') {
      newPath = `${currentPath}${directoryName}`;
    } else {
      newPath = `${currentPath}/${directoryName}`;
    }

    // Normalize path (prevent double slashes)
    newPath = newPath.replace(/\/\//g, '/');

    // Update input field
    this.inputElement.value = newPath;
    this.currentPath = newPath;

    // Fetch subdirectories for new path
    this.fetchDirectories(newPath);
  }
}

export default PathSelector;
