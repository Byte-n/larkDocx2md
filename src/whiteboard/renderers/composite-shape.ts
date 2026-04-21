import type { NodeRenderer, RenderContext, WNode } from '../types.js';
import { gWrap, styleAttrs, transformAttr } from '../utils.js';
import { renderTextContent } from '../text.js';
import { defaultShapePath, getShapePath } from '../shape-paths.js';

// ─── Composite Shape Renderer ───────────────────────────────────────────────

export const compositeShapeRenderer: NodeRenderer = {
  type: 'composite_shape',
  render (n: WNode, ctx: RenderContext): string {
    const w = n.width ?? 100;
    const h = n.height ?? 60;
    const sa = styleAttrs(n.style);
    const tf = transformAttr(n);
    const shapeType = n.composite_shape?.type ?? 'rect';

    const pathFn = getShapePath(shapeType) ?? defaultShapePath;
    const shape = pathFn(w, h, sa, n);
    const text = renderTextContent(n.text, w, h);
    const children = ctx.renderChildren(n);

    return gWrap(tf, [shape, text, children], n, ctx.referencedIds, `data-shape="${shapeType}"`);
  },
};
