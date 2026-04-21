import type { WNode, WStyle } from './types.js';

// ─── Node Traversal ─────────────────────────────────────────────────────────

export type NodePredicate = (node: WNode) => boolean;

/**
 * 遍历节点树，对每个节点执行回调。
 * 基于 parent_id / children 关系构建树，深度优先遍历。
 */
export function walkNodes (
  nodes: WNode[],
  visitor: (node: WNode, parent: WNode | null, depth: number) => void | false,
): void {
  const nodeMap = new Map<string, WNode>();
  for (const n of nodes) {
    if (n.id) nodeMap.set(n.id, n);
  }

  // 找到根节点（无 parent_id）
  const roots = nodes.filter(n => !n.parent_id);

  function walk (node: WNode, parent: WNode | null, depth: number): void {
    const result = visitor(node, parent, depth);
    if (result === false) return; // 返回 false 时跳过子节点

    // 遍历 children
    const childIds = node.children ?? [];
    for (const cid of childIds) {
      const child = nodeMap.get(cid);
      if (child) walk(child, node, depth + 1);
    }

    // 遍历 table cells 中引用的子节点
    if (node.table?.cells) {
      for (const cell of node.table.cells) {
        const cellChildren = cell.children ?? [];
        for (const cid of cellChildren) {
          const child = nodeMap.get(cid);
          if (child) walk(child, node, depth + 1);
        }
      }
    }

    // 遍历 mind_map_root 的方向子节点
    if (node.mind_map_root) {
      const dirs = [
        ...(node.mind_map_root.up_children ?? []),
        ...(node.mind_map_root.down_children ?? []),
        ...(node.mind_map_root.left_children ?? []),
        ...(node.mind_map_root.right_children ?? []),
      ];
      for (const cid of dirs) {
        const child = nodeMap.get(cid);
        if (child) walk(child, node, depth + 1);
      }
    }

    // 遍历 mind_map_node 的子节点
    if (node.mind_map_node?.children) {
      for (const cid of node.mind_map_node.children) {
        const child = nodeMap.get(cid);
        if (child) walk(child, node, depth + 1);
      }
    }
  }

  for (const root of roots) {
    walk(root, null, 0);
  }
}

/**
 * 过滤节点树：排除不满足 predicate 的节点及其所有后代。
 * 返回过滤后的扁平数组，同时修正 children 引用。
 */
