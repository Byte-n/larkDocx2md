import { Registry } from '../core/registry.js';
import { escapeCell, renderMarkdownTable } from '../sheet/index.js';
import type { DocSourceType } from './transformer.js';
import type { MdBlockNode, MdInlineNode, MdTableRow } from './types.js';

export interface NodeSerializer {
  type: string;

  serialize (node: MdBlockNode, ctx: SerializeContext): string;
}

export interface SerializeOptions {
  sourceType?: DocSourceType;
}

export interface SerializeContext {
  sourceType: DocSourceType;

  serialize (node: MdBlockNode, indent?: number): string;

  serializeInline (nodes: MdInlineNode[]): string;
}

export class MdSerializer {
  private registry = new Registry<string, NodeSerializer>();

  register (serializer: NodeSerializer): void {
    this.registry.register(serializer.type, serializer);
  }

  serialize (root: MdBlockNode, options: SerializeOptions = {}): string {
    const ctx: SerializeContext = {
      sourceType: options.sourceType ?? 'docx',
      serialize: (node: MdBlockNode, indent = 0): string => {
        const serializer = this.registry.get(node.type);
        if (serializer) {
          return serializer.serialize(node, ctx);
        }
        return '';
      },
      serializeInline: (nodes: MdInlineNode[]): string => {
        return nodes.map(n => serializeInlineNode(n)).join('');
      },
    };
    return ctx.serialize(root);
  }
}

function serializeInlineNode (node: MdInlineNode): string {
  switch (node.type) {
    case 'text':
      return node.content;
    case 'bold':
      return `**${node.children.map(serializeInlineNode).join('')}**`;
    case 'italic':
      return `_${node.children.map(serializeInlineNode).join('')}_`;
    case 'strikethrough':
      return `~~${node.children.map(serializeInlineNode).join('')}~~`;
    case 'underline':
      return `<u>${node.children.map(serializeInlineNode).join('')}</u>`;
    case 'inlineCode':
      return `\`${node.content}\``;
    case 'link':
      return `[${node.children.map(serializeInlineNode).join('')}](${node.url})`;
    case 'mentionUser':
      return node.userId;
    case 'mentionDoc':
      return `[${node.title}](${node.url})`;
    case 'equation':
      return node.inline ? `$${node.content}$` : `$$${node.content}$$`;
    default:
      return '';
  }
}

// ─── Built-in Serializers ───────────────────────────────────────────────────

const pageSerializer: NodeSerializer = {
  type: 'page',
  serialize (node, ctx) {
    if (node.type !== 'page') return '';
    const title = ctx.serializeInline(node.title);
    let s = title ? `# ${title}\n\n` : '';
    s += node.children.map(child => ctx.serialize(child)).join('');
    return s;
  },
};

const headingSerializer: NodeSerializer = {
  type: 'heading',
  serialize (node, ctx) {
    if (node.type !== 'heading') return '';
    return `${'#'.repeat(node.level)} ${ctx.serializeInline(node.children)}\n\n`;
  },
};

const paragraphSerializer: NodeSerializer = {
  type: 'paragraph',
  serialize (node, ctx) {
    if (node.type !== 'paragraph') return '';
    return `${ctx.serializeInline(node.children)}\n\n`;
  },
};

const bulletSerializer: NodeSerializer = {
  type: 'bullet',
  serialize (node, ctx) {
    if (node.type !== 'bullet') return '';
    let s = `- ${ctx.serializeInline(node.text)}\n`;
    for (const child of node.children) {
      const childStr = ctx.serialize(child);
      if (childStr) {
        s += childStr.split('\n').map((line, i, arr) => {
          if (!line && i === arr.length - 1) return '';
          return `\t${line}`;
        }).join('\n');
      }
    }
    return s;
  },
};

const orderedSerializer: NodeSerializer = {
  type: 'ordered',
  serialize (node, ctx) {
    if (node.type !== 'ordered') return '';
    let s = `${node.order}. ${ctx.serializeInline(node.text)}\n`;
    for (const child of node.children) {
      const childStr = ctx.serialize(child);
      if (childStr) {
        s += childStr.split('\n').map((line, i, arr) => {
          if (!line && i === arr.length - 1) return '';
          return `\t${line}`;
        }).join('\n');
      }
    }
    return s;
  },
};

const codeBlockSerializer: NodeSerializer = {
  type: 'codeBlock',
  serialize (node) {
    if (node.type !== 'codeBlock') return '';
    return `\`\`\`${node.lang}
${node.content}
\`\`\`

`;
  },
};

const todoSerializer: NodeSerializer = {
  type: 'todo',
  serialize (node, ctx) {
    if (node.type !== 'todo') return '';
    const checked = node.checked ? 'x' : ' ';
    return `- [${checked}] ${ctx.serializeInline(node.text)}\n`;
  },
};

