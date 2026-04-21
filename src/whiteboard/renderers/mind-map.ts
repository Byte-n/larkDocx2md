import type { NodeRenderer, RenderContext, WNode } from '../types.js';
import { gWrap, r, styleAttrs, transformAttr } from '../utils.js';
import { renderTextContent } from '../text.js';

// ─── Mind Map Renderer ──────────────────────────────────────────────────────

export const mindMapRenderer: NodeRenderer = {
  type: 'mind_map',
  render (n: WNode, ctx: RenderContext): string {
    const w = n.width ?? 100;
    const h = n.height ?? 40;
    const tf = transformAttr(n);
    const sa = styleAttrs(n.style);
    const text = renderTextContent(n.text, w, h);
    const children = ctx.renderChildren(n);

    const shape = renderMindMapNodeShape(
      n.mind_map_root?.type ?? n.mind_map_node?.type ?? 'mind_map_round_rect',
      w, h, sa,
    );

    const mindMapContent = renderMindMapChildren(n, ctx, 0);

    const layout = n.mind_map_root?.layout ?? '';
    const rootAttrs = `data-mind-level="0"${layout ? ` data-mind-layout="${layout}"` : ''}`;
    return gWrap(tf, [shape, text, children, mindMapContent], n, ctx.referencedIds, rootAttrs);
  },
};

// ─── Shared shape helper (eliminates duplication) ───────────────────────────

function renderMindMapNodeShape (shapeType: string, w: number, h: number, sa: string): string {
  if (shapeType === 'mind_map_full_round_rect' || shapeType === 'mind_node_full_round_rect') {
    return `<rect width="${w}" height="${h}" rx="${r(Math.min(w, h) / 2)}" ${sa}/>`;
  }
  if (shapeType === 'mind_map_text' || shapeType === 'mind_node_text') {
    return '';
  }
  return `<rect width="${w}" height="${h}" rx="6" ${sa}/>`;
}

// ─── Recursive children rendering ───────────────────────────────────────────

function renderMindMapChildren (
  parent: WNode, ctx: RenderContext, parentLevel: number,
): string {
  if (!parent.id) return '';
  const childIds = ctx.mindMapChildrenMap.get(parent.id);
  if (!childIds?.length) return '';

  const px = parent.x ?? 0, py = parent.y ?? 0;
  const pw = parent.width ?? 100, ph = parent.height ?? 40;
  const strokeColor = parent.style?.border_color ?? '#999';

  // 获取全局 line_style（从根节点取）
  let lineStyle = 'round_angle';
  let rootNode: WNode | undefined = parent;
  while (rootNode && !rootNode.mind_map_root) {
    const rpid: string | undefined = rootNode.mind_map_node?.parent_id ?? rootNode.mind_map?.parent_id;
    rootNode = rpid ? ctx.nodeMap.get(rpid) : undefined;
  }
  if (rootNode?.mind_map_root?.line_style) lineStyle = rootNode.mind_map_root.line_style;

  // 根节点方向列表
  const dirListMap = new Map<string, string>();
  if (rootNode?.mind_map_root) {
    for (const id of rootNode.mind_map_root.right_children ?? []) dirListMap.set(id, 'right');
    for (const id of rootNode.mind_map_root.left_children ?? []) dirListMap.set(id, 'left');
    for (const id of rootNode.mind_map_root.up_children ?? []) dirListMap.set(id, 'up');
    for (const id of rootNode.mind_map_root.down_children ?? []) dirListMap.set(id, 'down');
  }

  const parts: string[] = [];
  for (const cid of childIds) {
    const child = ctx.nodeMap.get(cid);
    if (!child || child.x == null || child.y == null) continue;

    const cx = child.x, cy = child.y;
    const cw = child.width ?? 100, ch = child.height ?? 40;

    const dir = dirListMap.get(cid) ?? getMindMapChildDir(cid, parent, child, ctx.nodeMap, dirListMap);

    // 局部坐标连线
    const relCx = cx - px, relCy = cy - py;
    let fromX: number, fromY: number, toX: number, toY: number;
    switch (dir) {
      case 'right':
        fromX = pw;
        fromY = ph / 2;
        toX = relCx;
        toY = relCy + ch / 2;
        break;
      case 'left':
        fromX = 0;
        fromY = ph / 2;
        toX = relCx + cw;
        toY = relCy + ch / 2;
        break;
      case 'down':
        fromX = pw / 2;
        fromY = ph;
        toX = relCx + cw / 2;
        toY = relCy;
        break;
      case 'up':
        fromX = pw / 2;
        fromY = 0;
        toX = relCx + cw / 2;
        toY = relCy + ch;
        break;
      default:
        fromX = pw;
        fromY = ph / 2;
        toX = relCx;
        toY = relCy + ch / 2;
    }
    const pathD = buildMindMapPolyline(fromX, fromY, toX, toY, dir, lineStyle);
    parts.push(`<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.5"/>`);

    // 子节点本身
    const cTf = ` transform="translate(${r(relCx)},${r(relCy)})"`;
    const cSa = styleAttrs(child.style);
    const cText = renderTextContent(child.text, cw, ch);
    const cShape = renderMindMapNodeShape(
      child.mind_map_node?.type ?? 'mind_map_round_rect',
      cw, ch, cSa,
    );

    const childLevel = parentLevel + 1;
    const grandChildren = renderMindMapChildren(child, ctx, childLevel);
    const mindParentId = child.mind_map_node?.parent_id ?? child.mind_map?.parent_id ?? '';
    const childAttrs = `data-mind-level="${childLevel}"${mindParentId ? ` data-mind-parent="${mindParentId}"` : ''} data-mind-dir="${dir}"`;
    parts.push(gWrap(cTf, [cShape, cText, grandChildren], child, ctx.referencedIds, childAttrs));
  }
  return parts.join('\n');
}

