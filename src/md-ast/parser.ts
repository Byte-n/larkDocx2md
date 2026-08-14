import { Registry } from '../core/registry.js';
import { createLogger } from '../lib/logger.js';
import type { DocInfo, DocxBlock, TextBody, TextElement } from '../lib/types.js';
import type { MdBlockNode, MdInlineNode } from './types.js';

const logger = createLogger('parser');

export interface BlockParser {
  blockType: number;

  /** 容器型 parser（page/bullet/ordered/callout/quoteContainer/grid/table）自行消费 block.children，
   *  置为 true；叶子型 parser 省略（false），由 Parser 框架统一解析 block.children 挂到 node.blocks。 */
  consumesChildren?: boolean;

  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode | null;
}

export interface ParserContext {
  blockMap: Map<string, DocxBlock>;

  parseBlock (block: DocxBlock): MdBlockNode | null;

  parseText (body: TextBody): MdInlineNode[];

  parseInline (e: TextElement): MdInlineNode[];

  parseChildren (block: DocxBlock): MdBlockNode[];
}

export class Parser {
  private registry = new Registry<number, BlockParser>();

  register (parser: BlockParser): void {
    this.registry.register(parser.blockType, parser);
  }

  parse (doc: DocInfo, blocks: DocxBlock[]): MdBlockNode {
    const blockMap = new Map<string, DocxBlock>();
    for (const b of blocks) {
      if (b.block_id) blockMap.set(b.block_id, b);
    }

    const ctx: ParserContext = {
      blockMap,
      parseBlock: (block: DocxBlock): MdBlockNode | null => {
        const bt = block.block_type;
        if (bt === undefined || bt === null) {
          logger.warn(`Dropped block ${block.block_id}: missing block_type`);
          return null;
        }
        const parser = this.registry.get(bt);
        if (!parser) {
          // 未注册的块类型（如 Bitable/File/Mindnote/Iframe/Diagram 等）：
          // 回退为文案（尽量提取文本），并保留其嵌套子块——飞书任意块都可能挂 children，
          // 若直接丢弃会把整棵子树一起丢掉。
          const text = extractBlockText(block);
          const hasChildren = (block.children?.length ?? 0) > 0;
          if (!text && !hasChildren) {
            // GridColumn(25) 由 Grid parser 内部处理；此处为既无文本也无子块的未支持块
            logger.warn(`Dropped block ${block.block_id}: no parser for block_type=${bt} and no text/children (parent=${block.parent_id ?? '-'}) — ${previewBlock(block)}`);
            return null;
          }
          logger.warn(`Fallback for block ${block.block_id}: no parser for block_type=${bt} (parent=${block.parent_id ?? '-'}) — rendered as paragraph; ${previewBlock(block)}`);
          const node: MdBlockNode = {
            type: 'paragraph',
            children: text ? [{ type: 'text', content: text }] : [],
          };
          if (hasChildren) {
            const nested = ctx.parseChildren(block);
            if (nested.length > 0) node.blocks = nested;
          }
          return node;
        }
        const node = parser.parse(block, ctx);
        if (!node) {
          logger.warn(`Dropped block ${block.block_id}: parser(block_type=${bt}) returned null — ${previewBlock(block)}`);
          return null;
        }
        // 框架统一处理：叶子型块（未自行消费 children）若携带嵌套子块，挂到 node.blocks，
        // 序列化时在节点自身内容之后渲染（飞书大纲/折叠等场景下，任意块都可能嵌套内容）。
        if (!parser.consumesChildren && (block.children?.length ?? 0) > 0) {
          const nested = ctx.parseChildren(block);
          if (nested.length > 0) node.blocks = nested;
        }
        return node;
      },
      parseText: (body: TextBody): MdInlineNode[] => {
        const inline = body.elements.length > 1;
        return body.elements.flatMap(e => parseElement(e, inline));
      },
      parseInline: (e: TextElement): MdInlineNode[] => {
        return parseElement(e, true);
      },
      parseChildren: (block: DocxBlock): MdBlockNode[] => {
        const children: MdBlockNode[] = [];
        for (const id of block.children ?? []) {
          const child = blockMap.get(id);
          if (!child) {
            logger.warn(`Missing child block ${id} (parent=${block.block_id}, parent_type=${block.block_type}); referenced but absent from blockMap — expected under --filter-title, otherwise signals a pagination gap or API omission`);
            continue;
          }
          const node = ctx.parseBlock(child);
          if (node) children.push(node);
        }
        return children;
      },
    };

    const entry = blockMap.get(doc.documentId);
    if (entry) {
      const node = ctx.parseBlock(entry);
      if (node) return node;
    }

    // Fallback: create a page node with all root-level blocks
    const rootBlocks = blocks.filter(b => !b.parent_id);
    return {
      type: 'page',
      title: [],
      children: rootBlocks.map(b => ctx.parseBlock(b)).filter((n): n is MdBlockNode => n !== null),
    };
  }
}

