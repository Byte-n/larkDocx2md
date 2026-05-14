// ─── Sheet Utilities ─────────────────────────────────────────────────────────

export interface Merge {
  start_row_index?: number;
  end_row_index?: number;
  start_column_index?: number;
  end_column_index?: number;
}

export interface ResolvedSheet {
  title: string;
  hidden?: boolean;
  kind: 'grid' | 'bitable' | 'unknown';
  /** 合并已展开后的二维字符串数组 */
  rows: string[][];
  /** 出错时的占位文本 */
  error?: string;
}

// ─── cellToMd: 富文本 → 纯 Markdown 字符串 ─────────────────────────────────

const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>');

export { escapeCell };

export function cellToMd (cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell !== 'object') return escapeCell(String(cell));
  if (Array.isArray(cell)) return cell.map(cellToMd).join('');
  const o = cell as Record<string, any>;
  switch (o.type) {
    case 'text':
      return escapeCell(String(o.text ?? ''));
    case 'url':
      return `[${escapeCell(o.text ?? o.link ?? '')}](${o.link ?? ''})`;
    case 'mentionUser':
      return `@${escapeCell(o.name ?? o.textArr?.join('') ?? '')}`;
    case 'formula':
      return `\`${escapeCell(o.text ?? '')}\``;
    default:
      // v2 接口可能直接返回 { text, link } 结构
      if (o.text != null) return escapeCell(String(o.text));
      return '';
  }
}

// ─── expandMerges: 合并区填入左上角原值 ──────────────────────────────────────

export function expandMerges (rows: string[][], merges: Merge[]): string[][] {
  const grid = rows.map(r => r.slice());
  for (const m of merges) {
    const r0 = m.start_row_index ?? 0;
    const r1 = m.end_row_index ?? r0;
    const c0 = m.start_column_index ?? 0;
    const c1 = m.end_column_index ?? c0;
    const v = grid[r0]?.[c0] ?? '';
    for (let r = r0; r <= r1; r++) {
      if (!grid[r]) grid[r] = [];
      for (let c = c0; c <= c1; c++) {
        if (r === r0 && c === c0) continue;
        grid[r]![c] = v;
      }
    }
  }
  return grid;
}

// ─── trimTrailingEmpty: 裁剪末尾的空行和空列 ──────────────────────────────
//
// 若末尾若干行的所有单元格都为空（null/undefined/空字符串），则移除这些行；
// 列同理（从右向左判断）。中间的空行/空列保留不动。

const isEmptyCell = (v: unknown): boolean => v == null || v === '';

export function trimTrailingEmpty (rows: string[][]): string[][] {
  // 末尾空行：找到最后一个含非空单元格的行
  let lastRow = -1;
  for (let r = 0; r < rows.length; r++) {
    if ((rows[r] ?? []).some(c => !isEmptyCell(c))) lastRow = r;
  }
  if (lastRow < 0) return [];
  const trimmedRows = rows.slice(0, lastRow + 1);

  // 末尾空列：遍历每一行的最右侧非空列，取最大值
  let lastCol = -1;
  for (const row of trimmedRows) {
    for (let c = (row?.length ?? 0) - 1; c >= 0; c--) {
      if (!isEmptyCell(row[c])) {
        if (c > lastCol) lastCol = c;
        break;
      }
    }
  }
  if (lastCol < 0) return trimmedRows.map(() => []);
  return trimmedRows.map(r => (r ?? []).slice(0, lastCol + 1));
}

// ─── columnIndexToLetter: 列号 → 字母（1-based: 1→A, 26→Z, 27→AA） ────────

export function columnIndexToLetter (n: number): string {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// ─── renderMarkdownTable: 二维字符串 → Markdown 管道表格 ──────────────────
//
// 首行作为表头，其余为表体；空表输出占位文案。调用方负责对单元格内容做
// `escapeCell` 转义与合并展开。

export function renderMarkdownTable (rows: string[][]): string {
  if (!rows.length) return '_（空表）_\n\n';
  const [head, ...body] = rows;
  if (!head || head.length === 0) return '_（空表）_\n\n';
  let out = `| ${head.join(' | ')} |\n`;
  out += `| ${head.map(() => '---').join(' | ')} |\n`;
  for (const r of body) out += `| ${r.join(' | ')} |\n`;
  out += '\n';
  return out;
}
