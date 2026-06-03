import { execFile } from 'node:child_process';
import { platform } from 'node:os';

const SERVICE_NAME = 'lark-docx2md';

function isMacOS (): boolean {
  return platform() === 'darwin';
}

function execSecurity (args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/security', args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        // security returns exit code 44 when item not found
        if ((err as any).code === 44 || stderr?.includes('could not be found')) {
          resolve('');
          return;
        }
        reject(new Error(`security command failed: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function assertMacOS (): void {
  if (!isMacOS()) {
    throw new Error('Keychain storage is only supported on macOS.');
  }
}

export async function keychainGet (account: string): Promise<string> {
  assertMacOS();
  return execSecurity(['find-generic-password', '-s', SERVICE_NAME, '-a', account, '-w']);
}

export async function keychainSet (account: string, password: string): Promise<void> {
  assertMacOS();
  // Delete first to avoid "already exists" error, ignore if not found
  try {
    await execSecurity(['delete-generic-password', '-s', SERVICE_NAME, '-a', account]);
  } catch { /* ignore */ }
  await execSecurity(['add-generic-password', '-s', SERVICE_NAME, '-a', account, '-w', password]);
}

export async function keychainDelete (account: string): Promise<void> {
  assertMacOS();
  await execSecurity(['delete-generic-password', '-s', SERVICE_NAME, '-a', account]);
}
