// ─── 块级节点 ───────────────────────────────────────────────────────────────

export type MdBlockNode =
  | { type: 'page'; title: MdInlineNode[]; children: MdBlockNode[] }
  | { type: 'heading'; level: number; children: MdInlineNode[] }
  | { type: 'paragraph'; children: MdInlineNode[] }
  | { type: 'bullet'; text: MdInlineNode[]; children: MdBlockNode[] }
  | { type: 'ordered'; order: number; text: MdInlineNode[]; children: MdBlockNode[] }
  | { type: 'codeBlock'; lang: string; content: string }
  | { type: 'todo'; checked: boolean; text: MdInlineNode[] }
  | { type: 'callout'; children: MdBlockNode[] }
  | { type: 'quote'; children: MdBlockNode[] }
  | { type: 'divider' }
  | { type: 'image'; alt: string; src: string }
  | { type: 'whiteboard'; token: string }
  | { type: 'table'; rows: MdTableRow[] }
  | { type: 'grid'; children: MdBlockNode[] }
  | { type: 'html'; content: string };

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
