import type { RenderContext, WNode } from './types.js';
import { getRenderer } from './node-renderer.js';
import { gWrap, styleAttrs, transformAttr } from './utils.js';
import { renderTextContent } from './text.js';

// ─── Default Render Context ─────────────────────────────────────────────────

export class DefaultRenderContext implements RenderContext {
  readonly nodeMap: ReadonlyMap<string, WNode>;
  readonly usedMarkers: Set<string>;
  readonly mindMapChildrenMap: ReadonlyMap<string, string[]>;
  readonly referencedIds: ReadonlySet<string>;

  constructor (opts: {
    nodeMap: Map<string, WNode>;
    usedMarkers: Set<string>;
    mindMapChildrenMap: Map<string, string[]>;
    referencedIds: Set<string>;
  }) {
    this.nodeMap = opts.nodeMap;
    this.usedMarkers = opts.usedMarkers;
    this.mindMapChildrenMap = opts.mindMapChildrenMap;
    this.referencedIds = opts.referencedIds;
  }

  renderNode (node: WNode): string {
    const renderer = getRenderer(node.type);
    if (renderer) return renderer.render(node, this);
    return this.renderFallback(node);
  }

  renderChildren (node: WNode): string {
    if (!node.children?.length) return '';
    return node.children
      .map(id => {
        const child = this.nodeMap.get(id);
        return child ? this.renderNode(child) : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private renderFallback (n: WNode): string {
    const w = n.width ?? 80;
    const h = n.height ?? 40;
    const tf = transformAttr(n);
    const sa = styleAttrs(n.style);
    const text = renderTextContent(n.text, w, h);
    const children = this.renderChildren(n);
    return gWrap(tf, [`<rect width="${w}" height="${h}" ${sa} rx="2"/>`, text, children], n, this.referencedIds, undefined);
  }
}
