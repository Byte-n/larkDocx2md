import type { WNode } from './types.js';
import { BORDER_WIDTH_MAP, r } from './utils.js';

// ─── Shape Path Registry ────────────────────────────────────────────────────

export type ShapePathFn = (w: number, h: number, sa: string, n: WNode) => string;

const registry = new Map<string, ShapePathFn>();

export function registerShapePath (types: string | string[], fn: ShapePathFn): void {
  const arr = Array.isArray(types) ? types : [types];
  for (const t of arr) registry.set(t, fn);
}

export function getShapePath (type: string): ShapePathFn | undefined {
  return registry.get(type);
}

// ─── Default shape (fallback) ───────────────────────────────────────────────

export const defaultShapePath: ShapePathFn = (w, h, sa) =>
  `<rect width="${w}" height="${h}" rx="4" ry="4" ${sa}/>`;

// ─── Register all built-in shapes ───────────────────────────────────────────

registerShapePath(
  ['rect', 'predefined_process', 'condition_shape', 'condition_shape2'],
  (w, h, sa) => `<rect width="${w}" height="${h}" ${sa}/>`,
);

registerShapePath(
  ['round_rect', 'flow_chart_round_rect', 'data_flow_round_rect', 'mind_node_round_rect'],
  (w, h, sa) => `<rect width="${w}" height="${h}" rx="8" ${sa}/>`,
);

registerShapePath(
  ['round_rect2', 'flow_chart_round_rect2', 'mind_node_full_round_rect'],
  (w, h, sa) => `<rect width="${w}" height="${h}" rx="${r(Math.min(w, h) / 2)}" ${sa}/>`,
);

registerShapePath(
  ['ellipse', 'data_flow_ellipse', 'state_start', 'state_end'],
  (w, h, sa) => `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${sa}/>`,
);

registerShapePath(
  ['diamond', 'flow_chart_diamond'],
  (w, h, sa) => `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" ${sa}/>`,
);

registerShapePath('triangle', (w, h, sa) =>
  `<polygon points="${w / 2},0 ${w},${h} 0,${h}" ${sa}/>`);

registerShapePath('right_triangle', (w, h, sa) =>
  `<polygon points="0,0 ${w},${h} 0,${h}" ${sa}/>`);

registerShapePath(['hexagon', 'flow_chart_hexagon'], (w, h, sa) => {
  const dx = w * 0.2;
  return `<polygon points="${dx},0 ${w - dx},0 ${w},${h / 2} ${w - dx},${h} ${dx},${h} 0,${h / 2}" ${sa}/>`;
});

registerShapePath('pentagon', (w, h, sa) => {
  const cx = w / 2, top = 0, bot = h;
  const midY = h * 0.38;
  return `<polygon points="${cx},${top} ${w},${midY} ${w * 0.82},${bot} ${w * 0.18},${bot} 0,${midY}" ${sa}/>`;
});

registerShapePath('octagon', (w, h, sa) => {
  const d = Math.min(w, h) * 0.29;
  return `<polygon points="${d},0 ${w - d},0 ${w},${d} ${w},${h - d} ${w - d},${h} ${d},${h} 0,${h - d} 0,${d}" ${sa}/>`;
});

registerShapePath('star', (w, h, sa) => renderStar(5, w, h, sa));
registerShapePath('star2', (w, h, sa) => renderStar(8, w, h, sa));
registerShapePath('star3', (w, h, sa) => renderStar(4, w, h, sa));
registerShapePath('star4', (w, h, sa) => renderStar(6, w, h, sa));

registerShapePath(['parallelogram', 'flow_chart_parallelogram'], (w, h, sa) => {
  const dx = w * 0.2;
  return `<polygon points="${dx},0 ${w},0 ${w - dx},${h} 0,${h}" ${sa}/>`;
});

registerShapePath(['trapezoid', 'flow_chart_trapezoid'], (w, h, sa) => {
  const dx = w * 0.2;
  return `<polygon points="${dx},0 ${w - dx},0 ${w},${h} 0,${h}" ${sa}/>`;
});

