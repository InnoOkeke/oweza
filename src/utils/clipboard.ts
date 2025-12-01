// Runtime-safe clipboard helper. Tries expo-clipboard first, falls back to React Native clipboard.
export async function setClipboardString(text: string) {
  // Try expo-clipboard
  try {
    // Use require to avoid static import errors if package isn't installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expoClipboard = require('expo-clipboard');
    if (expoClipboard && typeof expoClipboard.setStringAsync === 'function') {
      return expoClipboard.setStringAsync(text);
    }
  } catch (e) {
    // ignore
  }

  // Try RN Clipboard (may be deprecated in some RN versions)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    const RNClipboard = rn.Clipboard || rn.ClipboardModule;
    if (RNClipboard && typeof RNClipboard.setString === 'function') {
      return RNClipboard.setString(text);
    }
    // try community clipboard
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const community = require('@react-native-clipboard/clipboard');
    if (community && typeof community.setString === 'function') {
      return community.setString(text);
    }
  } catch (e) {
    // ignore
  }

  throw new Error('Clipboard module not available');
}
