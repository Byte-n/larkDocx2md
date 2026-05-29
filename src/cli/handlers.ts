import * as fs from 'node:fs';
import * as path from 'node:path';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { convert, countMarkdownLines } from '../lib/converter.js';
import {
  GET_TITLES_NON_DOCUMENT_HINT,
  buildTitleTree,
  getTitles,
  serializeTitlesTextDocument,
} from '../lib/get-titles.js';
import { setLogLevel } from '../lib/logger.js';
import { parseWikiUrl } from '../lib/url.js';
import { serializeYaml } from '../whiteboard/yaml/serialize.js';
import {
  missingCredentialsMessage,
  resolveCommandUrl,
  resolveDownloadOptions,
  resolveGetTitlesOptions,
  type DownloadRawOptions,
  type GetTitlesRawOptions,
} from './options.js';

export type CliErrorHandler = (message: string) => never;

export async function handleDownloadCommand (
  positionalUrl: string | undefined,
  rawOptions: DownloadRawOptions,
  fail: CliErrorHandler,
): Promise<void> {
  const url = getCommandUrl(positionalUrl, rawOptions.url, fail);
  const resolved = resolveDownloadOptions(rawOptions);
  if (resolved.error || !resolved.value) fail(resolved.error ?? 'Invalid download options');

  const opts = resolved.value;
  const agentLocal = opts.agent === 'local';
  const agentStdout = opts.agent === 'stdout';
  const agentEnabled = agentLocal || agentStdout;

  if (agentEnabled) setLogLevel(LoggerLevel.error);
  if (!opts.appId || !opts.appSecret) fail(missingCredentialsMessage(agentEnabled));

  const result = await convert({
    appId: opts.appId,
    appSecret: opts.appSecret,
    url,
    output: opts.output,
    imageMode: opts.imageMode,
    wbImageMode: opts.wbImageMode,
    wbBg: opts.wbBg,
    wbFormat: opts.wbFormat,
    agent: opts.agent,
    filterTitle: opts.filterTitle,
    filterTitleBlockId: opts.filterTitleBlockId,
    maxOutputLines: opts.maxOutputLines,
  });

  if (agentLocal) {
    const lineCount = countMarkdownLines(result.markdown);
    process.stdout.write(
      `**The Feishu document has been downloaded to the following absolute path:**\n\n` +
      `\`${result.filePath}\`. file line count: ${lineCount}\n\n` +
      `**Read this file to access the full markdown content.**\n`,
    );
  } else if (agentStdout) {
    process.stdout.write(result.markdown);
  }
}

export async function handleGetTitlesCommand (
  positionalUrl: string | undefined,
  rawOptions: GetTitlesRawOptions,
  fail: CliErrorHandler,
): Promise<void> {
  const url = getCommandUrl(positionalUrl, rawOptions.url, fail);
  const resolved = resolveGetTitlesOptions(rawOptions);
  if (resolved.error || !resolved.value) fail(resolved.error ?? 'Invalid get-titles options');

  const opts = resolved.value;
  const agentEnabled = opts.agent === 'stdout' || opts.agent === 'local';
  const agentLocal = opts.agent === 'local';
  if (agentEnabled) setLogLevel(LoggerLevel.error);

  const parsedUrl = parseWikiUrl(url);
  if (parsedUrl.docType === 'sheets') {
    throw new Error(GET_TITLES_NON_DOCUMENT_HINT);
  }

  if (!opts.appId || !opts.appSecret) fail(missingCredentialsMessage(agentEnabled));

  const result = await getTitles({
    appId: opts.appId,
    appSecret: opts.appSecret,
    url,
    agent: opts.agent,
  });
  const filtered = result.titles.filter(t => t.level <= opts.maxLevel);
  const content = opts.format === 'yaml'
    ? serializeYaml({ url: result.url, docToken: result.docToken, titles: buildTitleTree(filtered) })
    : serializeTitlesTextDocument(filtered);

  if (agentLocal) {
    fs.mkdirSync(opts.output, { recursive: true });
    const ext = opts.format === 'yaml' ? 'yaml' : 'md';
    const filePath = path.resolve(opts.output, `${result.docToken}.titles.${ext}`);
    fs.writeFileSync(filePath, content);
    const lineCount = countMarkdownLines(content);
    process.stdout.write(
      `**The Feishu document titles have been downloaded to the following absolute path:**\n\n` +
      `\`${filePath}\`. file line count: ${lineCount}\n\n` +
      `**Read this file to access the full titles list.**\n`,
    );
  } else {
    process.stdout.write(content);
  }
}

function getCommandUrl (
  positionalUrl: string | undefined,
  optionUrl: string | undefined,
  fail: CliErrorHandler,
): string {
  const resolved = resolveCommandUrl(positionalUrl, optionUrl);
  if (resolved.warning) process.stderr.write(resolved.warning);
  if (resolved.error || !resolved.url) fail(resolved.error ?? 'Missing document URL');
  return resolved.url;
}
