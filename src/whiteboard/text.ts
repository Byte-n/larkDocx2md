import type { WParagraph, WRichText, WText } from './types.js';
import { esc, r } from './utils.js';

// ─── Text Rendering ──────────────────────────────────────────────────────────

export function renderTextContent (text: WText | undefined, w: number, h: number): string {
  if (!text) return '';

  // 优先使用 rich_text
  if (text.rich_text?.paragraphs?.length) {
    return renderRichText(text.rich_text, text, w, h);
  }

  // 降级到纯文本
  if (!text.text) return '';
  const fontSize = text.font_size ?? 14;
  const color = text.text_color ?? '#333';
  const lineHeight = fontSize * 1.4;
  const anchor = alignToAnchor(text.horizontal_align);
  const tx = alignToX(text.horizontal_align, w);
  const maxWidth = w - 8;

  // 拆分换行 + 自动折行
  const allLines = wrapTextLines(text.text, maxWidth, fontSize);
  const startY = calcMultilineStartY(text.vertical_align, h, fontSize, allLines.length, lineHeight);

  const attrs: string[] = [`font-size="${fontSize}"`, `fill="${color}"`];
  if (text.font_weight === 'bold') attrs.push('font-weight="bold"');
  if (text.italic) attrs.push('font-style="italic"');
  if (anchor !== 'start') attrs.push(`text-anchor="${anchor}"`);
  const deco = textDecoration(text.underline, text.line_through);
  if (deco) attrs.push(`text-decoration="${deco}"`);

  if (allLines.length <= 1) {
    const ty = startY;
    attrs.push(`x="${r(tx)}"`, `y="${r(ty)}"`);
    const rot = textRotation(text.angle, tx, ty);
    if (rot) attrs.push(`transform="${rot}"`);
    const bgRect = textBgRect(text.text_background_color, tx, ty, estimateTextWidth(allLines[0] ?? '', fontSize), fontSize, anchor);
    return bgRect + `<text ${attrs.join(' ')}>${esc(allLines[0] ?? '')}</text>`;
  }

  // 多行：使用 tspan 逐行定位
  const tspans = allLines.map((line, i) =>
    `<tspan x="${r(tx)}" y="${r(startY + i * lineHeight)}">${esc(line)}</tspan>`,
  ).join('');
  return `<text ${attrs.join(' ')}>${tspans}</text>`;
}

// ─── Rich Text ───────────────────────────────────────────────────────────────

function renderRichText (rt: WRichText, parentText: WText, w: number, h: number): string {
  const fontSize = parentText.font_size ?? 14;
  const lineHeight = fontSize * 1.4;
  const maxWidth = w - 8;
  const anchor = alignToAnchor(parentText.horizontal_align);
  const tx = alignToX(parentText.horizontal_align, w);
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';

  // 将所有段落流式布局为视觉行
  const visualLines: string[] = [];
  for (const para of rt.paragraphs ?? []) {
    const segments = extractSegments(para, parentText);
    const paraLines = flowSegmentsIntoLines(segments, maxWidth);
    visualLines.push(...paraLines);
  }
  if (visualLines.length === 0) return '';

  const startY = calcMultilineStartY(parentText.vertical_align, h, fontSize, visualLines.length, lineHeight);
  return visualLines.map((spans, i) => {
    const y = startY + i * lineHeight;
    return `<text x="${r(tx)}" y="${r(y)}"${anchorAttr}>${spans}</text>`;
  }).join('\n');
}

// ─── Segment extraction & flow layout ────────────────────────────────────────

interface TextSegment {
  text: string;
  attrs: string;
  wrapPrefix: string;
  wrapSuffix: string;
  fontSize: number;
}

