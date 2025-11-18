class TypographyInspector {
  constructor() {
    this.currentData = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSettings();
    this.refresh();
  }

  bindEvents() {
    document.getElementById('refresh').addEventListener('click', () => this.refresh());
    document.getElementById('copy').addEventListener('click', () => this.copyToClipboard());
    document.getElementById('export').addEventListener('click', () => this.exportData());
    
    document.getElementById('toggleHighlightMode').addEventListener('change', (e) => {
      this.toggleHoverMode(e.target.checked);
    });

    // Auto-refresh when popup opens
    document.addEventListener('DOMContentLoaded', () => this.refresh());
  }

  async loadSettings() {
    const settings = await chrome.storage.sync.get({
      hoverMode: false,
      showSystemFonts: true,
      maxElements: 1000
    });
    
    document.getElementById('toggleHighlightMode').checked = settings.hoverMode;
    if (settings.hoverMode) {
      this.toggleHoverMode(true);
    }
  }

  async sendMessageToActiveTab(msg) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // Inject content script if not already injected
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(() => {}); // Ignore if already injected

      const response = await chrome.tabs.sendMessage(tab.id, msg);
      return response;
    } catch (error) {
      console.error('Message failed:', error);
      this.showError('Please refresh the page and try again');
      return null;
    }
  }

  createAccordionItem(font, index) {
    const isWebFont = font.isWebFont ? '<span class="web-font-badge">WEB</span>' : '<span class="system-font-badge">SYSTEM</span>';
    
    return `
    <div class="accordion-item">
      <h2 class="accordion-header" id="heading${index}">
        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}">
          <strong>${font.family}</strong> 
          ${isWebFont}
          <span class="badge bg-primary ms-2">${font.count}</span>
        </button>
      </h2>
      <div id="collapse${index}" class="accordion-collapse collapse" data-bs-parent="#fontAccordion">
        <div class="accordion-body">
          <div class="stats-grid">
            <div class="stat-item">
              <strong>Sizes</strong><br>
              ${font.sizes.slice(0, 3).join(', ')}${font.sizes.length > 3 ? '...' : ''}
            </div>
            <div class="stat-item">
              <strong>Weights</strong><br>
              ${font.weights.slice(0, 3).join(', ')}${font.weights.length > 3 ? '...' : ''}
            </div>
          </div>
          
          <div class="font-sample" style="font-family:'${font.family}'; font-size:${font.commonSize}; font-weight:${font.commonWeight};">
            The quick brown fox jumps over the lazy dog.
          </div>
          
          <div class="controls">
            <button class="btn btn-warning highlight-btn" data-family="${font.family}">
              🔍 Highlight
            </button>
            <button class="btn btn-secondary clear-btn">
              🧹 Clear
            </button>
            <button class="btn btn-info copy-font-btn" data-family="${font.family}">
              📋 CSS
            </button>
          </div>
          
          ${font.example ? `
            <details class="mt-2">
              <summary class="small">Example Element</summary>
              <code class="small d-block mt-1 p-2 bg-dark text-light rounded">${font.example.selector}</code>
            </details>
          ` : ''}
        </div>
      </div>
    </div>`;
  }

  renderFonts(data) {
    const accordion = document.getElementById('fontAccordion');
    
    if (!data.fonts || data.fonts.length === 0) {
      accordion.innerHTML = '<div class="text-center text-muted p-3">No fonts found on this page</div>';
      return;
    }

    accordion.innerHTML = data.fonts.map((font, index) => 
      this.createAccordionItem(font, index)
    ).join('');

    // Bind event listeners
    this.bindFontEvents();
    
    // Update web fonts count
    const webFontsCount = data.fonts.filter(f => f.isWebFont).length;
    const webFontsBadge = document.getElementById('web-fonts-count');
    if (webFontsCount > 0) {
      webFontsBadge.textContent = `${webFontsCount} web fonts`;
      webFontsBadge.classList.remove('d-none');
    } else {
      webFontsBadge.classList.add('d-none');
    }
  }

  bindFontEvents() {
    // Highlight buttons
    document.querySelectorAll('.highlight-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.sendMessageToActiveTab({ 
          type: 'highlight', 
          family: btn.dataset.family 
        });
      });
    });

    // Clear buttons
    document.querySelectorAll('.clear-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.sendMessageToActiveTab({ type: 'clear-highlights' });
      });
    });

    // Copy CSS buttons
    document.querySelectorAll('.copy-font-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.copyFontCSS(btn.dataset.family);
      });
    });
  }

  async refresh() {
    const meta = document.getElementById('meta');
    const statusAlert = document.getElementById('status-alert');
    
    meta.textContent = 'Scanning...';
    statusAlert.classList.remove('d-none');
    document.getElementById('status-text').textContent = 'Collecting typography data...';

    try {
      const response = await this.sendMessageToActiveTab({ type: 'get-typography' });
      
      if (!response) {
        throw new Error('No response from page');
      }

      this.currentData = response;
      this.renderFonts(response);
      
      meta.textContent = `${response.fonts.length} fonts, ${response.totalElements} elements`;
      statusAlert.classList.add('d-none');
      
    } catch (error) {
      console.error('Refresh failed:', error);
      meta.textContent = 'Error - Refresh page';
      statusAlert.classList.remove('d-none');
      document.getElementById('status-text').textContent = 'Error: Please refresh the page and try again';
      this.showError('Failed to scan page. Please refresh and try again.');
    }
  }

  async toggleHoverMode(enabled) {
    await this.sendMessageToActiveTab({ 
      type: enabled ? 'enable-hover' : 'disable-hover' 
    });
    
    await chrome.storage.sync.set({ hoverMode: enabled });
  }

  copyToClipboard() {
    if (!this.currentData) {
      this.showError('No data to copy');
      return;
    }

    navigator.clipboard.writeText(JSON.stringify(this.currentData, null, 2));
    this.showToast('copyToast');
  }

  copyFontCSS(fontFamily) {
    const font = this.currentData.fonts.find(f => f.family === fontFamily);
    if (!font) return;

    const css = `
/* ${fontFamily} - Typography Inspector */
font-family: ${fontFamily};
font-size: ${font.commonSize};
font-weight: ${font.commonWeight};
line-height: ${font.commonLineHeight};
    `.trim();

    navigator.clipboard.writeText(css);
    this.showToast('copyToast');
  }

  exportData() {
    if (!this.currentData) {
      this.showError('No data to export');
      return;
    }

    const dataStr = JSON.stringify(this.currentData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `typography-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  showToast(toastId) {
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
  }

  showError(message) {
    document.getElementById('error-message').textContent = message;
    this.showToast('errorToast');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TypographyInspector());
} else {
  new TypographyInspector();
}