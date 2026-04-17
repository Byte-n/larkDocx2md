import type { DocInfo, DocxBlock, TextBody, TextElement } from './client.js';

const BlockType = {
  Page: 1, Text: 2,
  Heading1: 3, Heading2: 4, Heading3: 5, Heading4: 6, Heading5: 7, Heading6: 8,
  Heading7: 9, Heading8: 10, Heading9: 11,
  Bullet: 12, Ordered: 13, Code: 14, Quote: 15, Equation: 16, Todo: 17,
  Callout: 19, Divider: 22, Grid: 24, GridColumn: 25, Image: 27,
  Table: 31, TableCell: 32, QuoteContainer: 34,
} as const;

const codeLangMap: Record<number, string> = {
  1: '', 2: 'abap', 3: 'ada', 4: 'apache', 5: 'apex', 6: 'assembly', 7: 'bash', 8: 'csharp',
  9: 'cpp', 10: 'c', 11: 'cobol', 12: 'css', 13: 'coffeescript', 14: 'd', 15: 'dart',
  16: 'delphi', 17: 'django', 18: 'dockerfile', 19: 'erlang', 20: 'fortran', 21: 'foxpro',
  22: 'go', 23: 'groovy', 24: 'html', 25: 'htmlbars', 26: 'http', 27: 'haskell', 28: 'json',
  29: 'java', 30: 'javascript', 31: 'julia', 32: 'kotlin', 33: 'latex', 34: 'lisp',
  35: 'logo', 36: 'lua', 37: 'matlab', 38: 'makefile', 39: 'markdown', 40: 'nginx',
  41: 'objectivec', 42: 'openedge-abl', 43: 'php', 44: 'perl', 45: 'postscript',
  46: 'powershell', 47: 'prolog', 48: 'protobuf', 49: 'python', 50: 'r', 51: 'rpg',
  52: 'ruby', 53: 'rust', 54: 'sas', 55: 'scss', 56: 'sql', 57: 'scala', 58: 'scheme',
  59: 'scratch', 60: 'shell', 61: 'swift', 62: 'thrift', 63: 'typescript', 64: 'vbscript',
  65: 'vbnet', 66: 'xml', 67: 'yaml',
};

export class Parser {
  imgTokens: string[] = [];
  private blockMap = new Map<string, DocxBlock>();

  parseDocxContent (doc: DocInfo, blocks: DocxBlock[]): string {
    for (const b of blocks) {
      if (b.block_id) this.blockMap.set(b.block_id, b);
    }
    const entry = this.blockMap.get(doc.documentId);
    if (!entry) return '';
    return this.parseBlock(entry, 0);
  }

  private parseBlock (b: DocxBlock, indent: number): string {
    const prefix = '\t'.repeat(indent);
    const bt = b.block_type;

    if (bt === BlockType.Page) return this.parsePage(b);
    if (bt === BlockType.Text) return prefix + this.parseText(b.text!) + '\n';
    if (bt >= BlockType.Heading1 && bt <= BlockType.Heading9) return prefix + this.parseHeading(b, bt - 2);
    if (bt === BlockType.Bullet) return prefix + this.parseBullet(b, indent);
    if (bt === BlockType.Ordered) return prefix + this.parseOrdered(b, indent);
    if (bt === BlockType.Code) return prefix + this.parseCode(b);
    if (bt === BlockType.Quote) return prefix + '> ' + this.parseText(b.quote!) + '\n';
    if (bt === BlockType.Equation) return prefix + '$$\n' + this.parseText(b.equation!) + '$$\n\n';
    if (bt === BlockType.Todo) return prefix + this.parseTodo(b);
    if (bt === BlockType.Callout) return this.parseCallout(b);
    if (bt === BlockType.Divider) return prefix + '---\n\n';
    if (bt === BlockType.Image) return prefix + this.parseImage(b) + '\n';
    if (bt === BlockType.Table) return prefix + this.parseTable(b);
    if (bt === BlockType.TableCell) return this.parseTableCell(b);
    if (bt === BlockType.QuoteContainer) return this.parseQuoteContainer(b);
    if (bt === BlockType.Grid) return this.parseGrid(b, indent);

    return '';
  }

  private parsePage (b: DocxBlock): string {
    let s = '# ' + this.parseText(b.page!) + '\n';
    for (const id of b.children ?? []) {
      const child = this.blockMap.get(id);
      if (child) s += this.parseBlock(child, 0) + '\n';
    }
    return s;
  }

  private parseText (body: TextBody): string {
    const inline = body.elements.length > 1;
    return body.elements.map(e => this.parseElement(e, inline)).join('') + '\n';
  }

  private parseElement (e: TextElement, inline: boolean): string {
    if (e.text_run) return this.parseTextRun(e.text_run);
    if (e.mention_user) return e.mention_user.user_id;
    if (e.mention_doc) {
      const url = e.mention_doc.url ? decodeURIComponent(e.mention_doc.url) : '';
      return `[${e.mention_doc.title ?? ''}](${url})`;
    }
    if (e.equation) {
      const sym = inline ? '$' : '$$';
      return sym + e.equation.content.replace(/\n$/, '') + sym;
    }
    return '';
  }

