import type { NodeRenderer, RenderContext, WNode } from '../types.js';
import { esc, gWrap, nodeDataAttrs, r, styleAttrs, transformAttr } from '../utils.js';
import { renderTextContent } from '../text.js';

// ─── Text Shape ─────────────────────────────────────────────────────────────

export const textShapeRenderer: NodeRenderer = {
  type: 'text_shape',
  render (n: WNode, ctx: RenderContext): string {
    const w = n.width ?? 100;
    const h = n.height ?? 40;
    const tf = transformAttr(n);
    const text = renderTextContent(n.text, w, h);
    return gWrap(tf, [text], n, ctx.referencedIds);
  },
};

// ─── Image ──────────────────────────────────────────────────────────────────

export const imageRenderer: NodeRenderer = {
  type: 'image',
  render (n: WNode, ctx: RenderContext): string {
    const w = n.width ?? 100;
    const h = n.height ?? 100;
    const tf = transformAttr(n);
    const token = n.image?.token ?? '';
    const sa = styleAttrs(n.style);
    const da = nodeDataAttrs(n, ctx.referencedIds);
    return `<g${tf}${da}><rect width="${w}" height="${h}" ${sa} rx="2"/><image href="${token}" width="${w}" height="${h}"/></g>`;
  },
};

// ─── Group ──────────────────────────────────────────────────────────────────

export const groupRenderer: NodeRenderer = {
  type: 'group',
  render (n: WNode, ctx: RenderContext): string {
    const children = ctx.renderChildren(n);
    return gWrap('', [children], n, ctx.referencedIds);
  },
};

// ─── Sticky Note ────────────────────────────────────────────────────────────

export const stickyNoteRenderer: NodeRenderer = {
  type: 'sticky_note',
  render (n: WNode, ctx: RenderContext): string {
    const w = n.width ?? 120;
    const h = n.height ?? 120;
    const tf = transformAttr(n);
    const bgColor = n.style?.fill_color ?? '#FFF9B1';
    const sa = `fill="${bgColor}" stroke="${n.style?.border_color ?? '#E6D F6C'}"`;
    const text = renderTextContent(n.text, w, h);
    return gWrap(tf, [`<rect width="${w}" height="${h}" rx="4" ${sa}/>`, text], n, ctx.referencedIds);
  },
};

// ─── Section ────────────────────────────────────────────────────────────────

export const sectionRenderer: NodeRenderer = {
  type: 'section',
  render (n: WNode, ctx: RenderContext): string {
    const w = n.width ?? 200;
    const h = n.height ?? 150;
    const tf = transformAttr(n);
    const sa = styleAttrs(n.style);
    const title = n.section?.title ?? '';
    const children = ctx.renderChildren(n);
    const sectionAttrs = title ? `data-title="${esc(title)}"` : '';
    return gWrap(tf, [
      `<rect width="${w}" height="${h}" ${sa}/>`,
      title ? `<text x="8" y="18" font-size="14" fill="#333" font-weight="bold">${esc(title)}</text>` : '',
      children,
    ], n, ctx.referencedIds, sectionAttrs);
  },
};

// ─── Paint ──────────────────────────────────────────────────────────────────

export const paintRenderer: NodeRenderer = {
  type: 'paint',
  render (n: WNode): string {
    const paint = n.paint;
    if (!paint?.lines?.length) return '';
    const ox = n.x ?? 0;
    const oy = n.y ?? 0;
    const color = paint.color ?? '#333';
    const sw = paint.width ?? 2;
    const da = n.id ? ` data-id="${n.id}"` : '';
    const paintType = paint.type ?? 'marker';
    const opAttr = paintType === 'highlight' ? ' stroke-opacity="0.4"' : '';

    if (paint.lines.length === 1) {
      const p = paint.lines[0];
      const cx = r(ox + (p!.x ?? 0));
      const cy = r(oy + (p!.y ?? 0));
      const radius = r(sw / 2);
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"${opAttr} data-type="paint" data-paint-type="${paintType}"${da}/>`;
    }

    const pts = paint.lines.map(p => `${r(ox + (p.x ?? 0))},${r(oy + (p.y ?? 0))}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}"${opAttr} stroke-linecap="round" stroke-linejoin="round" data-type="paint" data-paint-type="${paintType}"${da}/>`;
  },
};

// ─── SVG Node ───────────────────────────────────────────────────────────────

export const svgNodeRenderer: NodeRenderer = {
  type: 'svg',
  render (n: WNode, ctx: RenderContext): string {
    const tf = transformAttr(n);
    const code = n.svg?.svg_code ?? '';
    if (!code) return '';
    const w = n.width;
    const h = n.height;
    let adjusted = code;
    if (w != null && h != null) {
      adjusted = adjusted.replace(
        /(<svg\b[^>]*?)\s*width=["'][^"']*["']/i,
        `$1 width="${w}"`,
      );
      adjusted = adjusted.replace(
        /(<svg\b[^>]*?)\s*height=["'][^"']*["']/i,
        `$1 height="${h}"`,
      );
      if (!/viewBox/i.test(adjusted)) {
        const origW = code.match(/\bwidth=["']([\d.]+)["']/i);
        const origH = code.match(/\bheight=["']([\d.]+)["']/i);
        if (origW && origH) {
          adjusted = adjusted.replace(
            /(<svg\b)/i,
            `$1 viewBox="0 0 ${origW[1]} ${origH[1]}"`,
          );
        }
      }
    }
    return gWrap(tf, [adjusted], n, ctx.referencedIds);
  },
};
