import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../lib/types.js';
import type { MdBlockNode, MdInlineNode, MdTableRow } from '../types.js';

export const tableParser: BlockParser = {
  blockType: 31,
  consumesChildren: true,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    const t = block.table!;
    const cols = t.property.column_size;
    const mergeInfos = t.property.merge_info ?? [];

    const rows: MdTableRow[] = [];

    for (let i = 0; i < (t.cells?.length ?? 0); i++) {
      const cellId = t.cells![i]!;
      const cell = ctx.blockMap.get(cellId);

      // Collect inline content from cell children
      const content: MdBlockNode[] = [];
      if (cell) {
        for (const childId of cell.children ?? []) {
          const child = ctx.blockMap.get(childId);
          if (!child) continue;
          const node = ctx.parseBlock(child);
          if (node) content.push(node);
        }
      }

      // Flatten block content to inline nodes (for table cells)
      const inlineContent = flattenToInline(content);

      const row = Math.floor(i / cols);
      const col = i % cols;
      if (!rows[row]) rows[row] = { cells: [] };
      rows[row]!.cells[col] = { content: inlineContent };
    }

    // Apply merge_info using array index (legacy logic)
    for (let i = 0; i < mergeInfos.length; i++) {
      const m = mergeInfos[i]!;
      const row = Math.floor(i / cols);
      const col = i % cols;
      if (rows[row]?.cells[col]) {
        const rowSpan = m.row_span ?? 1;
        const colSpan = m.col_span ?? 1;
        rows[row]!.cells[col]!.rowSpan = rowSpan > 1 ? rowSpan : undefined;
        rows[row]!.cells[col]!.colSpan = colSpan > 1 ? colSpan : undefined;
      }
    }

    // Build skip set for cells covered by rowSpan / colSpan
    const skipSet = new Set<string>();
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < (rows[r]?.cells.length ?? 0); c++) {
        const cell = rows[r]!.cells[c]!;
        const rs = cell.rowSpan ?? 1;
        const cs = cell.colSpan ?? 1;
        if (rs > 1 || cs > 1) {
          for (let rr = r; rr < r + rs; rr++) {
            for (let cc = c; cc < c + cs; cc++) {
              if (rr === r && cc === c) continue;
              skipSet.add(`${rr}-${cc}`);
            }
          }
        }
      }
    }

    // Filter out covered cells
    const filteredRows: MdTableRow[] = [];
    for (let r = 0; r < rows.length; r++) {
      const cells = [];
      for (let c = 0; c < (rows[r]?.cells.length ?? 0); c++) {
        if (!skipSet.has(`${r}-${c}`)) {
          cells.push(rows[r]!.cells[c]!);
        }
      }
      if (cells.length > 0) {
        filteredRows.push({ cells });
      }
    }

    return { type: 'table', rows: filteredRows };
  },
};

function flattenToInline (nodes: MdBlockNode[]): MdInlineNode[] {
  const result: MdInlineNode[] = [];
  for (const node of nodes) {
    flattenBlockToInline(node, result, '');
  }
  return normalizeCellInline(result);
}

// ─── Cell Content Flattening ─────────────────────────────────────────────────
//
// Markdown 表格单元格只能容纳行内内容：把单元格内的块级子块逐个展开为行内节点，
// 块与块之间以换行分隔（序列化时 escapeCell 会把 \n 转成 <br>）。
// 除 paragraph 外还需支持 bullet/ordered/todo/quote/callout/image 等块类型，
// 否则这些内容会被静默丢弃（表现为导出内容缺失）。

const LINE_BREAK: MdInlineNode = { type: 'text', content: '\n' };

function isBreak (node: MdInlineNode): boolean {
  return node.type === 'text' && node.content === '\n';
}

/** 开启一行：非首行时先补换行，再写入缩进与行内内容。 */
function startLine (result: MdInlineNode[], indent: string, inline: MdInlineNode[]): void {
  const last = result[result.length - 1];
  if (result.length > 0 && !isBreak(last!)) result.push(LINE_BREAK);
  if (indent) result.push({ type: 'text', content: indent });
  result.push(...inline);
}

function flattenBlockToInline (node: MdBlockNode, result: MdInlineNode[], indent: string): void {
  switch (node.type) {
    case 'paragraph':
      startLine(result, indent, node.children);
      break;
    case 'heading':
      startLine(result, indent, [{ type: 'bold', children: node.children }]);
      break;
    case 'bullet': {
      startLine(result, indent, [{ type: 'text', content: '- ' }, ...node.text]);
      for (const child of node.children) flattenBlockToInline(child, result, `${indent}  `);
      break;
    }
    case 'ordered': {
      startLine(result, indent, [{ type: 'text', content: `${node.order}. ` }, ...node.text]);
      for (const child of node.children) flattenBlockToInline(child, result, `${indent}  `);
      break;
    }
    case 'todo':
      startLine(result, indent, [
        { type: 'text', content: node.checked ? '- [x] ' : '- [ ] ' },
        ...node.text,
      ]);
      break;
    case 'quote':
      for (const child of node.children) flattenBlockToInline(child, result, `${indent}> `);
      break;
    case 'callout':
      for (const child of node.children) flattenBlockToInline(child, result, indent);
      break;
    case 'codeBlock':
      // 多行内容以一个 text 节点保留换行，escapeCell 会转为 <br>
      startLine(result, indent, [{ type: 'text', content: node.content }]);
      break;
    case 'image':
      startLine(result, indent, [{ type: 'image', alt: node.alt, src: node.src }]);
      break;
    case 'whiteboard':
      // 保留 whiteboard 行内节点，由 transformer 生成 SVG 后替换（直接转 image 会丢失 token 导致死链）
      startLine(result, indent, [{ type: 'whiteboard', token: node.token }]);
      break;
    case 'grid':
      for (const child of node.children) flattenBlockToInline(child, result, indent);
      break;
    case 'divider':
      startLine(result, indent, [{ type: 'text', content: '---' }]);
      break;
    default:
      // 其余类型（含嵌套 table 等）无安全的行内表达，仅展开其嵌套子块兜底
      break;
  }
  // 通用：未被 parser 消费的嵌套子块（飞书折叠/大纲等场景）不丢弃
  for (const b of node.blocks ?? []) flattenBlockToInline(b, result, `${indent}  `);
}

/** 折叠连续换行、去掉空白节点与首尾多余换行。 */
function normalizeCellInline (nodes: MdInlineNode[]): MdInlineNode[] {
  const out: MdInlineNode[] = [];
  for (const node of nodes) {
    if (node.type !== 'text') {
      out.push(node);
      continue;
    }
    if (node.content === '') continue;
    if (isBreak(node) && (out.length === 0 || isBreak(out[out.length - 1]!))) continue;
    out.push(node);
  }
  while (out.length > 0 && out[out.length - 1]!.type === 'text' && (isBreak(out[out.length - 1]!) || out[out.length - 1]!.content === '')) {
    out.pop();
  }
  return out;
}
