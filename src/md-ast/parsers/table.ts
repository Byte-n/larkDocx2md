import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode, MdInlineNode, MdTableRow } from '../types.js';

export const tableParser: BlockParser = {
  blockType: 31,
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
        rows[row]!.cells[col]!.rowSpan = m.row_span > 1 ? m.row_span : undefined;
        rows[row]!.cells[col]!.colSpan = m.col_span > 1 ? m.col_span : undefined;
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
    if (node.type === 'paragraph') {
      result.push(...node.children);
    }
  }
  return result;
}
