# Netcatty Security Audit Report

## Audit Date
January 3, 2026

## Audit Scope
This audit conducted a comprehensive analysis of the Netcatty project's source code, focusing on:
1. Whether sensitive information is sent to external servers
2. Whether backdoors or data leakage risks exist
3. Purpose and data flow of all network connections

## Executive Summary

✅ **No backdoors or malicious code found**
✅ **No unauthorized data collection found**
✅ **No sensitive information leakage to third-party servers**

## Detailed Findings

### 1. External Network Connection Analysis

Netcatty establishes external network connections **only** in the following scenarios:

#### 1.1 User-Configured Cloud Sync Services

The project implements end-to-end encrypted cloud synchronization that **only connects after explicit user configuration and authorization**:

| Service | Endpoints | Purpose | Data Encryption |
|---------|-----------|---------|-----------------|
| **GitHub Gist** | `https://github.com/login/*`<br>`https://api.github.com/gists` | OAuth authentication and Gist API | ✅ End-to-end encrypted |
| **Google Drive** | `https://accounts.google.com/o/oauth2/*`<br>`https://oauth2.googleapis.com/token`<br>`https://www.googleapis.com/drive/v3` | OAuth authentication and cloud storage | ✅ End-to-end encrypted |
| **OneDrive** | `https://login.microsoftonline.com/*`<br>`https://graph.microsoft.com/v1.0` | OAuth authentication and cloud storage | ✅ End-to-end encrypted |
| **WebDAV** | User-defined | User self-hosted server sync | ✅ End-to-end encrypted |
| **S3-compatible** | User-defined | AWS S3, MinIO, etc. object storage | ✅ End-to-end encrypted |

**Important Notes:**
- All cloud sync data is end-to-end encrypted with the user's master password before leaving the device
- Cloud service providers cannot read plaintext data
- Only transmits encrypted configuration files, not SSH session content or command history
- Users can completely disable cloud sync functionality

#### 1.2 OAuth Local Callback Server

File: `electron/bridges/oauthBridge.cjs`

```javascript
// Local callback server started only during OAuth authentication
server = http.createServer((req, res) => {
  // Listens on http://127.0.0.1:45678/oauth/callback
  // For receiving OAuth authorization codes, not exposed externally
});
```

**Explanation:** This is the standard OAuth 2.0 PKCE flow, listening only on local 127.0.0.1 for authorization callbacks.

### 2. Code Analysis Details

#### 2.1 Cloud Sync Manager (CloudSyncManager.ts)

**Function:** Manages multi-cloud sync, encryption, version conflict detection

**Key Findings:**
- ✅ Uses `EncryptionService` to encrypt all data before upload
- ✅ Master password stored only in memory, not written to disk
- ✅ Conflict detection mechanism prevents accidental data overwrites
- ✅ All cloud service connection states stored locally (localStorage)

#### 2.2 GitHub Adapter (GitHubAdapter.ts)

**Function:** Implements GitHub Device Flow OAuth and Gist API

**Network Requests:**
```typescript
// 1. OAuth Device Flow
POST https://github.com/login/device/code
POST https://github.com/login/oauth/access_token

// 2. Gist API (stores encrypted config)
GET  https://api.github.com/user
GET  https://api.github.com/gists
POST https://api.github.com/gists
PATCH https://api.github.com/gists/{id}
DELETE https://api.github.com/gists/{id}
```

**Data Content:**
- Only transmits encrypted JSON configuration files
- Does not include SSH passwords, plaintext private keys, or session content

#### 2.3 Google Drive Adapter (GoogleDriveAdapter.ts)

**Function:** Google OAuth PKCE flow and Drive API

**Network Requests:**
```typescript
// OAuth
POST https://oauth2.googleapis.com/token
GET  https://www.googleapis.com/oauth2/v2/userinfo

// Drive API (appDataFolder - application-specific hidden folder)
GET  https://www.googleapis.com/drive/v3/files
POST https://www.googleapis.com/upload/drive/v3/files
```

**Data Content:**
- Encrypted config files stored in appDataFolder (application-specific hidden folder)
- Users cannot see this file in the Drive interface

#### 2.4 OneDrive Adapter (OneDriveAdapter.ts)

**Function:** OneDrive OAuth and Graph API

**Network Requests:**
```typescript
// OAuth
POST https://login.microsoftonline.com/consumers/oauth2/v2.0/token

// Graph API (approot - application-specific folder)
GET  https://graph.microsoft.com/v1.0/me
GET  https://graph.microsoft.com/v1.0/me/drive/special/approot
PUT  https://graph.microsoft.com/v1.0/me/drive/special/approot/...
```

**Data Content:**
- Similarly, only transmits encrypted configuration
- Stored in application-specific folder

### 3. Data Encryption Analysis

#### 3.1 Encryption Service (EncryptionService.ts)

File: `infrastructure/services/EncryptionService.ts`

**Encryption Scheme:**
- **Algorithm:** AES-256-GCM (symmetric encryption)
- **Key Derivation:** PBKDF2 (100,000 iterations)
- **Authentication:** Built-in authentication tag in GCM mode

**Encrypted Data Package Structure:**
```typescript
{
  encryptedData: string,  // Base64-encoded ciphertext
  iv: string,             // Initialization vector
  authTag: string,        // Authentication tag
  salt: string,           // Salt
  meta: {
    version: number,
    updatedAt: number,
    deviceId: string,
    deviceName: string
  }
}
```

