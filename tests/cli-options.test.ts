import { describe, expect, it } from 'vitest';
import {
  resolveAgentMode,
  resolveCommandUrl,
  resolveDownloadOptions,
  resolveGetTitlesOptions,
} from '../src/cli/options.js';

describe('cli options', () => {
  it('resolves command URL and keeps positional deprecation warning', () => {
    expect(resolveCommandUrl(undefined, 'https://example.com/doc')).toEqual({
      url: 'https://example.com/doc',
    });

    const resolved = resolveCommandUrl('https://example.com/old', undefined);
    expect(resolved.url).toBe('https://example.com/old');
    expect(resolved.warning).toContain('positional argument is deprecated');
  });

  it('resolves agent mode from cli value before env', () => {
    expect(resolveAgentMode(true, undefined).value).toBe('stdout');
    expect(resolveAgentMode('local', 'stdout').value).toBe('local');
    expect(resolveAgentMode(undefined, 'stdout').value).toBe('stdout');
    expect(resolveAgentMode('bad', undefined).error).toContain('Invalid --agent value');
  });

  it('applies download defaults and agent stdout overrides', () => {
    const resolved = resolveDownloadOptions(
      { agent: 'stdout', wbFormat: 'yaml' },
      {
        LARK_DOCX2MD_APP_ID: 'app-id',
        LARK_DOCX2MD_APP_SECRET: 'app-secret',
        LARK_DOCX2MD_OUTPUT: './out',
      },
    );

    expect(resolved.error).toBeUndefined();
    expect(resolved.value).toMatchObject({
      appId: 'app-id',
      appSecret: 'app-secret',
      output: './out',
      agent: 'stdout',
      imageMode: 'online',
      wbImageMode: 'online',
      wbFormat: 'yaml',
    });
  });

  it('rejects mutually exclusive heading filters', () => {
    const resolved = resolveDownloadOptions({
      filterTitle: 'Intro',
      filterTitleBlockId: 'block-id',
    }, {});

    expect(resolved.error).toContain('mutually exclusive');
  });

  it('forces yaml whiteboard images online outside agent mode', () => {
    const resolved = resolveDownloadOptions({
      wbFormat: 'yaml',
      wbImageMode: 'local',
    }, {});

    expect(resolved.value?.wbImageMode).toBe('online');
  });

  it('resolves get-titles format and max level', () => {
    const resolved = resolveGetTitlesOptions({
      format: 'yaml',
      maxLevel: '3',
    }, {
      LARK_DOCX2MD_AGENT: 'local',
    });

    expect(resolved.value).toMatchObject({
      agent: 'local',
      format: 'yaml',
      maxLevel: 3,
    });
  });
});