  private parseTextRun (tr: NonNullable<TextElement['text_run']>): string {
    const s = tr.text_element_style;
    let pre = '', post = '';
    if (s) {
      if (s.bold) {
        pre = '**';
        post = '**';
      } else if (s.italic) {
        pre = '_';
        post = '_';
      } else if (s.strikethrough) {
        pre = '~~';
        post = '~~';
      } else if (s.underline) {
        pre = '<u>';
        post = '</u>';
      } else if (s.inline_code) {
        pre = '`';
        post = '`';
      } else if (s.link) {
        pre = '[';
        post = `](${decodeURIComponent(s.link.url)})`;
      }
    }
    return pre + tr.content + post;
  }

  private parseHeading (b: DocxBlock, level: number): string {
    const headingKey = `heading${level}` as keyof DocxBlock;
    const body = b[headingKey] as TextBody | undefined;
    let s = '#'.repeat(level) + ' ' + (body ? this.parseText(body) : '\n');
    for (const id of b.children ?? []) {
      const child = this.blockMap.get(id);
      if (child) s += this.parseBlock(child, 0);
    }
    return s;
  }

  private parseBullet (b: DocxBlock, indent: number): string {
    let s = '- ' + this.parseText(b.bullet!);
    for (const id of b.children ?? []) {
      const child = this.blockMap.get(id);
      if (child) s += this.parseBlock(child, indent + 1);
    }
    return s;
  }

  private parseOrdered (b: DocxBlock, indent: number): string {
    const parent = this.blockMap.get(b.parent_id!);
    let order = 1;
    if (parent?.children) {
      const idx = parent.children.indexOf(b.block_id!);
      for (let i = idx - 1; i >= 0; i--) {
        const sib = this.blockMap.get(parent.children[i]!);
        if (sib?.block_type === BlockType.Ordered) order++;
        else break;
      }
    }
    let s = `${order}. ` + this.parseText(b.ordered!);
    for (const id of b.children ?? []) {
      const child = this.blockMap.get(id);
      if (child) s += this.parseBlock(child, indent + 1);
    }
    return s;
  }

  private parseCode (b: DocxBlock): string {
    const lang = codeLangMap[b.code?.style?.language ?? 1] ?? '';
    const text = this.parseText(b.code!).trim();
    return '```' + lang + '\n' + text + '\n```\n';
  }

  private parseTodo (b: DocxBlock): string {
    const checked = b.todo?.style?.done ? 'x' : ' ';
    return `- [${checked}] ` + this.parseText(b.todo!) + '\n';
  }

  private parseCallout (b: DocxBlock): string {
    let s = '>[!TIP] \n';
    for (const id of b.children ?? []) {
      const child = this.blockMap.get(id);
      if (child) s += this.parseBlock(child, 0);
    }
    return s;
  }

  private parseImage (b: DocxBlock): string {
    const token = b.image?.token;
    if (token) {
      this.imgTokens.push(token);
      return `![图片-${token}](${token})\n`;
    }
    return '';
  }

  private parseTableCell (b: DocxBlock): string {
    let s = '';
    for (const id of b.children ?? []) {
      const child = this.blockMap.get(id);
      if (child) s += this.parseBlock(child, 0).replace(/\n/g, '') + '<br/>';
    }
    return s;
  }

  private parseTable (b: DocxBlock): string {
    const t = b.table!;
    const cols = t.property.column_size;
    const rows: string[][] = [];
    const mergeInfos = t.property.merge_info ?? [];

    for (let i = 0; i < (t.cells?.length ?? 0); i++) {
      const cellId = t.cells![i]!;
      const cell = this.blockMap.get(cellId);
      const content = cell ? this.parseBlock(cell, 0).replace(/\n/g, '') : '';
      const row = Math.floor(i / cols);
      const col = i % cols;
      if (!rows[row]) rows[row] = [];
      rows[row]![col] = content;
    }

    const mergeMap = new Map<string, { rowSpan: number; colSpan: number }>();
    for (let i = 0; i < mergeInfos.length; i++) {
      const m = mergeInfos[i]!;
      const row = Math.floor(i / cols);
      const col = i % cols;
      mergeMap.set(`${row}-${col}`, { rowSpan: m.row_span ?? 1, colSpan: m.col_span ?? 1 });
    }

    const processed = new Set<string>();
    let buf = '<table>\n';
    for (let r = 0; r < rows.length; r++) {
      buf += '<tr>\n';
      for (let c = 0; c < (rows[r]?.length ?? 0); c++) {
        const key = `${r}-${c}`;
        if (processed.has(key)) continue;
        const merge = mergeMap.get(key);
        let attrs = '';
        if (merge) {
          if (merge.rowSpan > 1) attrs += ` rowspan="${merge.rowSpan}"`;
          if (merge.colSpan > 1) attrs += ` colspan="${merge.colSpan}"`;
          for (let mr = r; mr < r + merge.rowSpan; mr++) {
            for (let mc = c; mc < c + merge.colSpan; mc++) {
              processed.add(`${mr}-${mc}`);
            }
          }
        }
        buf += `<td${attrs}>${rows[r]![c] ?? ''}</td>`;
      }
      buf += '</tr>\n';
    }
    buf += '</table>\n';
    return buf;
  }

  private parseQuoteContainer (b: DocxBlock): string {
    let s = '';
    for (const id of b.children ?? []) {
      const child = this.blockMap.get(id);
      if (child) s += '> ' + this.parseBlock(child, 0);
    }
    return s;
  }

  private parseGrid (b: DocxBlock, indent: number): string {
    let s = '';
    for (const colId of b.children ?? []) {
      const col = this.blockMap.get(colId);
      if (!col) continue;
      for (const id of col.children ?? []) {
        const child = this.blockMap.get(id);
        if (child) s += this.parseBlock(child, indent);
      }
    }
    return s;
  }
}
