class OptionsManager {
  constructor() {
    this.defaultSettings = {
      showSystemFonts: true,
      autoRefresh: true,
      maxElements: 5000,
      highlightColor: '#ffa500',
      includeHTML: false
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
  }

  async loadSettings() {
    const settings = await chrome.storage.sync.get(this.defaultSettings);
    
    // Populate form fields
    document.getElementById('showSystemFonts').checked = settings.showSystemFonts;
    document.getElementById('autoRefresh').checked = settings.autoRefresh;
    document.getElementById('maxElements').value = settings.maxElements;
    document.getElementById('highlightColor').value = settings.highlightColor;
    document.getElementById('includeHTML').checked = settings.includeHTML;
  }

  bindEvents() {
    document.getElementById('options-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    document.getElementById('reset').addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        this.resetSettings();
      }
    });
  }

  async saveSettings() {
    const settings = {
      showSystemFonts: document.getElementById('showSystemFonts').checked,
      autoRefresh: document.getElementById('autoRefresh').checked,
      maxElements: parseInt(document.getElementById('maxElements').value),
      highlightColor: document.getElementById('highlightColor').value,
      includeHTML: document.getElementById('includeHTML').checked
    };

    await chrome.storage.sync.set(settings);
    
    this.showAlert('✅ Settings saved successfully!', 'success');
  }

  async resetSettings() {
    await chrome.storage.sync.set(this.defaultSettings);
    await this.loadSettings();
    this.showAlert('✅ Settings reset to defaults!', 'success');
  }

  showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show mt-3`;
    alertDiv.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.querySelector('form').appendChild(alertDiv);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      alertDiv.remove();
    }, 3000);
  }
}

// Initialize options manager
new OptionsManager();