function extractSegments (para: WParagraph, parentText: WText): TextSegment[] {
  const segments: TextSegment[] = [];
  for (const el of (para.elements ?? [])) {
    if (el.element_type === 0 && el.text_element) {
      segments.push({
        text: el.text_element.text ?? '',
        attrs: spanStyleAttr(el.text_element.text_style, parentText),
        wrapPrefix: '', wrapSuffix: '',
        fontSize: el.text_element.text_style?.font_size ?? parentText.font_size ?? 14,
      });
    } else if (el.element_type === 1 && el.link_element) {
      const href = el.link_element.herf ?? '';
      segments.push({
        text: el.link_element.text ?? href,
        attrs: spanStyleAttr(el.link_element.text_style, parentText, '#1677ff'),
        wrapPrefix: `<a href="${esc(href)}">`, wrapSuffix: '</a>',
        fontSize: el.link_element.text_style?.font_size ?? parentText.font_size ?? 14,
      });
    } else if (el.element_type === 3 && el.mention_doc_element) {
      const url = el.mention_doc_element.doc_url ?? '';
      segments.push({
        text: '[doc]',
        attrs: spanStyleAttr(el.mention_doc_element.text_style, parentText, '#1677ff'),
        wrapPrefix: `<a href="${esc(url)}">`, wrapSuffix: '</a>',
        fontSize: el.mention_doc_element.text_style?.font_size ?? parentText.font_size ?? 14,
      });
    }
  }
  return segments;
}

function flowSegmentsIntoLines (segments: TextSegment[], maxWidth: number): string[] {
  const lines: string[] = [];
  let curParts: string[] = [];
  let curWidth = 0;

  const flush = () => {
    lines.push(curParts.join(''));
    curParts = [];
    curWidth = 0;
  };

  for (const seg of segments) {
    const parts = seg.text.split('\n');
    for (let pi = 0; pi < parts.length; pi++) {
      if (pi > 0) flush(); // 显式换行
      const part = parts[pi]!;
      if (!part) continue;

      const pw = estimateTextWidth(part, seg.fontSize);
      if (curWidth + pw <= maxWidth || curWidth === 0) {
        curParts.push(renderSegSpan(part, seg));
        curWidth += pw;
      } else {
        // 字符级折行
        let remaining = part;
        while (remaining.length > 0) {
          const avail = curWidth === 0 ? maxWidth : maxWidth - curWidth;
          const { fitted, rest } = fitChars(remaining, avail, seg.fontSize);
          if (!fitted && curWidth > 0) {
            flush();
            continue;
          }
          const text = fitted || remaining.charAt(0);
          curParts.push(renderSegSpan(text, seg));
          curWidth += estimateTextWidth(text, seg.fontSize);
          remaining = fitted ? rest : remaining.slice(1);
          if (remaining.length > 0) flush();
        }
      }
    }
  }
  if (curParts.length > 0) flush();
  return lines.length ? lines : [''];
}

function renderSegSpan (text: string, seg: TextSegment): string {
  const tspan = `<tspan ${seg.attrs}>${esc(text)}</tspan>`;
  return seg.wrapPrefix ? `${seg.wrapPrefix}${tspan}${seg.wrapSuffix}` : tspan;
}

// ─── Style helpers ───────────────────────────────────────────────────────────

function spanStyleAttr (
  s: { font_weight?: string; font_size?: number; text_color?: string; text_background_color?: string; line_through?: boolean; underline?: boolean; italic?: boolean } | undefined,
  parentText: WText,
  defaultColor?: string,
): string {
  const fontSize = s?.font_size ?? parentText.font_size ?? 14;
  const color = s?.text_color ?? parentText.text_color ?? defaultColor ?? '#333';
  const attrs: string[] = [`font-size="${fontSize}"`, `fill="${color}"`];
  if (s?.font_weight === 'bold' || parentText.font_weight === 'bold') attrs.push('font-weight="bold"');
  if (s?.italic || parentText.italic) attrs.push('font-style="italic"');
  const deco = textDecoration(s?.underline || parentText.underline, s?.line_through || parentText.line_through);
  if (deco) attrs.push(`text-decoration="${deco}"`);
  return attrs.join(' ');
}

/** 合并 underline + line-through，避免重复属性覆盖 */
function textDecoration (underline?: boolean, lineThrough?: boolean): string {
  const parts: string[] = [];
  if (underline) parts.push('underline');
  if (lineThrough) parts.push('line-through');
  return parts.join(' ');
}

/** 文字旋转 transform */
function textRotation (angle: number | undefined, cx: number, cy: number): string {
  if (!angle) return '';
  return `rotate(${angle},${r(cx)},${r(cy)})`;
}

