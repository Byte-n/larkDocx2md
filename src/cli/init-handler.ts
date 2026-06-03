import * as p from '@clack/prompts';
import { readAuthConfig, removeCredentials, saveCredentials } from '../lib/auth-store.js';
import { beginRegistration, pollRegistration, probeCredentials } from '../lib/one-click-app.js';
import type { CliErrorHandler } from './handlers.js';

export interface InitRawOptions {
  noProbe?: boolean;
  timeout?: string;
}

export async function handleInitCommand (
  rawOptions: InitRawOptions,
  fail: CliErrorHandler,
): Promise<void> {
  const timeoutMs = rawOptions.timeout ? parseTimeout(rawOptions.timeout) : 30_000;
  if (timeoutMs === null) fail('无效的 --timeout 值，必须为正整数（毫秒）');

  p.intro('lark-docx2md init');

  const existing = readAuthConfig();

  if (existing) {
    // Already configured: show replace / remove options
    p.note(`当前 App ID: ${existing.appId}`);
    const action = await p.select({
      message: '已存在凭证配置，请选择操作：',
      options: [
        { value: 'replace', label: '替换', hint: '注册新应用并替换现有凭证' },
        { value: 'remove', label: '移除', hint: '删除已存储的凭证' },
      ],
    });

    if (p.isCancel(action)) {
      p.cancel('操作已取消。');
      process.exit(0);
    }

    if (action === 'remove') {
      await removeCredentials();
      p.outro('凭证已移除。');
      return;
    }

    // action === 'replace': fall through to registration flow
  } else {
    // Not configured: show add option
    const action = await p.select({
      message: '尚未配置凭证，请选择操作：',
      options: [
        { value: 'add', label: '新增', hint: '注册新的飞书应用并保存凭证' },
      ],
    });

    if (p.isCancel(action)) {
      p.cancel('操作已取消。');
      process.exit(0);
    }
  }

  // Registration flow
  const s = p.spinner();
  s.start('正在启动一键应用配置（飞书）...');

  let beginResult;
  try {
    beginResult = await beginRegistration(timeoutMs);
  } catch (err: any) {
    s.stop('失败');
    fail(`启动注册失败: ${err.message}`);
  }
  s.stop('注册已发起。');

  // Show verification URL
  p.note(
    `请在浏览器中打开以下链接完成应用配置：\n\n  ${beginResult.verificationUriComplete}`,
    '验证',
  );

  // Poll for completion
  const pollSpinner = p.spinner();
  pollSpinner.start('等待应用配置完成...');

  let result;
  try {
    result = await pollRegistration(
      beginResult.deviceCode,
      beginResult.interval,
      beginResult.expiresIn,
      timeoutMs,
    );
  } catch (err: any) {
    pollSpinner.stop('失败');
    fail(`注册失败: ${err.message}`);
  }
  pollSpinner.stop('应用配置完成！');

  // Probe credentials (optional)
  if (!rawOptions.noProbe) {
    const probeSpinner = p.spinner();
    probeSpinner.start('正在验证凭证...');
    try {
      await probeCredentials(result.appId, result.appSecret, timeoutMs);
      probeSpinner.stop('凭证验证通过。');
    } catch (err: any) {
      probeSpinner.stop('失败');
      fail(`凭证验证失败: ${err.message}`);
    }
  }

  // Save credentials
  try {
    await saveCredentials(result.appId, result.appSecret);
  } catch (err: any) {
    fail(`保存凭证失败: ${err.message}`);
  }

  p.outro(`应用配置完成: ${result.appId}。现在可以直接使用 download/get-titles 命令，无需 --app-id/--app-secret。`);
}

function parseTimeout (raw: string): number | null {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0 || `${n}` !== raw.trim()) return null;
  return n;
}
