import type { WhiteboardNode } from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WNode = WhiteboardNode;
export type WStyle = NonNullable<WNode['style']>;
export type WText = NonNullable<WNode['text']>;
export type WRichText = NonNullable<WText['rich_text']>;
export type WParagraph = NonNullable<WRichText['paragraphs']>[number];
export type WElement = NonNullable<WParagraph['elements']>[number];
export type WConnector = NonNullable<WNode['connector']>;
export type WTable = NonNullable<WNode['table']>;
export type WPaint = NonNullable<WNode['paint']>;

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ─── Render Context ─────────────────────────────────────────────────────────

export interface RenderContext {
  readonly nodeMap: ReadonlyMap<string, WNode>;
  readonly usedMarkers: Set<string>;
  readonly mindMapChildrenMap: ReadonlyMap<string, string[]>;
  readonly referencedIds: ReadonlySet<string>;

  renderNode (node: WNode): string;

  renderChildren (node: WNode): string;
}

// ─── Node Renderer ──────────────────────────────────────────────────────────

export interface NodeRenderer {
  readonly type: string;

  render (node: WNode, ctx: RenderContext): string;
}
