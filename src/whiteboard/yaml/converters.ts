import type { WNode } from '../types.js';
import type { NodeContext } from '../index.js';
import type { YamlMindMapNode, YamlNode, YamlTableCell } from './types.js';
import { extractPlainText } from '../plain-text.js';

// ─── Discarded node types (no semantic value for AI) ────────────────────────

const DISCARDED_TYPES = new Set(['paint', 'svg']);

// ─── Converter Registry ─────────────────────────────────────────────────────

type ConvertFn = (node: WNode, nctx: NodeContext, referencedIds: Set<string>) => YamlNode | null;

const converterMap = new Map<string, ConvertFn>();

function register (type: string, fn: ConvertFn): void {
  converterMap.set(type, fn);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 将单个 WNode 转换为 YamlNode（如果需要丢弃则返回 null）
 */
export function convertNode (node: WNode, nctx: NodeContext, referencedIds?: Set<string>): YamlNode | null {
  if (!node.type || DISCARDED_TYPES.has(node.type)) return null;
  const refs = referencedIds ?? nctx.referencedIds;
  const fn = converterMap.get(node.type);
  if (fn) return fn(node, nctx, refs);
  return convertFallback(node, nctx, refs);
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function convertChildren (node: WNode, nctx: NodeContext, referencedIds: Set<string>): YamlNode[] | undefined {
  if (!node.children?.length) return undefined;
  const result: YamlNode[] = [];
  for (const childId of node.children) {
    const child = nctx.nodeMap.get(childId);
    if (child) {
      const converted = convertNode(child, nctx, referencedIds);
      if (converted) result.push(converted);
    }
  }
  return result.length ? result : undefined;
}

function base (node: WNode, referencedIds: Set<string>): YamlNode {
  const out: YamlNode = { type: node.type ?? 'unknown' };
  if (node.id && referencedIds.has(node.id)) {
    out.id = node.id;
  }
  return out;
}

// ─── Composite Shape ────────────────────────────────────────────────────────

register('composite_shape', (n, nctx, refs) => {
  const out: YamlNode = {};
  if (n.id && refs.has(n.id)) out.id = n.id;
  out.shape = n.composite_shape?.type ?? 'rect';
  const text = extractPlainText(n.text);
  if (text) out.text = text;
  out.children = convertChildren(n, nctx, refs);
  return out;
});

// ─── Text Shape ─────────────────────────────────────────────────────────────

register('text_shape', (n, _nctx, refs) => {
  const out = base(n, refs);
  const text = extractPlainText(n.text);
  if (text) out.text = text;
  return out;
});

// ─── Image ──────────────────────────────────────────────────────────────────

register('image', (n, _nctx, refs) => {
  const out = base(n, refs);
  out.token = n.image?.token ?? '';
  return out;
});

// ─── Connector ──────────────────────────────────────────────────────────────

register('connector', (n, _nctx, refs) => {
  const conn = n.connector;
  if (!conn) return null;

  const out: YamlNode = {};
  if (n.id && refs.has(n.id)) out.id = n.id;
  out.from = conn.start?.attached_object?.id ?? conn.start_object?.id ?? '';
  out.to = conn.end?.attached_object?.id ?? conn.end_object?.id ?? '';
  out.connector_shape = conn.shape ?? 'straight';

  // 连接器文本标签
  if (conn.captions?.data?.length) {
    const labels = conn.captions.data
      .map(c => c?.text)
      .filter(Boolean) as string[];
    if (labels.length) out.label = labels.join(' ');
  }

  // 箭头样式
  const startArrow = conn.start?.arrow_style;
  const endArrow = conn.end?.arrow_style;
  if (startArrow && startArrow !== 'none') out.start_arrow = startArrow;
  if (endArrow && endArrow !== 'none') out.end_arrow = endArrow;

  return out;
});

// ─── Group ──────────────────────────────────────────────────────────────────

register('group', (n, nctx, refs) => {
  const out = base(n, refs);
  out.children = convertChildren(n, nctx, refs);
  return out;
});

// ─── Section ────────────────────────────────────────────────────────────────

register('section', (n, nctx, refs) => {
  const out = base(n, refs);
  const title = n.section?.title;
  if (title) out.title = title;
  out.children = convertChildren(n, nctx, refs);
  return out;
});

// ─── Sticky Note ────────────────────────────────────────────────────────────

register('sticky_note', (n, _nctx, refs) => {
  const out = base(n, refs);
  const text = extractPlainText(n.text);
  if (text) out.text = text;
  out.color = n.style?.fill_color;
  return out;
});

// ─── Table ──────────────────────────────────────────────────────────────────

register('table', (n, nctx, refs) => {
  const tbl = n.table;
  if (!tbl?.meta) return base(n, refs);

  const out = base(n, refs);
  out.rows = tbl.meta.row_num ?? 0;
  out.cols = tbl.meta.col_num ?? 0;

  if (tbl.cells?.length) {
    const cells: YamlTableCell[] = [];
    for (const cell of tbl.cells) {
      const yamlCell: YamlTableCell = {
        row: cell.row_index ?? 1,
        col: cell.col_index ?? 1,
      };

      // 单元格文本
      const cellText = extractPlainText(cell.text);
      if (cellText) yamlCell.text = cellText;

      // 合并信息
      const rs = cell.merge_info?.row_span ?? 1;
      const cs = cell.merge_info?.col_span ?? 1;
      if (rs > 1) yamlCell.row_span = rs;
      if (cs > 1) yamlCell.col_span = cs;

      // 子节点（表格单元格内可嵌套任意节点）
      if (cell.children?.length) {
        const childNodes: YamlNode[] = [];
        for (const childId of cell.children) {
          const child = nctx.nodeMap.get(childId);
          if (child) {
            const converted = convertNode(child, nctx, refs);
            if (converted) childNodes.push(converted);
          }
        }
        if (childNodes.length) yamlCell.children = childNodes;
      }

      cells.push(yamlCell);
    }
    out.cells = cells;
  }

  return out;
});

// ─── Mind Map ───────────────────────────────────────────────────────────────

register('mind_map', (n, nctx, refs) => {
  // 只处理根节点（有 mind_map_root），子节点递归处理
  if (!n.mind_map_root) return null;

  const out = base(n, refs);
  out.mind_map = buildMindMapTree(n, nctx);
  return out;
});

function buildMindMapTree (node: WNode, nctx: NodeContext): YamlMindMapNode {
  const result: YamlMindMapNode = {};

  // 思维导图节点不会被 connector 引用，无需 id

  const text = extractPlainText(node.text);
  if (text) result.text = text;

  const childIds = nctx.mindMapChildrenMap.get(node.id ?? '');
  if (childIds?.length) {
    const children: YamlMindMapNode[] = [];
    for (const cid of childIds) {
      const child = nctx.nodeMap.get(cid);
      if (child) children.push(buildMindMapTree(child, nctx));
    }
    if (children.length) result.children = children;
  }

  return result;
}

// ─── Fallback ───────────────────────────────────────────────────────────────

function convertFallback (node: WNode, nctx: NodeContext, referencedIds: Set<string>): YamlNode {
  const out = base(node, referencedIds);
  const text = extractPlainText(node.text);
  if (text) out.text = text;
  out.children = convertChildren(node, nctx, referencedIds);
  return out;
}