function parseElement (e: TextElement, inline: boolean): MdInlineNode[] {
  if (e.text_run) {
    return [parseTextRun(e.text_run)];
  }
  if (e.mention_user) {
    return [{ type: 'mentionUser', userId: e.mention_user.user_id }];
  }
  if (e.mention_doc) {
    const url = e.mention_doc.url ? decodeURIComponent(e.mention_doc.url) : '';
    return [{ type: 'mentionDoc', title: e.mention_doc.title ?? '', url }];
  }
  if (e.equation) {
    return [{ type: 'equation', content: e.equation.content.replace(/\n$/, ''), inline }];
  }
  return [];
}

function parseTextRun (tr: NonNullable<TextElement['text_run']>): MdInlineNode {
  const s = tr.text_element_style;

  // 基础节点：inline_code 作为叶子节点替代 text，其他样式在其外层逐层包裹
  let node: MdInlineNode = s?.inline_code
    ? { type: 'inlineCode', content: tr.content }
    : { type: 'text', content: tr.content };

  if (!s) return node;

  // 自内向外逐层包裹，以支持多样式叠加（例如：粗斜体、粗体链接、带下划线的删除线等）
  // 包裹顺序：link → underline → strikethrough → italic → bold
  // bold 放在最外层以兼容更多 Markdown 渲染器的嵌套解析
  if (s.link) {
    node = { type: 'link', url: decodeURIComponent(s.link.url), children: [node] };
  }
  if (s.underline) {
    node = { type: 'underline', children: [node] };
  }
  if (s.strikethrough) {
    node = { type: 'strikethrough', children: [node] };
  }
  if (s.italic) {
    node = { type: 'italic', children: [node] };
  }
  if (s.bold) {
    node = { type: 'bold', children: [node] };
  }

  return node;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/** 提取块的文本预览，便于在日志中定位被丢弃的内容 */
function previewBlock (block: DocxBlock): string {
  const text = extractBlockText(block);
  if (text) return `text="${text.slice(0, 80)}"`;
  return `raw=${JSON.stringify(block).slice(0, 120)}`;
}

const BLOCK_TEXT_FIELDS = ['text', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6', 'heading7', 'heading8', 'heading9', 'bullet', 'ordered', 'code', 'quote', 'equation', 'todo', 'callout'];

function extractBlockText (block: DocxBlock): string {
  for (const f of BLOCK_TEXT_FIELDS) {
    const t = extractBodyText((block as Record<string, unknown>)[f]);
    if (t) return t;
  }
  return '';
}

function extractBodyText (body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const elements = (body as { elements?: unknown[] }).elements;
  if (!Array.isArray(elements)) return '';
  return elements
    .map((el) => {
      if (el && typeof el === 'object' && 'text_run' in el) {
        const c = (el as { text_run?: { content?: string } }).text_run?.content;
        if (c) return c;
      }
      return '';
    })
    .join('');
}