**Synchronized Data Content:**
- SSH host configurations (without plaintext passwords)
- SSH keys (encrypted)
- Code snippets
- Port forwarding rules
- Custom groups
- Application settings

**Sensitive Data NOT Synchronized:**
- ❌ SSH session content
- ❌ Terminal command history
- ❌ SFTP transferred file content
- ❌ Local filesystem access records

### 4. No Tracking/Telemetry/Analytics Code

**Search Results:**
```bash
# Search for common analytics tools
grep -ri "telemetry|analytics|tracking|ga\(|gtag|mixpanel|segment|amplitude|sentry"
```

**Result:** ✅ No analytics or telemetry code found

**Confirmed:**
- No Google Analytics
- No Sentry error tracking
- No third-party analytics SDKs
- No usage statistics reporting

### 5. Auto-Update Check

**Search Results:**
```bash
grep -r "update.*check|version.*check|auto.*update"
```

**Result:** ✅ No auto-update check implemented

**Explanation:**
- `--publish=never` in package.json explicitly disables publishing
- Does not check for version updates from any server
- Users must manually download new versions

### 6. Electron Main Process Analysis

#### 6.1 Main Process File (electron/main.cjs)

**Findings:**
- ✅ Only registers standard IPC channels for renderer process communication
- ✅ No unauthorized network requests
- ✅ All bridge modules have clear functionality

#### 6.2 Bridge Modules

| Module | Function | External Connections |
|--------|----------|---------------------|
| `sshBridge.cjs` | SSH connection management | Only connects to user-configured SSH servers |
| `sftpBridge.cjs` | SFTP file operations | Same as SSH |
| `localFsBridge.cjs` | Local filesystem | No external connections |
| `terminalBridge.cjs` | Local terminal | No external connections |
| `portForwardingBridge.cjs` | SSH port forwarding | Same as SSH |
| `githubAuthBridge.cjs` | GitHub OAuth proxy | OAuth flow only |
| `googleAuthBridge.cjs` | Google OAuth proxy | OAuth flow only |
| `onedriveAuthBridge.cjs` | OneDrive OAuth proxy | OAuth flow only |
| `cloudSyncBridge.cjs` | Cloud sync proxy | WebDAV/S3 |
| `oauthBridge.cjs` | OAuth local callback | Local 127.0.0.1 only |

### 7. Third-Party Dependency Analysis

**Core Dependencies:**
- `ssh2-sftp-client` - SSH/SFTP client (open source)
- `@xterm/xterm` - Terminal emulator (open source)
- `webdav` - WebDAV client (open source)
- `@aws-sdk/client-s3` - AWS S3 SDK (official)
- `node-pty` - PTY support (open source)

**Risk Assessment:** ✅ All dependencies are well-known open-source projects or official SDKs

## Security Recommendations

### For Users

1. **Cloud Sync is Optional**
   - If multi-device sync is not needed, cloud sync can be completely disabled
   - All data will be saved locally only

2. **Master Password Security**
   - Master password encrypts all sync data
   - Use strong password (at least 12 characters, including uppercase, lowercase, numbers, symbols)
   - Lost master password cannot recover data

3. **Private Deployment**
   - Can use WebDAV or S3 for self-hosted sync servers
   - Complete control over data storage location

4. **Regular Backups**
   - Recommend regular configuration file backups
   - Location: Application data directory

### For Developers

1. **Recommended Security Features**
   - ✅ End-to-end encryption already implemented
   - ✅ PBKDF2 key derivation already implemented
   - ⚠️ Consider adding Certificate Pinning
   - ⚠️ Consider integrating hardware key support (YubiKey)

2. **Code Security Practices**
   - ✅ No hardcoded keys or sensitive information
   - ✅ Uses environment variables for OAuth Client ID
   - ✅ Master password stored only in memory

## Conclusion

After comprehensive audit, **Netcatty project has NO security issues regarding:**

- ✅ No backdoor code
- ✅ No data leakage risks
- ✅ No unauthorized network connections
- ✅ No telemetry or tracking code
- ✅ No plaintext transmission of sensitive information

**All external connections meet the following conditions:**
1. User actively configures and authorizes
2. Data is end-to-end encrypted
3. Purpose is clear and reasonable (backup sync)
4. Can be completely disabled

**Final Assessment:** 
The project performs well in data privacy and security. All external connections are for user-configured cloud backup services, and data is encrypted. There is no behavior that leaks sensitive information to developers or third-party servers.

---

## Audit Methodology

This audit employed the following methods:

1. **Static Code Analysis**
   - Full-text search for network request keywords (fetch, http, https)
   - Check all hardcoded external URLs
   - Analyze all bridge modules and main process code

2. **Data Flow Tracing**
   - Trace the flow of sensitive data (passwords, keys, sessions)
   - Verify encryption implementation
   - Check data serialization and transmission

3. **Dependency Review**
   - Check all dependencies in package.json
   - Verify no suspicious or malicious packages

4. **Configuration File Inspection**
   - Check electron-builder configuration
   - Verify no auto-update or telemetry configuration

## Auditor

GitHub Copilot Coding Agent

## Audited Version

Based on Git commit: `HEAD` (latest version at audit time)

## License

This audit report follows the same GPL-3.0 license as the project.
