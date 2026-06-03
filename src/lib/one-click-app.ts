/**
 * One-click app registration via Feishu Device-Code OAuth flow.
 * Only supports feishu (not lark).
 */
import * as https from 'node:https';

const ACCOUNTS_BASE = 'https://accounts.feishu.cn';
const OPEN_BASE = 'https://open.feishu.cn';
const PATH_APP_REGISTRATION = '/oauth/v1/app/registration';
const PATH_TAT = '/open-apis/auth/v3/tenant_access_token/internal';

const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InitOptions {
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Skip tenant_access_token validation (default: false) */
  noProbe?: boolean;
}

export interface RegistrationBeginResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface RegistrationResult {
  appId: string;
  appSecret: string;
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

function postBody (url: string, body: string, contentType: string, timeoutMs: number): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      headers: {
        'content-type': contentType,
        'content-length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (resp) => {
      const chunks: Buffer[] = [];
      resp.on('data', (chunk: Buffer) => chunks.push(chunk));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data: any = {};
        if (raw.trim()) {
          try { data = JSON.parse(raw); } catch (e: any) {
            reject(new Error(`response was not JSON: ${e.message}`));
            return;
          }
        }
        resolve({ statusCode: resp.statusCode ?? 0, data });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.end(body);
  });
}

function postForm (url: string, form: Record<string, string>, timeoutMs: number) {
  return postBody(url, new URLSearchParams(form).toString(), 'application/x-www-form-urlencoded', timeoutMs);
}

function postJSON (url: string, body: Record<string, string>, timeoutMs: number) {
  return postBody(url, JSON.stringify(body), 'application/json', timeoutMs);
}

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getString (obj: any, key: string): string {
  const value = obj?.[key];
  return typeof value === 'string' ? value : '';
}

function getInt (obj: any, key: string, fallback: number): number {
  const value = obj?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) return Math.trunc(Number(value));
  return fallback;
}

// ─── Core Flow ───────────────────────────────────────────────────────────────

/** Step 1: Begin device-code registration, returns verification URL for user. */
export async function beginRegistration (timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RegistrationBeginResult> {
  const endpoint = ACCOUNTS_BASE + PATH_APP_REGISTRATION;
  const resp = await postForm(endpoint, {
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id tenant_brand',
  }, timeoutMs);

  const errorText = getString(resp.data, 'error_description') || getString(resp.data, 'error');
  if (resp.statusCode >= 400 || errorText) {
    throw new Error(`app registration begin failed: ${errorText || `HTTP ${resp.statusCode}`}`);
  }

  const deviceCode = getString(resp.data, 'device_code');
  const userCode = getString(resp.data, 'user_code');
  if (!deviceCode || !userCode) {
    throw new Error('app registration begin response is missing device_code or user_code');
  }

  return {
    deviceCode,
    userCode,
    verificationUri: getString(resp.data, 'verification_uri'),
    verificationUriComplete: `${OPEN_BASE}/page/cli?user_code=${encodeURIComponent(userCode)}`,
    expiresIn: getInt(resp.data, 'expires_in', 300),
    interval: getInt(resp.data, 'interval', 5),
  };
}

/** Step 2: Poll until user completes the app configuration in browser. */
export async function pollRegistration (
  deviceCode: string,
  interval: number,
  expiresIn: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RegistrationResult> {
  const endpoint = ACCOUNTS_BASE + PATH_APP_REGISTRATION;
  const deadline = Date.now() + expiresIn * 1000;
  let currentInterval = Math.max(1, interval || 2);
  let attempts = 0;

  while (Date.now() < deadline && attempts < 200) {
    attempts++;
    await sleep(currentInterval * 1000);

    let resp;
    try {
      resp = await postForm(endpoint, { action: 'poll', device_code: deviceCode }, timeoutMs);
    } catch (err: any) {
      process.stderr.write(`[WARN] poll request failed: ${err.message}\n`);
      currentInterval = Math.min(currentInterval + 1, 60);
      continue;
    }

    const errStr = getString(resp.data, 'error');
    const clientID = getString(resp.data, 'client_id');

    if (!errStr && clientID) {
      const clientSecret = getString(resp.data, 'client_secret');
      if (!clientSecret) throw new Error('app registration succeeded but missing client_secret');
      return { appId: clientID, appSecret: clientSecret };
    }

    if (errStr === 'authorization_pending') continue;
    if (errStr === 'slow_down') {
      currentInterval = Math.min(currentInterval + 5, 60);
      continue;
    }
    if (errStr === 'access_denied') {
      throw new Error('app registration denied by user');
    }
    if (errStr === 'expired_token' || errStr === 'invalid_grant') {
      throw new Error('device code expired, please try again');
    }

    const desc = getString(resp.data, 'error_description') || errStr || `HTTP ${resp.statusCode}`;
    throw new Error(`app registration poll failed: ${desc}`);
  }

  throw new Error('app registration timed out, please try again');
}

/** Step 3 (optional): Validate credentials by requesting a tenant_access_token. */
export async function probeCredentials (appId: string, appSecret: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const endpoint = OPEN_BASE + PATH_TAT;
  const resp = await postJSON(endpoint, { app_id: appId, app_secret: appSecret }, timeoutMs);

  if (resp.statusCode !== 200) {
    throw new Error(`credential probe failed: HTTP ${resp.statusCode}`);
  }
  const code = getInt(resp.data, 'code', -1);
  if (code !== 0) {
    throw new Error(`credential probe failed: [${code}] ${getString(resp.data, 'msg') || 'unknown error'}`);
  }
  if (!getString(resp.data, 'tenant_access_token')) {
    throw new Error('credential probe: tenant_access_token missing in response');
  }
}
