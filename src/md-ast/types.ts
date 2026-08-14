import type { ResolvedSheet } from '../sheet/index.js';

// ─── 块级节点 ───────────────────────────────────────────────────────────────

/** 任意块节点都可能携带「未被自身 parser 消费的嵌套子块」，对应飞书大纲/折叠等场景下
 *  叶子块所嵌套的内容；序列化时在节点自身内容之后渲染。 */
interface NestedBlocks { blocks?: MdBlockNode[] }

export type MdBlockNode =
  | ({ type: 'page'; title: MdInlineNode[]; children: MdBlockNode[] } & NestedBlocks)
  | ({ type: 'heading'; level: number; children: MdInlineNode[] } & NestedBlocks)
  | ({ type: 'paragraph'; children: MdInlineNode[] } & NestedBlocks)
  | ({ type: 'bullet'; text: MdInlineNode[]; children: MdBlockNode[] } & NestedBlocks)
  | ({ type: 'ordered'; order: number; text: MdInlineNode[]; children: MdBlockNode[] } & NestedBlocks)
  | ({ type: 'codeBlock'; lang: string; content: string } & NestedBlocks)
  | ({ type: 'todo'; checked: boolean; text: MdInlineNode[] } & NestedBlocks)
  | ({ type: 'callout'; children: MdBlockNode[] } & NestedBlocks)
  | ({ type: 'quote'; children: MdBlockNode[] } & NestedBlocks)
  | ({ type: 'divider' } & NestedBlocks)
  | ({ type: 'image'; alt: string; src: string } & NestedBlocks)
  | ({ type: 'whiteboard'; token: string } & NestedBlocks)
  | ({ type: 'sheet'; token: string } & NestedBlocks)
  | ({ type: 'sheetResolved'; title: string; sheets: ResolvedSheet[] } & NestedBlocks)
  | ({ type: 'table'; rows: MdTableRow[] } & NestedBlocks)
  | ({ type: 'grid'; children: MdBlockNode[] } & NestedBlocks)
  | ({ type: 'html'; content: string } & NestedBlocks);

export type MdTableRow = { cells: MdTableCell[] };
export type MdTableCell = { content: MdInlineNode[]; rowSpan?: number; colSpan?: number };

// ─── 行内节点 ───────────────────────────────────────────────────────────────

export type MdInlineNode =
  | { type: 'text'; content: string }
  | { type: 'bold'; children: MdInlineNode[] }
  | { type: 'italic'; children: MdInlineNode[] }
  | { type: 'strikethrough'; children: MdInlineNode[] }
  | { type: 'underline'; children: MdInlineNode[] }
  | { type: 'inlineCode'; content: string }
  | { type: 'link'; url: string; children: MdInlineNode[] }
  | { type: 'mentionUser'; userId: string }
  | { type: 'mentionDoc'; title: string; url: string }
  | { type: 'equation'; content: string; inline: boolean };