registerShapePath(['cylinder', 'flow_chart_cylinder', 'data_base'], (w, h, sa, n) => {
  const ry = h * 0.1;
  return [
    `<ellipse cx="${w / 2}" cy="${ry}" rx="${w / 2}" ry="${ry}" ${sa}/>`,
    `<rect x="0" y="${ry}" width="${w}" height="${h - 2 * ry}" ${sa} stroke="none"/>`,
    `<line x1="0" y1="${ry}" x2="0" y2="${h - ry}" stroke="${n.style?.border_color ?? '#333'}" stroke-width="${BORDER_WIDTH_MAP[n.style?.border_width ?? 'narrow'] ?? 1}"/>`,
    `<line x1="${w}" y1="${ry}" x2="${w}" y2="${h - ry}" stroke="${n.style?.border_color ?? '#333'}" stroke-width="${BORDER_WIDTH_MAP[n.style?.border_width ?? 'narrow'] ?? 1}"/>`,
    `<ellipse cx="${w / 2}" cy="${h - ry}" rx="${w / 2}" ry="${ry}" ${sa}/>`,
  ].join('\n');
});

registerShapePath('forward_arrow', (w, h, sa) => {
  const aw = w * 0.3, midY = h / 2, barH = h * 0.3;
  return `<polygon points="0,${midY - barH} ${w - aw},${midY - barH} ${w - aw},0 ${w},${midY} ${w - aw},${h} ${w - aw},${midY + barH} 0,${midY + barH}" ${sa}/>`;
});

registerShapePath('backward_arrow', (w, h, sa) => {
  const aw = w * 0.3, midY = h / 2, barH = h * 0.3;
  return `<polygon points="${w},${midY - barH} ${aw},${midY - barH} ${aw},0 0,${midY} ${aw},${h} ${aw},${midY + barH} ${w},${midY + barH}" ${sa}/>`;
});

registerShapePath('double_arrow', (w, h, sa) => {
  const aw = w * 0.2, midY = h / 2, barH = h * 0.25;
  return `<polygon points="${aw},${midY - barH} ${w - aw},${midY - barH} ${w - aw},0 ${w},${midY} ${w - aw},${h} ${w - aw},${midY + barH} ${aw},${midY + barH} ${aw},${h} 0,${midY} ${aw},0" ${sa}/>`;
});

registerShapePath('cross', (w, h, sa) => {
  const t = Math.min(w, h) * 0.33;
  const cx = w / 2, cy = h / 2;
  return `<polygon points="${cx - t / 2},0 ${cx + t / 2},0 ${cx + t / 2},${cy - t / 2} ${w},${cy - t / 2} ${w},${cy + t / 2} ${cx + t / 2},${cy + t / 2} ${cx + t / 2},${h} ${cx - t / 2},${h} ${cx - t / 2},${cy + t / 2} 0,${cy + t / 2} 0,${cy - t / 2} ${cx - t / 2},${cy - t / 2}" ${sa}/>`;
});

registerShapePath('cloud', (w, h, sa) =>
  `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${sa}/>`);

registerShapePath(['bubble', 'rect_bubble'], (w, h, sa, n) => {
  const type = n.composite_shape?.type ?? 'bubble';
  const tailH = h * 0.15;
  const bodyH = h - tailH;
  const rx = type === 'bubble' ? Math.min(w, bodyH) / 2 : 4;
  return [
    `<rect width="${w}" height="${bodyH}" rx="${rx}" ry="${rx}" ${sa}/>`,
    `<polygon points="${w * 0.2},${bodyH} ${w * 0.35},${h} ${w * 0.4},${bodyH}" ${sa}/>`,
  ].join('\n');
});

registerShapePath('actor', (w, h, sa, n) => {
  const headR = Math.min(w, h) * 0.15;
  const cx = w / 2;
  const headY = headR + 2;
  const bodyTop = headY + headR + 2;
  const bodyBot = h * 0.6;
  const legBot = h - 2;
  const strokeAttr = `stroke="${n.style?.border_color ?? '#333'}" stroke-width="${BORDER_WIDTH_MAP[n.style?.border_width ?? 'narrow'] ?? 1}" fill="none"`;
  return [
    `<circle cx="${cx}" cy="${headY}" r="${headR}" ${sa}/>`,
    `<line x1="${cx}" y1="${bodyTop}" x2="${cx}" y2="${bodyBot}" ${strokeAttr}/>`,
    `<line x1="${w * 0.15}" y1="${bodyTop + 10}" x2="${w * 0.85}" y2="${bodyTop + 10}" ${strokeAttr}/>`,
    `<line x1="${cx}" y1="${bodyBot}" x2="${w * 0.2}" y2="${legBot}" ${strokeAttr}/>`,
    `<line x1="${cx}" y1="${bodyBot}" x2="${w * 0.8}" y2="${legBot}" ${strokeAttr}/>`,
  ].join('\n');
});

