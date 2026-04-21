import type { BBox, WNode } from './types.js';
import type { SvgBackground } from '../types.js';
import { PADDING, r } from './utils.js';
import { renderDefs } from './defs.js';
import { DefaultRenderContext } from './render-context.js';
import { registerAllRenderers, resolveConnectorPoints } from './renderers/index.js';

// Ensure shape paths are loaded (side-effect import)
import './shape-paths.js';

// Register all built-in renderers once
registerAllRenderers();

// ─── Shared Node Context Preparation ────────────────────────────────────────

export interface NodeContext {
  nodeMap: Map<string, WNode>;
  mindMapChildrenMap: Map<string, string[]>;
  mindMapChildIds: Set<string>;
  rootNodes: WNode[];
  referencedIds: Set<string>;
}

/**
 * 预处理节点数组，构建 SVG/YAML 管线共享的上下文数据
 */
export function prepareNodeContext (nodes: WNode[]): NodeContext {
  const nodeMap = new Map<string, WNode>();
  for (const n of nodes) {
    if (n.id) nodeMap.set(n.id, n);
  }

  // 构建思维导图父→子映射
  const mindMapChildrenMap = new Map<string, string[]>();
  const mindMapChildIds = new Set<string>();
  for (const n of nodes) {
    if (n.type !== 'mind_map' || !n.id) continue;
    const pid = n.mind_map_node?.parent_id ?? n.mind_map?.parent_id;
    if (!pid) continue;
    mindMapChildIds.add(n.id);
    let list = mindMapChildrenMap.get(pid);
    if (!list) {
      list = [];
      mindMapChildrenMap.set(pid, list);
    }
    list.push(n.id);
  }

  // 仅渲染根节点
  const rootNodes = nodes
    .filter(n => !n.parent_id && !mindMapChildIds.has(n.id ?? ''))
    .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));

  // 收集被引用的 ID
  const referencedIds = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'connector' && n.connector) {
      const fromId = n.connector.start?.attached_object?.id ?? n.connector.start_object?.id;
      const toId = n.connector.end?.attached_object?.id ?? n.connector.end_object?.id;
      if (fromId) referencedIds.add(fromId);
      if (toId) referencedIds.add(toId);
    }
    const mindParentId = n.mind_map_node?.parent_id ?? n.mind_map?.parent_id;
    if (mindParentId) referencedIds.add(mindParentId);
  }

  return { nodeMap, mindMapChildrenMap, mindMapChildIds, rootNodes, referencedIds };
}

// ─── Main Entry ──────────────────────────────────────────────────────────────

export type { SvgBackground } from '../types.js';

/**
 * 将飞书画板节点数组转换为 SVG 字符串
 */
export function whiteboardNodesToSvg (nodes: WNode[], bg: SvgBackground = 'none'): string {
  const { nodeMap, mindMapChildrenMap, rootNodes, referencedIds } = prepareNodeContext(nodes);

  // 创建渲染上下文
  const usedMarkers = new Set<string>();
  const ctx = new DefaultRenderContext({
    nodeMap,
    usedMarkers,
    mindMapChildrenMap,
    referencedIds,
  });

  const bbox = calcViewBox(nodes, nodeMap);
  const vb = `${r(bbox.minX)} ${r(bbox.minY)} ${r(bbox.maxX - bbox.minX)} ${r(bbox.maxY - bbox.minY)}`;
  const w = r(bbox.maxX - bbox.minX);
  const h = r(bbox.maxY - bbox.minY);

  const body = rootNodes.map(n => ctx.renderNode(n)).join('\n');
  const defs = renderDefs(usedMarkers);

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">`];

  const extraDefs: string[] = [];
  const bgRects: string[] = [];
  if (bg === 'dot') {
    extraDefs.push('<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="0.8" fill="#ccc"/></pattern>');
    bgRects.push(`<rect x="${r(bbox.minX)}" y="${r(bbox.minY)}" width="${w}" height="${h}" fill="#fff"/>`);
    bgRects.push(`<rect x="${r(bbox.minX)}" y="${r(bbox.minY)}" width="${w}" height="${h}" fill="url(#grid)"/>`);
  } else if (bg !== 'none') {
    bgRects.push(`<rect x="${r(bbox.minX)}" y="${r(bbox.minY)}" width="${w}" height="${h}" fill="${bg}"/>`);
  }
  const markerDefs = defs ? defs.slice(6, -7) : '';
  const allDefs = [...extraDefs, markerDefs].filter(Boolean).join('');
  if (allDefs) parts.push(`<defs>${allDefs}</defs>`);
  if (bgRects.length) parts.push(bgRects.join(''));
  parts.push(body, '</svg>');
  return parts.join('\n');
}

// ─── ViewBox Calculation ─────────────────────────────────────────────────────

function calcViewBox (nodes: WNode[], nodeMap: Map<string, WNode>): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function expand (x1: number, y1: number, x2: number, y2: number) {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  }

  for (const n of nodes) {
    if (n.parent_id) continue;

    if (n.type === 'connector') {
      expandConnector(n, nodeMap, expand);
      continue;
    }
    if (n.type === 'paint') {
      expandPaint(n, expand);
      continue;
    }
    if (n.x == null || n.y == null) continue;
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    if (n.angle) {
      const rb = rotatedBounds(n.x, n.y, w, h, n.angle);
      expand(rb.minX, rb.minY, rb.maxX, rb.maxY);
    } else {
      expand(n.x, n.y, n.x + w, n.y + h);
    }
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }
  return {
    minX: minX - PADDING,
    minY: minY - PADDING,
    maxX: maxX + PADDING,
    maxY: maxY + PADDING,
  };
}

function expandConnector (
  n: WNode,
  nodeMap: Map<string, WNode>,
  expand: (x1: number, y1: number, x2: number, y2: number) => void,
) {
  const conn = n.connector;
  if (!conn) return;
  const pts = resolveConnectorPoints(conn, nodeMap, n);
  for (const p of pts) {
    expand(p.x, p.y, p.x, p.y);
  }
}

function expandPaint (
  n: WNode,
  expand: (x1: number, y1: number, x2: number, y2: number) => void,
) {
  const paint = n.paint;
  if (!paint?.lines) return;
  const ox = n.x ?? 0;
  const oy = n.y ?? 0;
  for (const p of paint.lines) {
    const px = ox + (p.x ?? 0);
    const py = oy + (p.y ?? 0);
    expand(px, py, px, py);
  }
}

function rotatedBounds (x: number, y: number, w: number, h: number, angleDeg: number): BBox {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const [dx, dy] of corners) {
    const rx = cx + dx! * cos - dy! * sin;
    const ry = cy + dx! * sin + dy! * cos;
    bMinX = Math.min(bMinX, rx);
    bMinY = Math.min(bMinY, ry);
    bMaxX = Math.max(bMaxX, rx);
    bMaxY = Math.max(bMaxY, ry);
  }
  return { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY };
}
