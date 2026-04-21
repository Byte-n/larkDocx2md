import type { WNode } from '../types.js';
import type { YamlWhiteboardResult } from './types.js';
import { prepareNodeContext } from '../index.js';
import { convertNode } from './converters.js';
import { serializeYaml } from './serialize.js';

// ─── YAML Pipeline Entry ────────────────────────────────────────────────────

/**
 * 将飞书画板节点数组转换为 YAML 字符串（AI 友好的结构化数据）
 */
export function whiteboardNodesToYaml (nodes: WNode[]): YamlWhiteboardResult {
  const nctx = prepareNodeContext(nodes);

  // 转换所有根节点
  const yamlNodes = nctx.rootNodes
    .map(n => convertNode(n, nctx))
    .filter((n): n is NonNullable<typeof n> => n !== null);

  // 收集图片 token
  const imageTokens: string[] = [];
  collectImageTokens(yamlNodes, imageTokens);

  // 序列化
  const data = { whiteboard: { nodes: yamlNodes } };
  const yaml = serializeYaml(data);

  return { yaml, imageTokens };
}

/** 递归收集所有 image 节点的 token */
function collectImageTokens (nodes: { type?: string; token?: string; children?: any[]; cells?: any[]; [k: string]: unknown }[], out: string[]): void {
  for (const node of nodes) {
    if (node.type === 'image' && node.token) {
      out.push(node.token as string);
    }
    if (Array.isArray(node.children)) {
      collectImageTokens(node.children, out);
    }
    if (Array.isArray(node.cells)) {
      for (const cell of node.cells) {
        if (Array.isArray(cell.children)) {
          collectImageTokens(cell.children, out);
        }
      }
    }
  }
}
