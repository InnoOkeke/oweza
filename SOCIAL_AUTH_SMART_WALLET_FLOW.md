# Social Authentication + Smart Wallet Flow

## Overview

This document explains how social authentication (Google/Apple/Email) integrates with Reown AppKit smart wallet creation and backend user registration.

## Complete Authentication Flow

### 1. User Initiates Login

**Android:** User clicks "Continue with Google"
**iOS:** User clicks "Continue with Apple"  
**Both:** User can click "Continue with Email"

### 2. Social Authentication

#### Google OAuth (Android):
1. App opens Google OAuth flow using `expo-auth-session`
2. User authenticates with Google
3. App receives OAuth token
4. App fetches user profile from Google API:
   - `userId` (Google sub)
   - `email`
   - `displayName` (name)
   - `photoUrl` (picture)

#### Apple Sign In (iOS):
- Similar flow using Apple's authentication
- Currently shows "coming soon" message

#### Email Passwordless:
1. User enters email
2. App generates temporary userId from email
3. In production, would send magic link/OTP

### 3. Smart Wallet Creation

After successful social auth:

1. **Store social auth data temporarily** in state
2. **Open Reown AppKit modal** (`await open()`)
3. **User creates/connects wallet** through AppKit UI
4. **AppKit returns wallet address**

### 4. Backend Registration

When wallet is connected (`walletConnected && address`):

1. **Call backend API** (`POST /api/users`):
   ```typescript
   {
     userId: "google_123456789",
     email: "user@example.com",
     emailVerified: true,
     walletAddress: "0x1234...5678",
     displayName: "John Doe",
     photoUrl: "https://..."
   }
   ```

2. **Backend creates/updates user**:
   - Checks if user exists by email
   - Creates new user or updates existing
   - Stores wallet address in `wallets.celo` field
   - Returns complete user profile

3. **App stores user profile** in state
4. **Set `isConnected = true`**
5. **User is now authenticated!**

## Code Flow

### AppKitProvider.tsx

```typescript
// 1. Social auth completes
handleGoogleAuth() {
  // Get user info from Google
  setSocialAuthData({ userId, email, displayName, photoUrl });
  
  // Open wallet creation
  await open();
}

// 2. Wallet connects (useEffect)
useEffect(() => {
  if (walletConnected && address && socialAuthData) {
    // Register with backend
    const user = await registerUser({
      userId: socialAuthData.userId,
      email: socialAuthData.email,
      walletAddress: address,
      ...
    });
    
    // Set profile
    setProfile(userProfile);
    setIsConnected(true);
  }
}, [walletConnected, address, socialAuthData]);
```

## Platform-Specific Behavior

### Android
- Shows "Continue with Google" button only
- Uses Google OAuth with Android client ID
- Opens Google authentication in browser/system

### iOS
- Shows "Continue with Apple" button only
- Uses Apple Sign In (when implemented)
- Native Apple authentication experience

### Both Platforms
- "Continue with Email" available on both
- Same smart wallet creation flow
- Same backend registration

## Backend API

### Endpoint: `POST /api/users`

**Request:**
```json
{
  "userId": "google_123456789",
  "email": "user@example.com",
  "emailVerified": true,
  "walletAddress": "0x1234567890abcdef",
  "displayName": "John Doe",
  "avatar": "https://lh3.googleusercontent.com/..."
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "userId": "google_123456789",
    "email": "user@example.com",
    "emailVerified": true,
    "wallets": {
      "celo": "0x1234567890abcdef"
    },
    "profile": {
      "displayName": "John Doe",
      "avatar": "https://..."
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastLoginAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### User Lookup

**By Email:** `GET /api/users?email=user@example.com`
**By UserId:** `GET /api/users?userId=google_123456789`
**By Wallet:** `GET /api/users?walletAddress=0x1234...`

## Environment Variables Required

```bash
# Google OAuth
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-id.apps.googleusercontent.com

# Reown AppKit
REOWN_PROJECT_ID=your-reown-project-id

# Backend API
OWEZA_API_BASE_URL=https://your-api.com
OWEZA_API_KEY=your-api-key
MONGODB_URI=mongodb://...
```

## User Experience

### First Time User:
1. Click "Continue with Google"
2. Authenticate with Google
3. AppKit modal opens
4. Create new smart wallet (or connect existing)
5. Wallet address generated
6. User registered in backend
7. Redirected to home screen

### Returning User:
1. Click "Continue with Google"
2. Authenticate with Google
3. AppKit modal opens
4. Connect existing wallet
5. Backend updates last login time
6. Redirected to home screen

## Security Considerations

1. **OAuth Tokens:** Stored temporarily, not persisted
2. **Wallet Private Keys:** Managed by Reown AppKit, never exposed
3. **API Authentication:** Backend requires API key in Authorization header
4. **Email Verification:** Google/Apple emails are pre-verified
5. **User Data:** Stored securely in MongoDB

## Testing

### Test Google OAuth:
1. Set up Google OAuth credentials (see GOOGLE_OAUTH_SETUP.md)
2. Add client IDs to `.env`
3. Run on Android device/emulator
4. Click "Continue with Google"
5. Complete authentication
6. Verify wallet creation
7. Check backend for user record

### Test Email Auth:
1. Click "Continue with Email"
2. Enter email address
3. AppKit modal should open
4. Create/connect wallet
5. Verify user registration

## Troubleshooting

### "Failed to open wallet connection"
- Check REOWN_PROJECT_ID is set
- Verify AppKit is properly initialized
- Check network connectivity

### "Failed to complete registration"
- Verify OWEZA_API_BASE_URL is correct
- Check OWEZA_API_KEY is valid
- Ensure MongoDB is accessible
- Check backend logs

### Google OAuth not working
- See GOOGLE_OAUTH_SETUP.md
- Verify client IDs match platform
- Check redirect URI configuration

## Next Steps

1. **Implement Apple Sign In** for iOS
2. **Add magic link** for email passwordless
3. **Implement wallet recovery** via social auth
4. **Add biometric authentication**
5. **Implement session management**
6. **Add multi-wallet support**
