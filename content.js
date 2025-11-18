class TypographyCollector {
  constructor() {
    this.highlightedElements = [];
    this.isHoverMode = false;
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.injectHoverStyles();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        switch (msg.type) {
          case 'get-typography':
            sendResponse(this.collectTypography());
            break;
            
          case 'highlight':
            this.highlightByFamily(msg.family);
            sendResponse({ ok: true, highlighted: this.highlightedElements.length });
            break;
            
          case 'clear-highlights':
            this.clearHighlights();
            sendResponse({ ok: true });
            break;
            
          case 'enable-hover':
            this.enableHoverMode();
            sendResponse({ ok: true });
            break;
            
          case 'disable-hover':
            this.disableHoverMode();
            sendResponse({ ok: true });
            break;
            
          default:
            sendResponse({ error: 'Unknown message type' });
        }
      } catch (error) {
        console.error('Typography Inspector error:', error);
        sendResponse({ error: error.message });
      }
      
      return true; // Keep message channel open for async response
    });
  }

  injectHoverStyles() {
    if (document.getElementById('typography-inspector-styles')) return;

    const styles = `
      .typography-inspector-highlight {
        outline: 3px solid rgba(255, 165, 0, 0.9) !important;
        outline-offset: 2px !important;
        position: relative;
        z-index: 10000;
      }
      
      .typography-inspector-hover-info {
        position: fixed;
        z-index: 100000;
        background: #1a1a1a;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-family: system-ui, sans-serif;
        pointer-events: none;
        transform: translateY(-100%);
        margin-top: -10px;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      
      .typography-inspector-hover-info::after {
        content: '';
        position: absolute;
        bottom: -5px;
        left: 20px;
        width: 10px;
        height: 10px;
        background: #1a1a1a;
        transform: rotate(45deg);
      }
    `;

    const styleTag = document.createElement('style');
    styleTag.id = 'typography-inspector-styles';
    styleTag.textContent = styles;
    document.head.appendChild(styleTag);
  }

  normalizeFontFamily(rawFamily) {
    if (!rawFamily) return '';
    return rawFamily.split(',')[0].trim().replace(/^['"]+|['"]+$/g, '');
  }

  isWebFont(fontFamily) {
    // Check if font is likely a web font (not system font)
    const systemFonts = [
      'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Courier New',
      'Courier', 'Verdana', 'Georgia', 'Palatino', 'Garamond',
      'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black',
      'Impact', 'system-ui', 'Segoe UI', 'Roboto', '-apple-system',
      'BlinkMacSystemFont'
    ];
    
    return !systemFonts.some(systemFont => 
      fontFamily.toLowerCase().includes(systemFont.toLowerCase())
    );
  }

  collectTypography() {
    const allElements = Array.from(document.querySelectorAll('*'));
    const fontMap = new Map();
    let scannedCount = 0;

    for (const element of allElements) {
      if (scannedCount > 5000) break; // Performance limit
      
      try {
        const styles = window.getComputedStyle(element);
        const fontFamily = this.normalizeFontFamily(styles.fontFamily);
        
        if (!fontFamily || fontFamily === 'inherit') continue;

        scannedCount++;

        if (!fontMap.has(fontFamily)) {
          fontMap.set(fontFamily, {
            family: fontFamily,
            count: 0,
            sizes: new Set(),
            weights: new Set(),
            lineHeights: new Set(),
            letterSpacings: new Set(),
            isWebFont: this.isWebFont(fontFamily),
            example: null
          });
        }

        const entry = fontMap.get(fontFamily);
        entry.count++;
        entry.sizes.add(styles.fontSize || '16px');
        entry.weights.add(styles.fontWeight || '400');
        entry.lineHeights.add(styles.lineHeight || 'normal');
        entry.letterSpacings.add(styles.letterSpacing || 'normal');

        if (!entry.example) {
          entry.example = {
            selector: this.getElementSelector(element),
            outerHTML: element.outerHTML?.substring(0, 200) || ''
          };
        }
      } catch (error) {
        // Skip elements that can't be styled (like SVGs in foreignObject)
        continue;
      }
    }

    const fonts = Array.from(fontMap.values())
      .map(entry => ({
        ...entry,
        sizes: Array.from(entry.sizes).sort((a, b) => 
          parseFloat(a) - parseFloat(b)
        ).slice(0, 10),
        weights: Array.from(entry.weights).sort().slice(0, 10),
        lineHeights: Array.from(entry.lineHeights).slice(0, 5),
        letterSpacings: Array.from(entry.letterSpacings).slice(0, 5),
        commonSize: this.getMostCommon(Array.from(entry.sizes)),
        commonWeight: this.getMostCommon(Array.from(entry.weights)),
        commonLineHeight: this.getMostCommon(Array.from(entry.lineHeights))
      }))
      .sort((a, b) => b.count - a.count);

    return {
      fonts,
      totalElements: scannedCount,
      timestamp: new Date().toISOString(),
      url: window.location.href
    };
  }

  getMostCommon(array) {
    return array.sort((a, b) =>
      array.filter(v => v === a).length - array.filter(v => v === b).length
    ).pop() || array[0] || '';
  }

  getElementSelector(element) {
    if (!element || !element.tagName) return 'unknown';
    
    const parts = [];
    let current = element;
    
    for (let i = 0; i < 5 && current && current.nodeType === 1; i++) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      } else {
        if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\s+/).slice(0, 2);
          if (classes.length > 0) {
            selector += `.${classes.join('.')}`;
          }
        }
        
        const sameTagSiblings = Array.from(current.parentElement?.children || [])
          .filter(child => child.tagName === current.tagName);
        
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
        
        parts.unshift(selector);
        current = current.parentElement;
      }
    }
    
    return parts.join(' > ') || element.tagName.toLowerCase();
  }

  highlightByFamily(fontFamily) {
    this.clearHighlights();
    
    const elements = Array.from(document.querySelectorAll('*'));
    const matchingElements = [];

    for (const element of elements) {
      try {
        const styles = window.getComputedStyle(element);
        const elementFont = this.normalizeFontFamily(styles.fontFamily);
        
        if (elementFont === fontFamily) {
          element.classList.add('typography-inspector-highlight');
          matchingElements.push(element);
        }
      } catch (error) {
        continue;
      }
    }

    this.highlightedElements = matchingElements;

    if (matchingElements.length > 0) {
      matchingElements[0].scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }

  clearHighlights() {
    this.highlightedElements.forEach(element => {
      element.classList.remove('typography-inspector-highlight');
    });
    this.highlightedElements = [];
  }

  enableHoverMode() {
    if (this.isHoverMode) return;
    
    this.isHoverMode = true;
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
  }

  disableHoverMode() {
    if (!this.isHoverMode) return;
    
    this.isHoverMode = false;
    document.removeEventListener('mouseover', this.handleMouseOver.bind(this));
    document.removeEventListener('mouseout', this.handleMouseOut.bind(this));
    this.removeHoverInfo();
  }

  handleMouseOver(event) {
    const element = event.target;
    
    try {
      const styles = window.getComputedStyle(element);
      const fontFamily = this.normalizeFontFamily(styles.fontFamily);
      
      if (!fontFamily) return;

      this.showHoverInfo(element, {
        fontFamily,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        lineHeight: styles.lineHeight
      });
    } catch (error) {
      // Ignore errors on some elements
    }
  }

  handleMouseOut(event) {
    this.removeHoverInfo();
  }

  showHoverInfo(element, fontInfo) {
    this.removeHoverInfo();
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'typography-inspector-hover-info';
    infoDiv.innerHTML = `
      <div><strong>Font:</strong> ${fontInfo.fontFamily}</div>
      <div><strong>Size:</strong> ${fontInfo.fontSize}</div>
      <div><strong>Weight:</strong> ${fontInfo.fontWeight}</div>
      <div><strong>Line Height:</strong> ${fontInfo.lineHeight}</div>
    `;
    
    document.body.appendChild(infoDiv);
    this.currentHoverInfo = infoDiv;
    
    this.positionHoverInfo(element, infoDiv);
  }

  positionHoverInfo(element, infoDiv) {
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    let top = rect.top + scrollY;
    let left = rect.left + scrollX + (rect.width / 2);
    
    // Adjust position to stay in viewport
    const infoRect = infoDiv.getBoundingClientRect();
    if (left + infoRect.width > window.innerWidth) {
      left = window.innerWidth - infoRect.width - 10;
    }
    if (left < 0) left = 10;
    
    if (top - infoRect.height < 0) {
      top = rect.bottom + scrollY + 10;
      infoDiv.style.transform = 'translateY(0)';
      infoDiv.style.marginTop = '10px';
    } else {
      top = rect.top + scrollY;
      infoDiv.style.transform = 'translateY(-100%)';
      infoDiv.style.marginTop = '-10px';
    }
    
    infoDiv.style.left = `${left}px`;
    infoDiv.style.top = `${top}px`;
  }

  removeHoverInfo() {
    if (this.currentHoverInfo) {
      this.currentHoverInfo.remove();
      this.currentHoverInfo = null;
    }
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TypographyCollector());
} else {
  new TypographyCollector();
}