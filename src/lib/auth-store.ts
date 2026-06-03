import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { keychainGet, keychainSet, keychainDelete, isMacOS } from './keychain.js';

/** Warning message when auth.json contains a Keychain reference but platform is non-macOS. */
const CROSS_PLATFORM_WARN =
  'auth.json 中包含 Keychain 凭证引用，但当前系统不支持 macOS Keychain。请运行 "lark-docx2md init" 重新配置。';

const AUTH_DIR = path.join(homedir(), '.lark-docx2md');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');

export interface AuthConfig {
  appId: string;
  /** macOS only: keychain account name for retrieving appSecret */
  key?: string;
  /** non-macOS only: appSecret stored in plaintext as file fallback */
  appSecret?: string;
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
    if (data && typeof data.appId === 'string') {
      return {
        appId: data.appId,
        key: typeof data.key === 'string' ? data.key : undefined,
        appSecret: typeof data.appSecret === 'string' ? data.appSecret : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Write auth.json, creating directory if needed. */
export function writeAuthConfig (config: AuthConfig): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  // Only write fields that are defined (omit undefined)
  const toWrite: Record<string, string> = { appId: config.appId };
  if (config.key !== undefined) toWrite.key = config.key;
  if (config.appSecret !== undefined) toWrite.appSecret = config.appSecret;
  fs.writeFileSync(AUTH_FILE, JSON.stringify(toWrite, null, 2) + '\n', 'utf-8');
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
 * Save credentials.
 * - macOS: appId → auth.json, appSecret → Keychain
 * - non-macOS: appId + appSecret → auth.json (file fallback)
 */
export async function saveCredentials (appId: string, appSecret: string): Promise<void> {
  if (isMacOS()) {
    const key = computeSecretKey(appSecret);
    await keychainSet(key, appSecret);
    writeAuthConfig({ appId, key });
  } else {
    writeAuthConfig({ appId, appSecret });
  }
}

/**
 * Read credentials.
 * - macOS: prefer Keychain (key field), fall back to plaintext (appSecret field).
 * - non-macOS: prefer plaintext (appSecret field); warn if only key field exists.
 * Returns undefined values if not configured.
 */
export async function getStoredCredentials (): Promise<{ appId?: string; appSecret?: string }> {
  const config = readAuthConfig();
  if (!config) return {};

  if (isMacOS()) {
    // macOS: Keychain first, then plaintext fallback
    if (config.key !== undefined) {
      try {
        const appSecret = await keychainGet(config.key);
        if (appSecret) return { appId: config.appId, appSecret };
      } catch { /* fall through */ }
    }
    if (config.appSecret !== undefined) {
      return { appId: config.appId, appSecret: config.appSecret };
    }
    return { appId: config.appId };
  }

  // non-macOS: plaintext first
  if (config.appSecret !== undefined) {
    return { appId: config.appId, appSecret: config.appSecret };
  }
  if (config.key !== undefined) {
    console.warn(CROSS_PLATFORM_WARN);
  }
  return { appId: config.appId };
}

/**
 * Remove stored credentials.
 * - macOS: delete Keychain entry + auth.json
 * - non-macOS: delete auth.json
 */
export async function removeCredentials (): Promise<void> {
  const config = readAuthConfig();
  if (config?.key) {
    try {
      await keychainDelete(config.key);
    } catch {
      // ignore if not found
    }
  }
  removeAuthConfig();
}
