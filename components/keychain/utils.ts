/**
 * Keychain utility functions and WebAuthn/FIDO2 helpers
 */

import { BadgeCheck,Fingerprint,Key,Shield } from 'lucide-react';
import React from 'react';
import { logger } from '../../lib/logger';
import { KeyType,SSHKey } from '../../types';

/**
 * Generate mock key pair (for fallback when Electron backend is unavailable)
 */
export const generateMockKeyPair = (type: KeyType, label: string, keySize?: number): { privateKey: string; publicKey: string } => {
    const typeMap: Record<KeyType, string> = {
        'ED25519': 'ed25519',
        'ECDSA': `ecdsa-sha2-nistp${keySize || 256}`,
        'RSA': 'rsa',
    };

    const randomId = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

    // Generate size-appropriate random data for more realistic keys
    const keyLength = type === 'RSA' ? (keySize || 4096) / 8 : 32;
    const randomData = Array.from(crypto.getRandomValues(new Uint8Array(keyLength)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACB${randomId}AAAEC${randomData.substring(0, 64)}
-----END OPENSSH PRIVATE KEY-----`;

    const publicKey = `ssh-${typeMap[type]} AAAAC3NzaC1lZDI1NTE5AAAAI${randomId.substring(0, 20)} ${label}@netcatty`;

    return { privateKey, publicKey };
};

/**
 * Create FIDO2 credential for hardware security key (YubiKey, etc.)
 */
export const createFido2Credential = async (label: string): Promise<{
    credentialId: string;
    publicKey: string;
    rpId: string;
} | null> => {
    try {
        // Check if WebAuthn is supported
        if (!window.PublicKeyCredential) {
            throw new Error('WebAuthn is not supported in this environment');
        }

        // Check if we're in a secure context
        if (!window.isSecureContext) {
            throw new Error('WebAuthn requires a secure context (HTTPS). Please run the app via localhost or HTTPS.');
        }

        // For FIDO2 hardware keys, we use cross-platform authenticator
        let rpId: string;
        const hostname = window.location.hostname;

        if (!hostname || hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1') {
            rpId = 'localhost';
        } else {
            rpId = hostname;
        }

        const userId = new TextEncoder().encode(crypto.randomUUID());

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: {
                    name: 'Netcatty SSH Manager',
                    id: rpId,
                },
                user: {
                    id: userId,
                    name: label,
                    displayName: label,
                },
                pubKeyCredParams: [
                    { alg: -7, type: 'public-key' },   // ES256 (ECDSA P-256)
                    { alg: -257, type: 'public-key' }, // RS256 (RSA)
                ],
                authenticatorSelection: {
                    // cross-platform for hardware security keys like YubiKey
                    authenticatorAttachment: 'cross-platform',
                    residentKey: 'discouraged',
                    userVerification: 'preferred',
                },
                timeout: 180000, // 3 minutes
                attestation: 'none',
            },
        }) as PublicKeyCredential;

        if (!credential) {
            return null;
        }

        const response = credential.response as AuthenticatorAttestationResponse;
        const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        const publicKeyBytes = new Uint8Array(response.getPublicKey?.() || []);
        const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));

        // Format as OpenSSH sk-ecdsa key
        const publicKey = `sk-ecdsa-sha2-nistp256@openssh.com AAAAInNrLWVjZHNhLXNoYTItbmlzdHAyNTZAb3BlbnNzaC5jb20${publicKeyBase64.substring(0, 100)} ${label}@fido2`;

        return {
            credentialId,
            publicKey,
            rpId,
        };
    } catch (error) {
        logger.error('FIDO2 credential creation failed:', error);
        throw error;
    }
};

/**
 * Create biometric credential (Windows Hello / Touch ID)
 */
export const createBiometricCredential = async (label: string): Promise<{
    credentialId: string;
    publicKey: string;
    rpId: string;
} | null> => {
    try {
        // Check if WebAuthn is supported
        if (!window.PublicKeyCredential) {
            throw new Error('WebAuthn is not supported in this environment');
        }

        // Check if we're in a secure context (HTTPS or localhost)
        if (!window.isSecureContext) {
            throw new Error('WebAuthn requires a secure context (HTTPS). This feature is not available in the current environment.');
        }

        // Check if platform authenticator is available (Windows Hello, Touch ID, etc.)
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) {
            const isMacOS = navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.toLowerCase().includes('mac');
            throw new Error(`No platform authenticator available. Please ensure ${isMacOS ? 'Touch ID' : 'Windows Hello'} is set up in your system settings.`);
        }

        // For Electron apps, we need to handle the rpId carefully
        let rpId: string;
        const hostname = window.location.hostname;

        // In Electron file:// protocol or localhost dev server
        if (!hostname || hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1') {
            rpId = 'localhost';
        } else {
            rpId = hostname;
        }

        const userId = new TextEncoder().encode(crypto.randomUUID());

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: {
                    name: 'Netcatty SSH Manager',
                    id: rpId,
                },
                user: {
                    id: userId,
                    name: label,
                    displayName: label,
                },
                pubKeyCredParams: [
                    { alg: -7, type: 'public-key' },  // ES256 (ECDSA P-256)
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    residentKey: 'discouraged',
                    userVerification: 'preferred',
                },
                timeout: 180000, // 3 minutes
                attestation: 'none',
            },
        }) as PublicKeyCredential;

        if (!credential) {
            return null;
        }

        const response = credential.response as AuthenticatorAttestationResponse;

        // Convert credential ID to base64
        const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

        // Extract public key from attestation
        const publicKeyBytes = new Uint8Array(response.getPublicKey?.() || []);
        const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));

        // Format as OpenSSH sk-ecdsa key
        const publicKey = `sk-ecdsa-sha2-nistp256@openssh.com AAAAInNrLWVjZHNhLXNoYTItbmlzdHAyNTZAb3BlbnNzaC5jb20${publicKeyBase64.substring(0, 100)} ${label}@netcatty`;

        return {
            credentialId,
            publicKey,
            rpId,
        };
    } catch (error) {
        logger.error('WebAuthn credential creation failed:', error);
        throw error;
    }
};

/**
 * Get icon element for key source
 */
export const getKeyIcon = (key: SSHKey): React.ReactElement => {
    if (key.source === 'biometric') return React.createElement(Fingerprint, { size: 16 });
    if (key.source === 'fido2') return React.createElement(Shield, { size: 16 });
    if (key.certificate) return React.createElement(BadgeCheck, { size: 16 });
    return React.createElement(Key, { size: 16 });
};

/**
 * Get display text for key type
 */
export const getKeyTypeDisplay = (key: SSHKey, isMac: boolean): string => {
    if (key.source === 'biometric') return isMac ? 'Touch ID' : 'Windows Hello';
    if (key.source === 'fido2') return 'FIDO2';
    return key.type;
};

/**
 * Detect key type from private key content
 */
export const detectKeyType = (privateKey: string): KeyType => {
    const pk = privateKey.toLowerCase();
    if (pk.includes('rsa')) return 'RSA';
    if (pk.includes('ecdsa') || pk.includes('ec ')) return 'ECDSA';
    return 'ED25519';
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        logger.error('Failed to copy to clipboard:', err);
        return false;
    }
};

/**
 * Check if running on macOS
 */
export const isMacOS = (): boolean => {
    return navigator.platform.toLowerCase().includes('mac') ||
        navigator.userAgent.toLowerCase().includes('mac');
};

// Panel modes type
export type PanelMode =
    | { type: 'closed' }
    | { type: 'view'; key: SSHKey }
    | { type: 'edit'; key: SSHKey }
    | { type: 'generate'; keyType: 'standard' | 'biometric' | 'fido2' }
    | { type: 'import' }
    | { type: 'identity'; identity?: import('../../types').Identity }
    | { type: 'export'; key: SSHKey };

// Filter tab types
export type FilterTab = 'key' | 'certificate' | 'biometric' | 'fido2';
