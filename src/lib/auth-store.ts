import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { keychainGet, keychainSet, keychainDelete, assertMacOS } from './keychain.js';

const AUTH_DIR = path.join(homedir(), '.lark-docx2md');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');

export interface AuthConfig {
  appId: string;
  key: string; // md5 of appSecret, used as keychain account
}

const KEYCHAIN_ACCOUNT_PREFIX = 'app-secret-';

function computeSecretKey (appSecret: string): string {
  return KEYCHAIN_ACCOUNT_PREFIX + createHash('md5').update(appSecret + Date.now()).digest('hex');
}

/** Read auth.json. Returns null if file does not exist or is invalid. */
export function readAuthConfig (): AuthConfig | null {
  try {
    const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data.appId === 'string' && typeof data.key === 'string') {
      return { appId: data.appId, key: data.key };
    }
    return null;
  } catch {
    return null;
  }
}

/** Write auth.json, creating directory if needed. */
export function writeAuthConfig (config: AuthConfig): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** Remove auth.json file. */
export function removeAuthConfig (): void {
  try {
    fs.unlinkSync(AUTH_FILE);
  } catch {
    // ignore if not exists
  }
}

/**
 * Save credentials: appId goes to auth.json, appSecret goes to keychain.
 * The keychain account name is md5(appSecret).
 */
export async function saveCredentials (appId: string, appSecret: string): Promise<void> {
  assertMacOS();
  const key = computeSecretKey(appSecret);
  await keychainSet(key, appSecret);
  writeAuthConfig({ appId, key });
}

/**
 * Read credentials: appId from auth.json, appSecret from keychain using stored key.
 * Returns undefined values if not configured.
 */
export async function getStoredCredentials (): Promise<{ appId?: string; appSecret?: string }> {
  const config = readAuthConfig();
  if (!config) return {};

  try {
    const appSecret = await keychainGet(config.key);
    return {
      appId: config.appId,
      appSecret: appSecret || undefined,
    };
  } catch {
    return { appId: config.appId };
  }
}

/**
 * Remove stored credentials: delete keychain entry and auth.json.
 */
export async function removeCredentials (): Promise<void> {
  const config = readAuthConfig();
  if (config) {
    try {
      await keychainDelete(config.key);
    } catch {
      // ignore if not found
    }
  }
  removeAuthConfig();
}
