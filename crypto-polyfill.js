// Polyfill for randomBytes in React Native
// crypto.subtle is provided by @peculiar/webcrypto in index.ts

// Polyfill for randomBytes in React Native
// crypto.subtle is provided by @peculiar/webcrypto in index.ts

// Import react-native-get-random-values for getRandomValues
require('react-native-get-random-values');

// Helper function to create randomBytes using getRandomValues
function randomBytes(size) {
    const bytes = new Uint8Array(size);

    // Use global crypto.getRandomValues (polyfilled by react-native-get-random-values)
    if (typeof global.crypto !== 'undefined' && typeof global.crypto.getRandomValues === 'function') {
        global.crypto.getRandomValues(bytes);
    } else {
        throw new Error('crypto.getRandomValues is not available');
    }

    // Convert to Buffer if available, otherwise return Uint8Array
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes);
    }
    return bytes;
}

// Stub functions for Node.js crypto compatibility
function getCiphers() {
    return ['aes-256-cbc', 'aes-192-cbc', 'aes-128-cbc'];
}

function getHashes() {
    return ['sha256', 'sha384', 'sha512', 'sha1', 'md5'];
}

// Export randomBytes and Node.js crypto stubs
module.exports = {
    randomBytes: randomBytes,
    getCiphers: getCiphers,
    getHashes: getHashes,
    get subtle() {
        return (global.crypto && global.crypto.subtle) || (global.browserCrypto && global.browserCrypto.subtle);
    },
    get webcrypto() {
        return global.crypto || global.browserCrypto;
    },
    randomUUID: function () {
        const buf = randomBytes(16);
        buf[6] = (buf[6] & 0x0f) | 0x40; // Version 4
        buf[8] = (buf[8] & 0x3f) | 0x80; // Variant 10
        return [...buf].map((b, i) =>
            (b.toString(16).padStart(2, '0')) +
            ([3, 5, 7, 9].includes(i) ? '-' : '')
        ).join('');
    }
};

module.exports.default = module.exports;
