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
  /** 扫描期间遇到的所有 heading（按出现顺序，不去重；仅 scanning 阶段收集）。
   *  未匹配时扫描会走完整份文档，此列表与 get-titles 输出同形。 */
  availableHeadings: HeadingInfo[];
}

/** 单条标题信息（扁平形式）。多级路径/同名兄弟由上层 buildTitleTree 生成的嵌套结构隐含。 */
export interface HeadingInfo {
  /** 飞书块 id（最稳定锚点） */
  blockId: string;
  /** 标题级别 1~9 */
  level: number;
  /** 标题文本（trim 后） */
  text: string;
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
 * 将 heading block 转为 HeadingInfo；非 heading 返回 null。纯函数，无状态。
 */
function toHeadingInfo (block: DocxBlock): HeadingInfo | null {
  const level = getHeadingLevel(block);
  if (level === null) return null;
  return {
    blockId: block.block_id ?? '',
    level,
    text: extractHeadingText(block) ?? '',
  };
}

// ─── 公共骨架 ──────────────────────────────────────────────────────────────

/**
 * 通用 heading 过滤器骨架：扫描 → 命中 → 收集 → 终止 状态机。
 * 调用方仅需提供 `match(block, info)` 谓词决定何时进入 collecting。
 *
 * 复用要点：
 * - page 节点（block_type=1）始终保留
 * - scanning 阶段把所有 heading 推入 availableHeadings
 * - collecting 阶段遇到同级或更高级标题终止
 */
function createHeadingMatchFilter (
  match: (block: DocxBlock, info: HeadingInfo) => boolean,
): { pageHandler: (blocks: DocxBlock[]) => boolean; getResult: () => TitleFilterResult } {
  let state: FilterState = 'scanning';
  let matchedLevel = 0;
  const collected: DocxBlock[] = [];
  const seen: HeadingInfo[] = [];

  function pageHandler (blocks: DocxBlock[]): boolean {
    for (const block of blocks) {
      // page 节点（block_type=1）始终保留
      if (block.block_type === 1) {
        collected.push(block);
        continue;
      }
      switch (state) {
        case 'scanning': {
          const info = toHeadingInfo(block);
          if (info) {
            seen.push(info);
            if (match(block, info)) {
              state = 'collecting';
              matchedLevel = info.level;
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
      matched: state !== 'scanning',
      availableHeadings: [...seen],
    };
  }

  return { pageHandler, getResult };
}

/**
 * 按标题文本过滤（首个匹配生效；若有同名标题，请改用 createTitleBlockIdFilter）。
 */
export function createTitleFilter (options: TitleFilterOptions): {
  pageHandler: (blocks: DocxBlock[]) => boolean;
  getResult: () => TitleFilterResult;
} {
  const target = options.title.trim();
  return createHeadingMatchFilter((_block, info) => info.text === target);
}

/**
 * 按 heading 块 id 过滤（最精确，不会受同名标题干扰）。
 * 仅匹配 block_type 为 heading（1~9）且 block_id 严格相等的块。
 */
export function createTitleBlockIdFilter (options: { blockId: string }): {
  pageHandler: (blocks: DocxBlock[]) => boolean;
  getResult: () => TitleFilterResult;
} {
  const target = options.blockId.trim();
  // info 非 null 已在骨架中保证（仅 heading 才会进入 match），block.block_id 比较即可
  return createHeadingMatchFilter(block => block.block_id === target);
}

/**
 * 流式收集文档中所有标题，用于 get-titles 命令。
 * 返回的 pageHandler 始终返回 true，以遵循分页拉取全量文档。
 */
export function createHeadingCollector (): {
  pageHandler: (blocks: DocxBlock[]) => boolean;
  getHeadings: () => HeadingInfo[];
} {
  const headings: HeadingInfo[] = [];

  function pageHandler (blocks: DocxBlock[]): boolean {
    for (const block of blocks) {
      const info = toHeadingInfo(block);
      if (info) headings.push(info);
    }
    return true;
  }

  return { pageHandler, getHeadings: () => [...headings] };
}
