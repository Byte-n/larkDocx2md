import type { WRichText, WText } from './types.js';

// ─── Plain Text Extraction ──────────────────────────────────────────────────

/**
 * 从 WText 中提取纯文本，无任何 SVG 渲染逻辑。
 * YAML 管线使用此函数获取节点的文本内容。
 */
export function extractPlainText (text: WText | undefined): string {
  if (!text) return '';

  // 优先使用 rich_text
  if (text.rich_text?.paragraphs?.length) {
    return extractRichTextPlain(text.rich_text);
  }

  return text.text ?? '';
}

function extractRichTextPlain (rt: WRichText): string {
  const lines: string[] = [];
  for (const para of rt.paragraphs ?? []) {
    const parts: string[] = [];
    for (const el of para.elements ?? []) {
      if (el.element_type === 0 && el.text_element) {
        parts.push(el.text_element.text ?? '');
      } else if (el.element_type === 1 && el.link_element) {
        parts.push(el.link_element.text ?? el.link_element.herf ?? '');
      } else if (el.element_type === 3 && el.mention_doc_element) {
        parts.push(el.mention_doc_element.doc_url ?? '[doc]');
      }
    }
    lines.push(parts.join(''));
  }
  return lines.join('\n');
}