/** 文字背景色矩形（SVG text 无 background 属性，用 rect 模拟）*/
function textBgRect (bgColor: string | undefined, tx: number, ty: number, estWidth: number, fontSize: number, anchor: string): string {
  if (!bgColor) return '';
  let rx = tx;
  if (anchor === 'middle') rx = tx - estWidth / 2;
  else if (anchor === 'end') rx = tx - estWidth;
  return `<rect x="${r(rx)}" y="${r(ty - fontSize)}" width="${r(estWidth)}" height="${r(fontSize * 1.3)}" fill="${bgColor}" rx="2"/>`;
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function alignToAnchor (align?: string): string {
  return align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
}

function alignToX (align: string | undefined, w: number): number {
  return align === 'right' ? w : align === 'center' ? w / 2 : 4;
}

function calcTextY (align: string | undefined, h: number, fontSize: number): number {
  if (align === 'bottom') return h - 4;
  if (align === 'mid') return h / 2 + fontSize / 3;
  return fontSize + 4; // top (default)
}

function calcMultilineStartY (align: string | undefined, h: number, fontSize: number, lineCount: number, lineHeight: number): number {
  if (lineCount <= 1) return calcTextY(align, h, fontSize);
  if (align === 'bottom') return h - 4 - (lineCount - 1) * lineHeight;
  if (align === 'mid') {
    const blockH = (lineCount - 1) * lineHeight + fontSize;
    return (h - blockH) / 2 + fontSize;
  }
  return fontSize + 4; // top
}

// ─── Text measurement & wrapping ─────────────────────────────────────────────

const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;

function estimateTextWidth (text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += CJK_RE.test(ch) ? fontSize * 0.9 : fontSize * 0.55;
  }
  return w;
}

/** 按 \n 拆分 + 自动折行 */
function wrapTextLines (text: string, maxWidth: number, fontSize: number): string[] {
  const rawLines = text.split('\n');
  const result: string[] = [];
  for (const raw of rawLines) {
    if (maxWidth <= 0 || estimateTextWidth(raw, fontSize) <= maxWidth) {
      result.push(raw);
      continue;
    }
    let line = '';
    let lw = 0;
    for (const ch of raw) {
      const cw = CJK_RE.test(ch) ? fontSize * 0.9 : fontSize * 0.55;
      if (lw + cw > maxWidth && line.length > 0) {
        result.push(line);
        line = ch;
        lw = cw;
      } else {
        line += ch;
        lw += cw;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}

/** 在 maxWidth 内尽可能多地装入字符 */
function fitChars (text: string, maxWidth: number, fontSize: number): { fitted: string; rest: string } {
  let w = 0;
  let i = 0;
  for (const ch of text) {
    const cw = CJK_RE.test(ch) ? fontSize * 0.9 : fontSize * 0.55;
    if (w + cw > maxWidth && i > 0) break;
    w += cw;
    i++;
  }
  return { fitted: text.slice(0, i), rest: text.slice(i) };
}

// ─── Cell Text ───────────────────────────────────────────────────────────────

/** 表格单元格文本渲染：支持全量样式 + rich_text，回退到 tbl.meta.text */
export function renderCellText (
  cellText: WText,
  metaText: WText | undefined,
  cx: number, cy: number, cw: number, ch: number,
): string {
  // 合并单元格文本和表格默认文本样式
  const merged: WText = {
    text: cellText.text,
    font_size: cellText.font_size ?? metaText?.font_size ?? 14,
    font_weight: cellText.font_weight ?? metaText?.font_weight,
    text_color: cellText.text_color ?? metaText?.text_color ?? '#333',
    text_background_color: cellText.text_background_color ?? metaText?.text_background_color,
    horizontal_align: cellText.horizontal_align ?? metaText?.horizontal_align,
    vertical_align: cellText.vertical_align ?? metaText?.vertical_align,
    italic: cellText.italic ?? metaText?.italic,
    underline: cellText.underline ?? metaText?.underline,
    line_through: cellText.line_through ?? metaText?.line_through,
    angle: cellText.angle ?? metaText?.angle,
    rich_text: cellText.rich_text ?? metaText?.rich_text,
  } as WText;

  // 渲染时需要在单元格内坐标系中偏移
  const inner = renderTextContent(merged, cw, ch);
  if (!inner) return '';
  return `<g transform="translate(${r(cx)},${r(cy)})">${inner}</g>`;
}
