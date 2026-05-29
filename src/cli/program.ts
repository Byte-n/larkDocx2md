import { Command } from 'commander';
import { handleDownloadCommand, handleGetTitlesCommand } from './handlers.js';
import type { DownloadRawOptions, GetTitlesRawOptions } from './options.js';

export function createProgram (): Command {
  const program = new Command();
  program.name('larkDocx2md').description('Download Lark/Feishu documents to markdown');

  program
    .command('download')
    .alias('dl')
    .description('Download a wiki document to markdown')
    .option('--url <url>', 'Feishu wiki/document URL')
    .option('--app-id <id>', 'Feishu app ID (or read from LARK_DOCX2MD_APP_ID)')
    .option('--app-secret <secret>', 'Feishu app secret (or read from LARK_DOCX2MD_APP_SECRET)')
    .option('-o, --output <dir>', 'Output directory (or LARK_DOCX2MD_OUTPUT)')
    .option('--agent [mode]', 'Enable agent mode: ERROR log level, and AI-oriented stdout. Modes: "stdout" (default, print markdown to stdout) or "local" (save markdown/images/whiteboards to disk and print a read-file prompt). Or LARK_DOCX2MD_AGENT=stdout|local')
    .option('--wb-format <format>', 'Whiteboard output format: "base64", "inline-svg", "svg", or "yaml" (or LARK_DOCX2MD_WB_FORMAT)')
    .option('--wb-bg <style>', 'Whiteboard SVG background: "none", "dot", or a color like "#fff" (or LARK_DOCX2MD_WB_BG)')
    .option('--wb-image-mode <mode>', 'Whiteboard image mode: "online", "base64", or "local" (or LARK_DOCX2MD_WB_IMAGE_MODE)')
    .option('--image-mode <mode>', 'Image handling mode: "local" or "online" (or LARK_DOCX2MD_IMAGE_MODE)')
    .option('--filter-title <title>', 'Only convert the section matching this heading title (single title, first match wins on duplicates)')
    .option('--filter-title-block-id <id>', 'Only convert the section whose heading block id matches (most precise; obtain from get-titles)')
    .option('--max-output-lines <n>', 'Maximum allowed markdown lines when no heading filter is specified; errors if exceeded (or LARK_DOCX2MD_MAX_OUTPUT_LINES)')
    .argument('[url]', 'Deprecated: Feishu wiki document URL. Use --url <url> instead.')
    .action((positionalUrl: string | undefined, opts: DownloadRawOptions) => (
      handleDownloadCommand(positionalUrl, opts, message => program.error(message))
    ));

  program
    .command('get-titles')
    .description('Print all headings (level 1~9) of a wiki/docx document. Useful before --filter-title-block-id.')
    .option('--url <url>', 'Feishu wiki/docx URL')
    .option('--app-id <id>', 'Feishu app ID (or read from LARK_DOCX2MD_APP_ID)')
    .option('--app-secret <secret>', 'Feishu app secret (or read from LARK_DOCX2MD_APP_SECRET)')
    .option('-o, --output <dir>', 'Output directory used by --agent local (or LARK_DOCX2MD_OUTPUT)')
    .option('--max-level <n>', 'Only output headings whose level <= n (1~9)', '9')
    .option('--format <format>', 'Output format: "text" or "yaml"', 'text')
    .option('--agent [mode]', 'Enable agent mode: ERROR log level, AI-oriented stdout. Modes: "stdout" (default, print titles to stdout) or "local" (save titles to disk and print a read-file prompt). Or LARK_DOCX2MD_AGENT=stdout|local')
    .argument('[url]', 'Deprecated: Feishu wiki/docx URL. Use --url <url> instead.')
    .action((positionalUrl: string | undefined, opts: GetTitlesRawOptions) => (
      handleGetTitlesCommand(positionalUrl, opts, message => program.error(message))
    ));

  return program;
}

export function runCli (argv: string[] = process.argv): void {
  createProgram().parse(argv);
}