function getMindMapChildDir (
  childId: string, parent: WNode, child: WNode,
  nodeMap: ReadonlyMap<string, WNode>, dirListMap: Map<string, string>,
): string {
  let ancestor: WNode | undefined = parent;
  while (ancestor?.id && !dirListMap.has(ancestor.id)) {
    const apid: string | undefined = ancestor.mind_map_node?.parent_id ?? ancestor.mind_map?.parent_id;
    ancestor = apid ? nodeMap.get(apid) : undefined;
  }
  if (ancestor?.id && dirListMap.has(ancestor.id)) {
    const dir = dirListMap.get(ancestor.id)!;
    dirListMap.set(childId, dir);
    return dir;
  }
  const px = parent.x ?? 0, py = parent.y ?? 0;
  const pw = parent.width ?? 100, ph = parent.height ?? 40;
  const cx = child.x ?? 0, cy = child.y ?? 0, cw = child.width ?? 100;
  let dir: string;
  if (cx >= px + pw) dir = 'right';
  else if (cx + cw <= px) dir = 'left';
  else if (cy >= py + ph) dir = 'down';
  else dir = 'up';
  dirListMap.set(childId, dir);
  return dir;
}

function buildMindMapPolyline (
  fromX: number, fromY: number, toX: number, toY: number,
  dir: string, lineStyle: string,
): string {
  if (dir === 'left' || dir === 'right') {
    const midX = (fromX + toX) / 2;
    const dy = Math.abs(toY - fromY);
    if (dy < 1) return `M${r(fromX)},${r(fromY)} L${r(toX)},${r(toY)}`;
    if (lineStyle === 'curve') {
      return `M${r(fromX)},${r(fromY)} C${r(midX)},${r(fromY)} ${r(midX)},${r(toY)} ${r(toX)},${r(toY)}`;
    }
    if (lineStyle === 'round_angle') {
      const radius = Math.min(Math.abs(midX - fromX), dy / 2, 8);
      const sy = toY > fromY ? 1 : -1;
      const rx = dir === 'right' ? radius : -radius;
      return `M${r(fromX)},${r(fromY)} L${r(midX - rx)},${r(fromY)} Q${r(midX)},${r(fromY)} ${r(midX)},${r(fromY + sy * radius)} L${r(midX)},${r(toY - sy * radius)} Q${r(midX)},${r(toY)} ${r(midX + rx)},${r(toY)} L${r(toX)},${r(toY)}`;
    }
    return `M${r(fromX)},${r(fromY)} L${r(midX)},${r(fromY)} L${r(midX)},${r(toY)} L${r(toX)},${r(toY)}`;
  } else {
    const midY = (fromY + toY) / 2;
    const dx = Math.abs(toX - fromX);
    if (dx < 1) return `M${r(fromX)},${r(fromY)} L${r(toX)},${r(toY)}`;
    if (lineStyle === 'curve') {
      return `M${r(fromX)},${r(fromY)} C${r(fromX)},${r(midY)} ${r(toX)},${r(midY)} ${r(toX)},${r(toY)}`;
    }
    if (lineStyle === 'round_angle') {
      const radius = Math.min(Math.abs(midY - fromY), dx / 2, 8);
      const sx = toX > fromX ? 1 : -1;
      const ry = dir === 'down' ? radius : -radius;
      return `M${r(fromX)},${r(fromY)} L${r(fromX)},${r(midY - ry)} Q${r(fromX)},${r(midY)} ${r(fromX + sx * radius)},${r(midY)} L${r(toX - sx * radius)},${r(midY)} Q${r(toX)},${r(midY)} ${r(toX)},${r(midY + ry)} L${r(toX)},${r(toY)}`;
    }
    return `M${r(fromX)},${r(fromY)} L${r(fromX)},${r(midY)} L${r(toX)},${r(midY)} L${r(toX)},${r(toY)}`;
  }
}
