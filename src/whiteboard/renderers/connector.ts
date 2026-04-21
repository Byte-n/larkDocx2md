import type { NodeRenderer, RenderContext, WConnector, WNode } from '../types.js';
import { BORDER_WIDTH_MAP, DASH_ARRAY_MAP, esc, r } from '../utils.js';
import { arrowMarkerRef } from '../defs.js';

// ─── Connector Renderer ─────────────────────────────────────────────────────

export const connectorRenderer: NodeRenderer = {
  type: 'connector',
  render (n: WNode, ctx: RenderContext): string {
    const conn = n.connector;
    if (!conn) return '';
    const pts = resolveConnectorPoints(conn, ctx.nodeMap, n);
    if (pts.length < 2) return '';

    const strokeColor = n.style?.border_color ?? '#333';
    const sw = BORDER_WIDTH_MAP[n.style?.border_width ?? 'narrow'] ?? 1;
    const dash = n.style?.border_style ? DASH_ARRAY_MAP[n.style.border_style] ?? '' : '';
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';

    const startMarker = arrowMarkerRef(conn.start?.arrow_style, ctx.usedMarkers);
    const endMarker = arrowMarkerRef(conn.end?.arrow_style, ctx.usedMarkers);
    const markerStart = startMarker ? ` marker-start="${startMarker}"` : '';
    const markerEnd = endMarker ? ` marker-end="${endMarker}"` : '';

    const shape = conn.shape ?? 'straight';
    let pathD: string;

    if (shape === 'curve' && pts.length >= 2) {
      pathD = buildCurvePath(pts);
    } else {
      pathD = `M ${pts.map(p => `${r(p.x)} ${r(p.y)}`).join(' L ')}`;
    }

    const fromId = conn.start?.attached_object?.id ?? conn.start_object?.id ?? '';
    const toId = conn.end?.attached_object?.id ?? conn.end_object?.id ?? '';
    const dataAttrs = `${n.id ? ` data-id="${n.id}"` : ''} data-connector-shape="${shape}"${fromId ? ` data-from="${fromId}"` : ''}${toId ? ` data-to="${toId}"` : ''}`;

    const swAttr = sw !== 1 ? ` stroke-width="${sw}"` : '';
    const pathEl = `<path d="${pathD}" fill="none" stroke="${strokeColor}"${swAttr}${dashAttr}${markerStart}${markerEnd}/>`;

    const captions: string[] = [];
    if (conn.captions?.data?.length) {
      const mid = pts.length >= 2
        ? { x: (pts[0]!.x + pts[pts.length - 1]!.x) / 2, y: (pts[0]!.y + pts[pts.length - 1]!.y) / 2 }
        : pts[0]!;
      for (const caption of conn.captions.data) {
        if (caption?.text) {
          const fontSize = caption.font_size ?? 12;
          const color = caption.text_color ?? '#333';
          captions.push(`<text x="${r(mid.x)}" y="${r(mid.y - 6)}" font-size="${fontSize}" fill="${color}" text-anchor="middle">${esc(caption.text)}</text>`);
        }
      }
    }

    const inner = [pathEl, ...captions].join('\n');
    return `<g${dataAttrs}>\n${inner}\n</g>`;
  },
};

// ─── Connector Point Resolution ─────────────────────────────────────────────

export function resolveConnectorPoints (conn: WConnector, nodeMap: ReadonlyMap<string, WNode>, connNode?: WNode): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];

  const resolveEnd = (
    end: WConnector['start'] | WConnector['end'],
    endObj: WConnector['start_object'] | WConnector['end_object'],
  ) => {
    if (end?.attached_object?.id) {
      const target = nodeMap.get(end.attached_object.id);
      if (target && target.x != null && target.y != null) {
        const relPos = end.attached_object.position;
        const px = (relPos?.x ?? 0.5) * (target.width ?? 0);
        const py = (relPos?.y ?? 0.5) * (target.height ?? 0);
        return { x: target.x + px, y: target.y + py };
      }
    }
    if (end?.position) {
      return { x: end.position.x ?? 0, y: end.position.y ?? 0 };
    }
    if (endObj?.id) {
      const target = nodeMap.get(endObj.id);
      if (target && target.x != null && target.y != null) {
        const relPos = endObj.position;
        const px = (relPos?.x ?? 0.5) * (target.width ?? 0);
        const py = (relPos?.y ?? 0.5) * (target.height ?? 0);
        return { x: target.x + px, y: target.y + py };
      }
    }
    return null;
  };

  const start = resolveEnd(conn.start, conn.start_object);
  const end = resolveEnd(conn.end, conn.end_object);
  if (start) pts.push(start);
  if (conn.turning_points) {
    const ox = connNode?.x ?? 0;
    const oy = connNode?.y ?? 0;
    for (const tp of conn.turning_points) {
      if (tp.x != null && tp.y != null) pts.push({ x: ox + tp.x, y: oy + tp.y });
    }
  }
  if (end) pts.push(end);
  return pts;
}

// ─── Curve Path Builder ─────────────────────────────────────────────────────

function buildCurvePath (pts: { x: number; y: number }[]): string {
  if (pts.length === 2) {
    const dx = (pts[1]!.x - pts[0]!.x) / 3;
    return `M ${pts[0]!.x} ${pts[0]!.y} C ${pts[0]!.x + dx} ${pts[0]!.y} ${pts[1]!.x - dx} ${pts[1]!.y} ${pts[1]!.x} ${pts[1]!.y}`;
  }
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const mx = (prev.x + cur.x) / 2;
    const my = (prev.y + cur.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` T ${last.x} ${last.y}`;
  return d;
}
