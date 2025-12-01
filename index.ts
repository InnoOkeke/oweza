// ====================================
// CRYPTO POLYFILLS - MUST BE FIRST
// ====================================
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import QuickCrypto, { install } from 'react-native-quick-crypto';

// Install react-native-quick-crypto polyfills
install();

// Explicitly ensure global.crypto uses the webcrypto implementation from QuickCrypto
// The default export has a 'webcrypto' property that contains the standard API
if (!(global as any).crypto) {
  (global as any).crypto = QuickCrypto.webcrypto;
} else {
  // If crypto exists, extend it with QuickCrypto.webcrypto properties
  Object.assign((global as any).crypto, QuickCrypto.webcrypto);
}

// Load our custom crypto polyfill for randomBytes (if needed as fallback)
const cryptoPolyfill = require('./crypto-polyfill');

// Add randomBytes to global.crypto if missing
if (!(global as any).crypto.randomBytes) {
  (global as any).crypto.randomBytes = cryptoPolyfill.randomBytes;
}

// Add Node.js crypto stub methods for compatibility
if (!(global as any).crypto.getCiphers) {
  (global as any).crypto.getCiphers = cryptoPolyfill.getCiphers;
}
if (!(global as any).crypto.getHashes) {
  (global as any).crypto.getHashes = cryptoPolyfill.getHashes;
}

// Set up browserCrypto for libraries that expect it
// We explicitly use QuickCrypto.webcrypto here to ensure subtle is present
(global as any).browserCrypto = QuickCrypto.webcrypto;

// If QuickCrypto.webcrypto didn't have subtle, copy it from our global.crypto
if (!(global as any).browserCrypto.subtle && (global as any).crypto.subtle) {
  (global as any).browserCrypto.subtle = (global as any).crypto.subtle;
}

// Ensure browserCrypto has randomBytes too
if (!(global as any).browserCrypto.randomBytes) {
  (global as any).browserCrypto.randomBytes = (global as any).crypto.randomBytes;
}

// Polyfill document for web libraries
if (typeof (global as any).document === 'undefined') {
  (global as any).document = {
    createElement: () => ({}),
    createElementNS: () => ({}),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    addEventListener: () => { },
    removeEventListener: () => { },
    createTreeWalker: () => ({
      nextNode: () => null,
      currentNode: null,
    }),
    createNodeIterator: () => ({
      nextNode: () => null,
    }),
    body: {},
    head: {},
    documentElement: {},
  };
}

// Polyfill customElements for web components
if (typeof (global as any).customElements === 'undefined') {
  (global as any).customElements = {
    define: () => { },
    get: () => undefined,
    whenDefined: () => Promise.resolve(),
    upgrade: () => { },
  };
}

// Polyfill CSSStyleSheet for web components
if (typeof (global as any).CSSStyleSheet === 'undefined') {
  (global as any).CSSStyleSheet = class CSSStyleSheet {
    cssRules = [];
    insertRule() { return 0; }
    deleteRule() { }
    replace() { return Promise.resolve(this); }
    replaceSync() { }
  };
}

// Polyfill ShadowRoot for web components
if (typeof (global as any).ShadowRoot === 'undefined') {
  (global as any).ShadowRoot = class ShadowRoot { };
}

