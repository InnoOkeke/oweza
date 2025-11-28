# Deep Link Configuration Files

These files enable universal links (iOS) and app links (Android) for MetaSend.

## iOS - apple-app-site-association

Replace `TEAM_ID` with your Apple Developer Team ID.

To find your Team ID:
1. Go to https://developer.apple.com/account
2. Click on "Membership" in the sidebar
3. Copy your Team ID

## Android - assetlinks.json

Replace `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` with your app's SHA-256 certificate fingerprint.

To get your SHA-256 fingerprint:

```bash
# For debug builds
cd android
./gradlew signingReport

# Look for the SHA-256 fingerprint in the output
```

For production builds, use the fingerprint from your release keystore.

## Testing Deep Links

After deploying to Vercel:

**iOS:**
```
https://metasend.vercel.app/.well-known/apple-app-site-association
```

**Android:**
```
https://metasend.vercel.app/.well-known/assetlinks.json
```

Both files must be served with `Content-Type: application/json`.
