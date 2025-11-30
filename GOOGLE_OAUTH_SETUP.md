# Google OAuth Setup Guide

This guide explains how to set up Google OAuth for social login in the Oweza app.

## Prerequisites

- Google Cloud Console account
- Access to the project's environment variables

## Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API (or Google Identity Services)

### 2. Create OAuth 2.0 Credentials

#### For Android:

1. In Google Cloud Console, go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Android** as the application type
4. Enter your package name: `com.kellonapp.oweza`
5. Get your SHA-1 certificate fingerprint:
   ```bash
   # For debug builds
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   
   # For release builds
   keytool -list -v -keystore /path/to/your/release.keystore -alias your-key-alias
   ```
6. Enter the SHA-1 fingerprint
7. Click **Create**
8. Copy the **Client ID**

#### For iOS:

1. In Google Cloud Console, go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **iOS** as the application type
4. Enter your bundle ID: `com.kellonapp.oweza`
5. Click **Create**
6. Copy the **Client ID**

### 3. Configure Environment Variables

Add the following to your `.env` file:

```bash
# Google OAuth (for social login)
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
```

### 4. Configure OAuth Redirect URI

The app is configured to use the custom scheme `oweza://auth` for OAuth redirects.

In Google Cloud Console:
1. Go to your OAuth client configuration
2. Add the following to **Authorized redirect URIs**:
   - `oweza://auth`

### 5. Test the Integration

1. Restart your development server:
   ```bash
   npm start -- --clear
   ```

2. On Android, click "Continue with Google"
3. On iOS, click "Continue with Apple" (Google will also work on iOS)

## Troubleshooting

### "Sign in with Google temporarily disabled for this app"

This error occurs when:
- The OAuth consent screen is not configured
- The app is not verified by Google
- The client ID doesn't match

**Solution:**
1. Go to **APIs & Services** > **OAuth consent screen**
2. Configure the consent screen with your app details
3. Add test users if the app is in testing mode

### "redirect_uri_mismatch"

This error occurs when the redirect URI doesn't match.

**Solution:**
1. Ensure `oweza://auth` is added to authorized redirect URIs
2. Check that the scheme in `app.config.js` matches: `scheme: "oweza"`

### Authentication not working on Android

**Solution:**
1. Verify your SHA-1 fingerprint is correct
2. Make sure you're using the correct keystore (debug vs release)
3. Rebuild the app after adding credentials

## Apple Sign In (iOS)

For Apple Sign In on iOS, you'll need to:

1. Enable "Sign in with Apple" capability in Xcode
2. Configure Apple Sign In in your Apple Developer account
3. Implement the Apple authentication flow (currently shows "coming soon")

## Next Steps

- Implement Apple Sign In for iOS
- Implement email passwordless authentication
- Add backend API integration to store user profiles
- Connect social login with wallet creation