registerShapePath('circular_ring', (w, h, sa, n) => {
  const outer = Math.min(w, h) / 2;
  const ratio = n.composite_shape?.circular_ring?.sector_ratio ?? 0.5;
  const inner = outer * (1 - ratio);
  return [
    `<circle cx="${w / 2}" cy="${h / 2}" r="${outer}" ${sa}/>`,
    `<circle cx="${w / 2}" cy="${h / 2}" r="${inner}" fill="white" stroke="none"/>`,
  ].join('\n');
});

registerShapePath('pie', (w, h, sa, n) => {
  const pie = n.composite_shape?.pie;
  if (!pie) return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${sa}/>`;
  const cx = w / 2, cy = h / 2;
  const radius = pie.radius || Math.min(w, h) / 2;
  const startA = ((pie.start_radial_line_angle ?? 0) * Math.PI) / 180;
  const endA = startA - ((pie.central_angle ?? 360) * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(startA);
  const y1 = cy + radius * Math.sin(startA);
  const x2 = cx + radius * Math.cos(endA);
  const y2 = cy + radius * Math.sin(endA);
  const largeArc = (pie.central_angle ?? 360) > 180 ? 1 : 0;
  return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 0 ${x2} ${y2} Z" ${sa}/>`;
});

registerShapePath('cube', (w, h, sa) => {
  const d = Math.min(w, h) * 0.2;
  return [
    `<polygon points="0,${d} ${w - d},${d} ${w - d},${h} 0,${h}" ${sa}/>`,
    `<polygon points="0,${d} ${d},0 ${w},0 ${w - d},${d}" ${sa}/>`,
    `<polygon points="${w - d},${d} ${w},0 ${w},${h - d} ${w - d},${h}" ${sa}/>`,
  ].join('\n');
});

registerShapePath('document_shape', (w, h, sa) => {
  const waveH = h * 0.1;
  return `<path d="M 0 0 L ${w} 0 L ${w} ${h - waveH} Q ${w * 0.75} ${h - 2 * waveH} ${w / 2} ${h - waveH} Q ${w * 0.25} ${h} 0 ${h - waveH} Z" ${sa}/>`;
});

registerShapePath('brace', (w, h, _sa, n) => {
  const midY = h / 2;
  return `<path d="M ${w} 0 Q ${w * 0.6} 0 ${w * 0.5} ${midY * 0.4} Q ${w * 0.4} ${midY} 0 ${midY} Q ${w * 0.4} ${midY} ${w * 0.5} ${midY + midY * 0.6} Q ${w * 0.6} ${h} ${w} ${h}" fill="none" stroke="${n.style?.border_color ?? '#333'}" stroke-width="${BORDER_WIDTH_MAP[n.style?.border_width ?? 'narrow'] ?? 1}"/>`;
});

registerShapePath('brace_reverse', (w, h, _sa, n) => {
  const midY = h / 2;
  return `<path d="M 0 0 Q ${w * 0.4} 0 ${w * 0.5} ${midY * 0.4} Q ${w * 0.6} ${midY} ${w} ${midY} Q ${w * 0.6} ${midY} ${w * 0.5} ${midY + midY * 0.6} Q ${w * 0.4} ${h} 0 ${h}" fill="none" stroke="${n.style?.border_color ?? '#333'}" stroke-width="${BORDER_WIDTH_MAP[n.style?.border_width ?? 'narrow'] ?? 1}"/>`;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function renderStar (points: number, w: number, h: number, sa: string): string {
  const cx = w / 2, cy = h / 2;
  const outerR = Math.min(w, h) / 2;
  const innerR = outerR * 0.4;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerR : innerR;
    pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return `<polygon points="${pts.join(' ')}" ${sa}/>`;
}