const calloutSerializer: NodeSerializer = {
  type: 'callout',
  serialize (node, ctx) {
    if (node.type !== 'callout') return '';
    let s = '>[!TIP]\n';
    for (const child of node.children) {
      const childStr = ctx.serialize(child);
      if (childStr) {
        s += childStr.split('\n').map((line, i, arr) => {
          if (!line && i === arr.length - 1) return '';
          return `> ${line}`;
        }).join('\n');
      }
    }
    return s;
  },
};

const quoteSerializer: NodeSerializer = {
  type: 'quote',
  serialize (node, ctx) {
    if (node.type !== 'quote') return '';
    let s = '';
    for (const child of node.children) {
      const childStr = ctx.serialize(child);
      if (childStr) {
        s += childStr.split('\n').map((line, i, arr) => {
          if (!line && i === arr.length - 1) return '';
          return `> ${line}`;
        }).join('\n');
      }
    }
    return s;
  },
};

const dividerSerializer: NodeSerializer = {
  type: 'divider',
  serialize () {
    return '---\n\n';
  },
};

const imageSerializer: NodeSerializer = {
  type: 'image',
  serialize (node) {
    if (node.type !== 'image') return '';
    return `![${node.alt}](${node.src})\n`;
  },
};

const whiteboardSerializer: NodeSerializer = {
  type: 'whiteboard',
  serialize (node) {
    if (node.type !== 'whiteboard') return '';
    return `![画板-${node.token}](${node.token}.svg)\n`;
  },
};

const tableSerializer: NodeSerializer = {
  type: 'table',
  serialize (node, ctx) {
    if (node.type !== 'table') return '';
    const grid = rebuildGrid(node.rows, ctx);
    return renderMarkdownTable(grid);
  },
};

/**
 * 基于 parser 产出的稀疏 rows（被合并覆盖的格已被过滤，顶格包含 rowSpan/colSpan）
 * 还原为稠密二维字符串网格：Markdown 不支持合并，按"复制左上角值"展开。
 */
function rebuildGrid (rows: MdTableRow[], ctx: SerializeContext): string[][] {
  const occupied = new Set<string>();
  const grid: string[][] = [];
  for (let r = 0; r < rows.length; r++) {
    if (!grid[r]) grid[r] = [];
    let c = 0;
    for (const cell of rows[r]!.cells) {
      while (occupied.has(`${r}-${c}`)) c++;
      const raw = ctx.serializeInline(cell.content);
      const value = escapeCell(raw);
      const rs = cell.rowSpan ?? 1;
      const cs = cell.colSpan ?? 1;
      for (let rr = r; rr < r + rs; rr++) {
        if (!grid[rr]) grid[rr] = [];
        for (let cc = c; cc < c + cs; cc++) {
          grid[rr]![cc] = value;
          if (rr !== r || cc !== c) occupied.add(`${rr}-${cc}`);
        }
      }
      c += cs;
    }
  }
  // 补齐列宽：避免稀疏数组导致 join 出 undefined
  const maxCols = grid.reduce((m, row) => Math.max(m, row.length), 0);
  for (const row of grid) {
    for (let i = 0; i < maxCols; i++) {
      if (row[i] === undefined) row[i] = '';
    }
  }
  return grid;
}

const gridSerializer: NodeSerializer = {
  type: 'grid',
  serialize (node, ctx) {
    if (node.type !== 'grid') return '';
    return node.children.map(child => ctx.serialize(child)).join('');
  },
};

const htmlSerializer: NodeSerializer = {
  type: 'html',
  serialize (node) {
    if (node.type !== 'html') return '';
    return node.content;
  },
};

const sheetResolvedSerializer: NodeSerializer = {
  type: 'sheetResolved',
  serialize (node, ctx) {
    if (node.type !== 'sheetResolved') return '';
    let out = '';
    for (const s of node.sheets) {
      if (ctx.sourceType === 'sheet') {
        out += `## ${node.title}-${s.title}\n\n`;
      }
      if (s.error) { out += `> ${s.error}\n\n`; continue; }
      out += renderMarkdownTable(s.rows);
    }
    return out;
  },
};

export function registerBuiltinSerializers (serializer: MdSerializer): void {
  serializer.register(pageSerializer);
  serializer.register(headingSerializer);
  serializer.register(paragraphSerializer);
  serializer.register(bulletSerializer);
  serializer.register(orderedSerializer);
  serializer.register(codeBlockSerializer);
  serializer.register(todoSerializer);
  serializer.register(calloutSerializer);
  serializer.register(quoteSerializer);
  serializer.register(dividerSerializer);
  serializer.register(imageSerializer);
  serializer.register(whiteboardSerializer);
  serializer.register(tableSerializer);
  serializer.register(gridSerializer);
  serializer.register(htmlSerializer);
  serializer.register(sheetResolvedSerializer);
}
