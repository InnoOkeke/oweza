// ====================================
// CRYPTO POLYFILLS - MUST BE FIRST
// ====================================
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import QuickCrypto, { install } from 'react-native-quick-crypto';
import { Crypto } from '@peculiar/webcrypto';

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

// Fallback: If QuickCrypto didn't provide subtle (or it's missing), use @peculiar/webcrypto
if (!(global as any).crypto.subtle) {
  const webCrypto = new Crypto();
  (global as any).crypto.subtle = webCrypto.subtle;
  // Also ensure getRandomValues is available if QuickCrypto didn't provide it
  if (!(global as any).crypto.getRandomValues) {
    (global as any).crypto.getRandomValues = webCrypto.getRandomValues.bind(webCrypto);
  }
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

// Set up browserCrypto for libraries that expect it (like Web3Auth)
// We explicitly use QuickCrypto.webcrypto here to ensure subtle is present
(global as any).browserCrypto = QuickCrypto.webcrypto;

// If QuickCrypto.webcrypto didn't have subtle, copy it from our global.crypto (which might be from peculiar)
if (!(global as any).browserCrypto.subtle && (global as any).crypto.subtle) {
  (global as any).browserCrypto.subtle = (global as any).crypto.subtle;
}

// Ensure browserCrypto has randomBytes too
if (!(global as any).browserCrypto.randomBytes) {
  (global as any).browserCrypto.randomBytes = (global as any).crypto.randomBytes;
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

// Polyfill structuredClone if missing
import structuredClone from "@ungap/structured-clone";
if (!("structuredClone" in globalThis)) {
  (globalThis as any).structuredClone = structuredClone as any;
}

// Debug logging
console.log('🔧 Crypto polyfills initialized');
console.log('   global.crypto:', !!(global as any).crypto);
console.log('   global.crypto.randomBytes:', typeof (global as any).crypto?.randomBytes);
console.log('   global.crypto.getRandomValues:', typeof (global as any).crypto?.getRandomValues);
console.log('   global.crypto.subtle:', !!(global as any).crypto?.subtle);
console.log('   global.crypto.subtle.digest:', typeof (global as any).crypto?.subtle?.digest);
console.log('   browserCrypto:', !!(global as any).browserCrypto);
console.log('   browserCrypto.randomBytes:', typeof (global as any).browserCrypto?.randomBytes);
console.log('   browserCrypto.subtle:', !!(global as any).browserCrypto?.subtle);
console.log('   browserCrypto.subtle.digest:', typeof (global as any).browserCrypto?.subtle?.digest);
console.log('   window.crypto:', !!(global as any).window?.crypto);
console.log('   window.crypto.subtle:', !!(global as any).window?.crypto?.subtle);
console.log('   window.crypto.subtle.digest:', typeof (global as any).window?.crypto?.subtle?.digest);
console.log('   self.crypto:', !!(global as any).self?.crypto);
console.log('   self.crypto.subtle:', !!(global as any).self?.crypto?.subtle);
console.log('   self.crypto.subtle.digest:', typeof (global as any).self?.crypto?.subtle?.digest);
try {
  const requiredCrypto = require('crypto');
  console.log('   require("crypto").subtle:', !!requiredCrypto.subtle);
  console.log('   require("crypto").subtle.digest:', typeof requiredCrypto.subtle?.digest);

  // Ensure randomUUID is available
  if (!(global as any).crypto.randomUUID) {
    (global as any).crypto.randomUUID = requiredCrypto.randomUUID;
  }
} catch (e) {
  console.log('   require("crypto") check failed:', e);
}

// ====================================
// APP INITIALIZATION
// ====================================
import { registerRootComponent } from "expo";

// Use require to ensure App is loaded AFTER polyfills are applied
// This prevents hoisting issues where App's imports (like Web3Auth) 
// might capture the environment before we've patched it.
const App = require("./App").default;

registerRootComponent(App);



