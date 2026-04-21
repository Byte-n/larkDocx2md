import { Registry } from '../core/registry.js';
import type { MdBlockNode, MdInlineNode } from './types.js';

export interface NodeSerializer {
  type: string;

  serialize (node: MdBlockNode, ctx: SerializeContext): string;
}

export interface SerializeContext {
  serialize (node: MdBlockNode, indent?: number): string;

  serializeInline (nodes: MdInlineNode[]): string;
}

export class MdSerializer {
  private registry = new Registry<string, NodeSerializer>();

  register (serializer: NodeSerializer): void {
    this.registry.register(serializer.type, serializer);
  }

  serialize (root: MdBlockNode): string {
    const ctx: SerializeContext = {
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
    let buf = '<table>\n';
    for (const row of node.rows) {
      buf += '<tr>\n';
      for (const cell of row.cells) {
        let attrs = '';
        if (cell.rowSpan && cell.rowSpan > 1) attrs += ` rowspan="${cell.rowSpan}"`;
        if (cell.colSpan && cell.colSpan > 1) attrs += ` colspan="${cell.colSpan}"`;
        const content = ctx.serializeInline(cell.content);
        buf += `<td${attrs}>${content}</td>`;
      }
      buf += '</tr>\n';
    }
    buf += '</table>\n';
    return buf;
  },
};

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
}