export function filterNodes (nodes: WNode[], predicate: NodePredicate): WNode[] {
  const excluded = new Set<string>();

  // 先标记所有需要排除的节点
  walkNodes(nodes, (node, _parent, _depth) => {
    if (!node.id) return;
    // 如果父节点已被排除，子节点也排除
    if (node.parent_id && excluded.has(node.parent_id)) {
      excluded.add(node.id);
      return false;
    }
    if (!predicate(node)) {
      excluded.add(node.id);
      return false; // 跳过子树
    }
  });

  // 过滤并修正 children 引用
  return nodes
    .filter(n => !n.id || !excluded.has(n.id))
    .map(n => {
      const patched = { ...n };
      if (patched.children) {
        patched.children = patched.children.filter(id => !excluded.has(id));
      }
      if (patched.table?.cells) {
        patched.table = {
          ...patched.table,
          cells: patched.table.cells.map(cell => ({
            ...cell,
            children: cell.children?.filter(id => !excluded.has(id)),
          })),
        };
      }
      if (patched.mind_map_root) {
        patched.mind_map_root = {
          ...patched.mind_map_root,
          up_children: patched.mind_map_root.up_children?.filter(id => !excluded.has(id)),
          down_children: patched.mind_map_root.down_children?.filter(id => !excluded.has(id)),
          left_children: patched.mind_map_root.left_children?.filter(id => !excluded.has(id)),
          right_children: patched.mind_map_root.right_children?.filter(id => !excluded.has(id)),
        };
      }
      if (patched.mind_map_node?.children) {
        patched.mind_map_node = {
          ...patched.mind_map_node,
          children: patched.mind_map_node.children.filter(id => !excluded.has(id)),
        };
      }
      return patched;
    });
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PADDING = 24;

export const BORDER_WIDTH_MAP: Record<string, number> = {
  extra_narrow: 0.5,
  narrow: 1,
  medium: 2,
  bold: 3,
};

export const DASH_ARRAY_MAP: Record<string, string> = {
  solid: '',
  none: '',
  dash: '8,4',
  dot: '2,2',
};

// ─── Utility Functions ───────────────────────────────────────────────────────

/** 将数值四舍五入到 2 位小数，去除尾部多余零 */
export function r (v: number): number {
  return Math.round(v * 100) / 100;
}

export function esc (s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function styleAttrs (s?: WStyle): string {
  if (!s) return 'fill="none" stroke="#333"';
  const parts: string[] = [];
  // fill
  if (s.fill_color) parts.push(`fill="${s.fill_color}"`);
  else parts.push('fill="none"');
  // fill-opacity: 省略默认值 1
  if (s.fill_opacity != null && s.fill_opacity !== 100) parts.push(`fill-opacity="${r(s.fill_opacity / 100)}"`);
  // stroke
  if (s.border_style === 'none') parts.push('stroke="none"');
  else if (s.border_color) parts.push(`stroke="${s.border_color}"`);
  else parts.push('stroke="#333"');
  // stroke-width: 省略默认值 1
  const sw = BORDER_WIDTH_MAP[s.border_width ?? 'narrow'] ?? 1;
  if (sw !== 1) parts.push(`stroke-width="${sw}"`);
  // stroke-opacity: 省略默认值 1
  if (s.border_opacity != null && s.border_opacity !== 100) parts.push(`stroke-opacity="${r(s.border_opacity / 100)}"`);
  // stroke-dasharray
  const dash = s.border_style ? DASH_ARRAY_MAP[s.border_style] : '';
  if (dash) parts.push(`stroke-dasharray="${dash}"`);
  return parts.join(' ');
}

export function transformAttr (n: WNode): string {
  const parts: string[] = [];
  if (n.x != null || n.y != null) parts.push(`translate(${r(n.x ?? 0)},${r(n.y ?? 0)})`);
  if (n.angle) {
    const cx = r((n.width ?? 0) / 2);
    const cy = r((n.height ?? 0) / 2);
    parts.push(`rotate(${r(n.angle)},${cx},${cy})`);
  }
  if (n.style?.h_flip || n.style?.v_flip) {
    const sx = n.style.h_flip ? -1 : 1;
    const sy = n.style.v_flip ? -1 : 1;
    const cx = r((n.width ?? 0) / 2);
    const cy = r((n.height ?? 0) / 2);
    parts.push(`translate(${cx},${cy}) scale(${sx},${sy}) translate(${-cx},${-cy})`);
  }
  return parts.length ? ` transform="${parts.join(' ')}"` : '';
}

/** 需要保留 data-type 的节点类型（有特殊语义） */
const TYPED_NODES = new Set(['paint', 'group', 'image', 'section', 'table', 'mind_map']);

const debugAll = typeof process !== 'undefined' && !!process.env.WHITEBOARD_DEBUG;

/** 生成节点的公共属性：data-id（仅在被引用或 debug 时输出）+ 可选 data-type */
export function nodeDataAttrs (n: WNode, referencedIds?: ReadonlySet<string>): string {
  const showId = n.id && (debugAll || referencedIds?.has(n.id));
  const id = showId ? ` data-id="${n.id}"` : '';
  const dt = TYPED_NODES.has(n.type) ? ` data-type="${n.type}"` : '';
  return `${id}${dt}`;
}

/** 包裹 <g> 标签，自动过滤空内容，并附加节点数据属性 */
export function gWrap (tf: string, parts: string[], n?: WNode, referencedIds?: ReadonlySet<string>, extraAttrs?: string): string {
  const inner = parts.filter(Boolean).join('\n');
  const da = n ? nodeDataAttrs(n, referencedIds) : '';
  const extra = extraAttrs ? ` ${extraAttrs}` : '';
  return `<g${tf}${da}${extra}>${inner ? '\n' + inner + '\n' : ''}</g>`;
}
