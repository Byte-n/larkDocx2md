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

/** 单条标题信息（扁平形式）。 */
export interface HeadingInfo {
  /** 飞书块 id（最稳定锚点） */
  blockId: string;
  /** 在文档中按出现顺序的 1-based 序号 */
  index: number;
  /** 标题级别 1~9 */
  level: number;
  /** 标题文本（trim 后） */
  text: string;
  /** 从根到当前节点的标题文本链（含自身），按栈式回溯生成，可正确处理跳级标题 */
  path: string[];
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
 * 内部工具：维护标题祖先栈与 1-based 序号，将一个 heading block 转为 HeadingInfo。
 * 传入非 heading block 返回 null，不改变内部状态。
 */
function createHeadingTracker (): {
  push: (block: DocxBlock) => HeadingInfo | null;
} {
  const stack: Array<{ level: number; text: string }> = [];
  let counter = 0;
  function push (block: DocxBlock): HeadingInfo | null {
    const level = getHeadingLevel(block);
    if (level === null) return null;
    const text = extractHeadingText(block) ?? '';
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, text });
    counter += 1;
    return {
      blockId: block.block_id ?? '',
      index: counter,
      level,
      text,
      path: stack.map(s => s.text),
    };
  }
  return { push };
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
  const seenHeadings: HeadingInfo[] = [];
  const tracker = createHeadingTracker();

  function pageHandler (blocks: DocxBlock[]): boolean {
    for (const block of blocks) {
      // page 节点（block_type=1）始终保留
      if (block.block_type === 1) {
        collected.push(block);
        continue;
      }
      switch (state) {
        case 'scanning': {
          const info = tracker.push(block);
          if (info) {
            seenHeadings.push(info);
            if (info.text === targetTitle) {
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
      matched: state === 'collecting' || state === 'done',
      availableHeadings: [...seenHeadings],
    };
  }

  return { pageHandler, getResult };
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
  let state: FilterState = 'scanning';
  let matchedLevel = 0;
  const collected: DocxBlock[] = [];
  const seen: HeadingInfo[] = [];
  const tracker = createHeadingTracker();

  function pageHandler (blocks: DocxBlock[]): boolean {
    for (const block of blocks) {
      if (block.block_type === 1) {
        collected.push(block);
        continue;
      }
      switch (state) {
        case 'scanning': {
          const info = tracker.push(block);
          if (info) {
            seen.push(info);
            if (block.block_id === target) {
              state = 'collecting';
              matchedLevel = info.level;
              collected.push(block);
            }
          }
          break;
        }
        case 'collecting': {
          const level = getHeadingLevel(block);
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
      availableHeadings: [...seen],
    };
  }

  return { pageHandler, getResult };
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
  const tracker = createHeadingTracker();

  function pageHandler (blocks: DocxBlock[]): boolean {
    for (const block of blocks) {
      const info = tracker.push(block);
      if (info) headings.push(info);
    }
    return true;
  }

  return { pageHandler, getHeadings: () => [...headings] };
}
