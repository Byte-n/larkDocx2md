import type { NodeRenderer, RenderContext, WNode, WStyle } from '../types.js';
import { nodeDataAttrs, r, styleAttrs, transformAttr } from '../utils.js';
import { renderCellText } from '../text.js';

// ─── Table Renderer ─────────────────────────────────────────────────────────

export const tableRenderer: NodeRenderer = {
  type: 'table',
  render (n: WNode, ctx: RenderContext): string {
    const tf = transformAttr(n);
    const tbl = n.table;
    if (!tbl?.meta) return `<g${tf}${nodeDataAttrs(n, ctx.referencedIds)}/>`;

    const w = n.width ?? 200;
    const rowNum = tbl.meta.row_num ?? 1;
    const colNum = tbl.meta.col_num ?? 1;
    const rowSizes = tbl.meta.row_sizes ?? [];
    const colSizes = tbl.meta.col_sizes ?? [];

    const rSize = (ri: number) => rowSizes[ri] ?? (0);
    const cSize = (ci: number) => colSizes[ci] ?? (0);
    const rowY = (ri: number) => {
      let v = 0;
      for (let i = 0; i < ri; i++) v += rSize(i) || (h / rowNum);
      return v;
    };
    const colX = (ci: number) => {
      let v = 0;
      for (let i = 0; i < ci; i++) v += cSize(i) || (w / colNum);
      return v;
    };

    const rowSizeSum = rowSizes.reduce((a, b) => a + b, 0);
    let childMaxY = 0;
    if (tbl.cells) {
      for (const cell of tbl.cells) {
        if (cell.children) {
          for (const childId of cell.children) {
            const child = ctx.nodeMap.get(childId);
            if (child && child.y != null) {
              childMaxY = Math.max(childMaxY, child.y + (child.height ?? 0));
            }
          }
        }
      }
    }
    const h = Math.max(n.height ?? 0, rowSizeSum, childMaxY) || 100;

    // 构建合并占用网格
    const owner: string[][] = Array.from({ length: rowNum }, () => Array(colNum).fill(''));
    const spanMap = new Map<string, { rowSpan: number; colSpan: number }>();

    if (tbl.cells) {
      for (const cell of tbl.cells) {
        const rs = cell.merge_info?.row_span ?? 1;
        const cs = cell.merge_info?.col_span ?? 1;
        if (rs <= 1 && cs <= 1) continue;
        const ri = (cell.row_index ?? 1) - 1;
        const ci = (cell.col_index ?? 1) - 1;
        const key = `${ri},${ci}`;
        spanMap.set(key, { rowSpan: rs, colSpan: cs });
        for (let dr = 0; dr < rs; dr++) {
          for (let dc = 0; dc < cs; dc++) {
            if (ri + dr < rowNum && ci + dc < colNum) {
              owner[ri + dr]![ci + dc] = key;
            }
          }
        }
      }
      for (const cell of tbl.cells) {
        const ri = (cell.row_index ?? 1) - 1;
        const ci = (cell.col_index ?? 1) - 1;
        const key = `${ri},${ci}`;
        if (!spanMap.has(key)) {
          spanMap.set(key, { rowSpan: 1, colSpan: 1 });
        }
        if (!owner[ri]?.[ci]) {
          owner[ri]![ci] = key;
        }
      }
    }

    const borderColor = n.style?.border_color ?? '#ccc';
    const sa = styleAttrs(tbl.meta.style as WStyle | undefined);
    const lines: string[] = [`<g${tf}${nodeDataAttrs(n, ctx.referencedIds)}>`, `<rect width="${w}" height="${r(h)}" ${sa}/>`];

    // 行线
    for (let ri = 0; ri < rowNum - 1; ri++) {
      const y = rowY(ri + 1);
      let segStart = 0;
      let ci = 0;
      while (ci < colNum) {
        const aboveOwner = owner[ri]?.[ci] ?? '';
        const belowOwner = owner[ri + 1]?.[ci] ?? '';
        if (aboveOwner && aboveOwner === belowOwner) {
          if (ci > segStart) {
            const x1 = colX(segStart);
            const x2 = colX(ci);
            lines.push(`<line x1="${r(x1)}" y1="${r(y)}" x2="${r(x2)}" y2="${r(y)}" stroke="${borderColor}" stroke-width="0.5"/>`);
          }
          const span = spanMap.get(aboveOwner);
          const srcCol = parseInt(aboveOwner.split(',')[1]!);
          ci = srcCol + (span?.colSpan ?? 1);
          segStart = ci;
        } else {
          ci++;
        }
      }
      if (segStart < colNum) {
        const x1 = colX(segStart);
        lines.push(`<line x1="${r(x1)}" y1="${r(y)}" x2="${w}" y2="${r(y)}" stroke="${borderColor}" stroke-width="0.5"/>`);
      }
    }

    // 列线
    for (let ci = 0; ci < colNum - 1; ci++) {
      const x = colX(ci + 1);
      let segStart = 0;
      let ri = 0;
      while (ri < rowNum) {
        const leftOwner = owner[ri]?.[ci] ?? '';
        const rightOwner = owner[ri]?.[ci + 1] ?? '';
        if (leftOwner && leftOwner === rightOwner) {
          if (ri > segStart) {
            const y1 = rowY(segStart);
            const y2 = rowY(ri);
            lines.push(`<line x1="${r(x)}" y1="${r(y1)}" x2="${r(x)}" y2="${r(y2)}" stroke="${borderColor}" stroke-width="0.5"/>`);
          }
          const span = spanMap.get(leftOwner);
          const srcRow = parseInt(leftOwner.split(',')[0]!);
          ri = srcRow + (span?.rowSpan ?? 1);
          segStart = ri;
        } else {
          ri++;
        }
      }
      if (segStart < rowNum) {
        const y1 = rowY(segStart);
        lines.push(`<line x1="${r(x)}" y1="${r(y1)}" x2="${r(x)}" y2="${r(h)}" stroke="${borderColor}" stroke-width="0.5"/>`);
      }
    }

    // 单元格内容
    if (tbl.cells) {
      const rowMap = new Map<number, typeof tbl.cells>();
      for (const cell of tbl.cells) {
        const ri = (cell.row_index ?? 1) - 1;
        if (!rowMap.has(ri)) rowMap.set(ri, []);
        rowMap.get(ri)!.push(cell);
      }

      const sortedRows = [...rowMap.keys()].sort((a, b) => a - b);
      for (const ri of sortedRows) {
        const cells = rowMap.get(ri)!;
        const cy = rowY(ri);

        lines.push(`<g data-node-type="tr" transform="translate(0,${r(cy)})">`);

        const sortedCells = [...cells].sort((a, b) => ((a.col_index ?? 1) - (b.col_index ?? 1)));
        for (const cell of sortedCells) {
          const ci = (cell.col_index ?? 1) - 1;
          const rs = cell.merge_info?.row_span ?? 1;
          const cs = cell.merge_info?.col_span ?? 1;
          const cx = colX(ci);
          let cw = 0;
          for (let c = ci; c < ci + cs && c < colNum; c++) cw += cSize(c) || (w / colNum);
          let ch = 0;
          for (let rv = ri; rv < ri + rs && rv < rowNum; rv++) ch += rSize(rv) || (h / rowNum);

          const spanAttrs = (rs > 1 || cs > 1) ? ` data-rowspan="${rs}" data-colspan="${cs}"` : '';
          lines.push(`<g data-node-type="td" data-col="${ci + 1}"${spanAttrs}>`);

          if (cell.style?.fill_color) {
            const opacity = cell.style.fill_opacity != null ? cell.style.fill_opacity / 100 : 1;
            lines.push(`<rect x="${r(cx)}" y="0" width="${r(cw)}" height="${r(ch)}" fill="${cell.style.fill_color}" fill-opacity="${opacity}"/>`);
          }

          if (cell.text) {
            const cellText = renderCellText(cell.text, tbl.meta.text, cx, 0, cw, ch);
            if (cellText) lines.push(cellText);
          }

          // 子节点的 x/y 已经是相对表格原点的坐标，需要反向抵消 tr 的行偏移
          if (cell.children) {
            lines.push(`<g transform="translate(0,${r(-cy)})">`);
            for (const childId of cell.children) {
              const child = ctx.nodeMap.get(childId);
              if (child) {
                lines.push(ctx.renderNode(child));
              }
            }
            lines.push('</g>');
          }

          lines.push('</g>');
        }

        lines.push('</g>');
      }
    }

    lines.push('</g>');
    return lines.join('\n');
  },
};
