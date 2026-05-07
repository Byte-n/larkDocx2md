import type { DocxBlock } from './types.js';

/** 标题过滤器的状态 */
type FilterState = 'scanning' | 'collecting' | 'done';

/** 标题过滤器配置 */
export interface TitleFilterOptions {
  /** 要匹配的标题文本（会 trim 后比较） */
  title: string;
}

/** 标题过滤器结果 */
export interface TitleFilterResult {
  /** 过滤后的 blocks（包含匹配标题及其子级） */
  blocks: DocxBlock[];
  /** 是否已找到匹配 */
  matched: boolean;
  /** 扫描期间遇到的所有 heading（按出现顺序，不去重；仅 scanning 阶段收集） */
  availableHeadings: Array<{ level: number; text: string }>;
}

/**
 * 获取标题块的层级（1~9），非标题块返回 null。
 * block_type 3~11 对应 heading 1~9
 */
export function getHeadingLevel (block: DocxBlock): number | null {
  const bt = block.block_type;
  if (bt !== undefined && bt >= 3 && bt <= 11) {
    return bt - 2;
  }
  return null;
}

/**
 * 从 DocxBlock 中提取标题文本（trim），非标题块返回 null。
 */
export function extractHeadingText (block: DocxBlock): string | null {
  const level = getHeadingLevel(block);
  if (level === null) return null;
  const headingKey = `heading${level}` as keyof DocxBlock;
  const body = block[headingKey] as { elements?: Array<{ text_run?: { content?: string } }> } | undefined;
  if (!body?.elements) return null;
  const text = body.elements
    .map(e => e.text_run?.content ?? '')
    .join('');
  return text.trim();
}

/**
 * 创建标题过滤器，返回一个 pageHandler 兼容的回调和结果获取器。
 * 纯函数工厂，无副作用，易于测试。
 */
export function createTitleFilter (options: TitleFilterOptions): {
  /** 传入 getDocxBlocks 的 pageHandler */
  pageHandler: (blocks: DocxBlock[]) => boolean;
  /** 获取最终结果 */
  getResult: () => TitleFilterResult;
} {
  const targetTitle = options.title.trim();
  let state: FilterState = 'scanning';
  let matchedLevel = 0;
  const collected: DocxBlock[] = [];
  const seenHeadings: Array<{ level: number; text: string }> = [];

  function pageHandler (blocks: DocxBlock[]): boolean {
    for (const block of blocks) {
      // page 节点（block_type=1）始终保留
      if (block.block_type === 1) {
        collected.push(block);
        continue;
      }
      switch (state) {
        case 'scanning': {
          const level = getHeadingLevel(block);
          if (level !== null) {
            const text = extractHeadingText(block) ?? '';
            // 记录扫描到的所有标题（不去重、按出现顺序），用于未匹配时给出可用标题列表
            seenHeadings.push({ level, text });
            if (text === targetTitle) {
              state = 'collecting';
              matchedLevel = level;
              collected.push(block);
            }
          }
          break;
        }
        case 'collecting': {
          const level = getHeadingLevel(block);
          // 遇到同级或更高级别标题（level <= matchedLevel），收集结束
          if (level !== null && level <= matchedLevel) {
            state = 'done';
            return false;
          }
          collected.push(block);
          break;
        }
        case 'done':
          return false;
      }
    }
    return state !== 'done';
  }

  function getResult (): TitleFilterResult {
    return {
      blocks: [...collected],
      matched: state === 'collecting' || state === 'done',
      availableHeadings: [...seenHeadings],
    };
  }

  return { pageHandler, getResult };
}