// Polyfill HTMLElement and other DOM classes
if (typeof (global as any).HTMLElement === 'undefined') {
  (global as any).HTMLElement = class HTMLElement {
    style = {};
    classList = {
      add: () => { },
      remove: () => { },
      contains: () => false,
      toggle: () => false,
    };
    setAttribute() { }
    getAttribute() { return null; }
    removeAttribute() { }
    addEventListener() { }
    removeEventListener() { }
    appendChild() { return this; }
    removeChild() { return this; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  };
}

// Polyfill other DOM element types
if (typeof (global as any).Element === 'undefined') {
  (global as any).Element = (global as any).HTMLElement;
}
if (typeof (global as any).Node === 'undefined') {
  (global as any).Node = class Node { };
}
if (typeof (global as any).Text === 'undefined') {
  (global as any).Text = class Text { };
}
if (typeof (global as any).Comment === 'undefined') {
  (global as any).Comment = class Comment { };
}
if (typeof (global as any).DocumentFragment === 'undefined') {
  (global as any).DocumentFragment = class DocumentFragment { };
}

// Also set on globalThis for maximum compatibility
(globalThis as any).browserCrypto = (global as any).browserCrypto;

// Set up window and self for browser-like environments
if (typeof (global as any).window === "undefined") {
  (global as any).window = global;
}
if (typeof (global as any).self === "undefined") {
  (global as any).self = global;
}

// Ensure window.crypto and self.crypto exist and have subtle
if (typeof (global as any).window.crypto === 'undefined') {
  (global as any).window.crypto = (global as any).crypto;
} else {
  // If window.crypto exists, ensure it has subtle
  if (!(global as any).window.crypto.subtle) {
    (global as any).window.crypto.subtle = (global as any).crypto.subtle;
  }
  // Also ensure it has getRandomValues
  if (!(global as any).window.crypto.getRandomValues) {
    (global as any).window.crypto.getRandomValues = (global as any).crypto.getRandomValues;
  }
}

if (typeof (global as any).self.crypto === 'undefined') {
  (global as any).self.crypto = (global as any).crypto;
} else {
  // If self.crypto exists, ensure it has subtle
  if (!(global as any).self.crypto.subtle) {
    (global as any).self.crypto.subtle = (global as any).crypto.subtle;
  }
  // Also ensure it has getRandomValues
  if (!(global as any).self.crypto.getRandomValues) {
    (global as any).self.crypto.getRandomValues = (global as any).crypto.getRandomValues;
  }
}

// Polyfill isSecureContext for Web Crypto API requirements
if (typeof (global as any).window.isSecureContext === 'undefined') {
  (global as any).window.isSecureContext = true;
}
if (typeof (global as any).self.isSecureContext === 'undefined') {
  (global as any).self.isSecureContext = true;
}

// Polyfill window.addEventListener for wagmi/appkit compatibility
if (typeof (global as any).window.addEventListener === 'undefined') {
  const eventListeners = new Map();

  (global as any).window.addEventListener = function (type: string, listener: any) {
    if (!eventListeners.has(type)) {
      eventListeners.set(type, new Set());
    }
    eventListeners.get(type).add(listener);
  };

  (global as any).window.removeEventListener = function (type: string, listener: any) {
    if (eventListeners.has(type)) {
      eventListeners.get(type).delete(listener);
    }
  };

  (global as any).window.dispatchEvent = function (event: any) {
    const type = event.type || event;
    if (eventListeners.has(type)) {
      eventListeners.get(type).forEach((listener: any) => {
        try {
          listener(event);
        } catch (e) {
          console.error('Error in event listener:', e);
        }
      });
    }
    return true;
  };
}

// Polyfill structuredClone if missing
import structuredClone from "@ungap/structured-clone";
if (!("structuredClone" in globalThis)) {
  (globalThis as any).structuredClone = structuredClone as any;
}

// Polyfill CustomEvent for AppKit/WalletConnect compatibility
if (typeof (global as any).CustomEvent === 'undefined') {
  class CustomEvent {
    type: string;
    detail: any;
    bubbles: boolean;
    cancelable: boolean;

    constructor(type: string, eventInitDict?: any) {
      this.type = type;
      this.detail = eventInitDict?.detail ?? null;
      this.bubbles = eventInitDict?.bubbles ?? false;
      this.cancelable = eventInitDict?.cancelable ?? false;
    }
  }

  (global as any).CustomEvent = CustomEvent;
  (global as any).window.CustomEvent = CustomEvent;
  (global as any).self.CustomEvent = CustomEvent;
}

// Debug logging
console.log('🔧 Crypto polyfills initialized');

// ====================================
// APP INITIALIZATION
// ====================================
import { registerRootComponent } from "expo";

// Use require to ensure App is loaded AFTER polyfills are applied
// This prevents hoisting issues where App's imports (like Web3Auth) 
// might capture the environment before we've patched it.
const App = require("./App").default;

registerRootComponent(App);



