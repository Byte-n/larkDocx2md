import { describe, it, expect } from 'vitest';
import { whiteboardNodesToSvg } from '../../src/whiteboard/index.js';
import { DefaultRenderContext } from '../../src/whiteboard/render-context.js';
import { getAllRenderers, getRenderer } from '../../src/whiteboard/node-renderer.js';
import type { WNode } from '../../src/whiteboard/types.js';

describe('DefaultRenderContext', () => {
  it('renderNode falls back for unknown type', () => {
    // 构造一个未注册的 type，触发 renderFallback
    const nodes = [
      {
        id: 'u',
        type: 'totally_unknown_type',
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        text: { text: 'fallback' } as any,
        style: { fill_color: '#fafafa', border_color: '#999' } as any,
      } as unknown as WNode,
    ];
    const svg = whiteboardNodesToSvg(nodes);
    // fallback 会输出 <rect ... rx="2"/> 和文本
    expect(svg).toContain('rx="2"');
    expect(svg).toContain('fallback');
    // fallback 包裹为 <g>，包含 <rect> 和 <text>
    expect(svg).toMatch(/<g[^>]*>/);
  });

  it('renderFallback renders children recursively', () => {
    const nodes = [
      {
        id: 'p',
        type: 'mystery_parent',
        x: 0, y: 0, width: 200, height: 100,
        children: ['c1', 'c2'],
      } as unknown as WNode,
      { id: 'c1', type: 'text_shape', parent_id: 'p', x: 10, y: 10, width: 60, height: 20, text: { text: 'kid1' } as any } as WNode,
      { id: 'c2', type: 'text_shape', parent_id: 'p', x: 10, y: 40, width: 60, height: 20, text: { text: 'kid2' } as any } as WNode,
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('kid1');
    expect(svg).toContain('kid2');
  });

  it('renderChildren skips missing ids silently', () => {
    const ctx = new DefaultRenderContext({
      nodeMap: new Map(),
      usedMarkers: new Set(),
      mindMapChildrenMap: new Map(),
      referencedIds: new Set(),
    });
    const node = { id: 'x', type: 'group', children: ['nonexistent'] } as unknown as WNode;
    const out = ctx.renderChildren(node);
    expect(out).toBe('');
  });

  it('renderChildren returns empty string when node has no children', () => {
    const ctx = new DefaultRenderContext({
      nodeMap: new Map(),
      usedMarkers: new Set(),
      mindMapChildrenMap: new Map(),
      referencedIds: new Set(),
    });
    expect(ctx.renderChildren({ id: 'x', type: 'group' } as unknown as WNode)).toBe('');
  });

  it('exposes readonly context fields', () => {
    const nodeMap = new Map<string, WNode>();
    const usedMarkers = new Set<string>();
    const mindMapChildrenMap = new Map<string, string[]>();
    const referencedIds = new Set<string>();
    const ctx = new DefaultRenderContext({ nodeMap, usedMarkers, mindMapChildrenMap, referencedIds });
    expect(ctx.nodeMap).toBe(nodeMap);
    expect(ctx.usedMarkers).toBe(usedMarkers);
    expect(ctx.mindMapChildrenMap).toBe(mindMapChildrenMap);
    expect(ctx.referencedIds).toBe(referencedIds);
  });
});

describe('node-renderer registry', () => {
  it('getAllRenderers returns a map of all registered renderers', () => {
    const all = getAllRenderers();
    expect(all).toBeInstanceOf(Map);
    // 11 个内置 renderer（registerAllRenderers 中注册）
    expect(all.size).toBeGreaterThanOrEqual(11);
    // 确认至少包含这些核心类型
    const types = [...all.keys()];
    expect(types).toEqual(expect.arrayContaining([
      'text_shape',
      'image',
      'group',
      'sticky_note',
      'section',
      'paint',
      'svg',
      'composite_shape',
      'connector',
      'table',
      'mind_map',
    ]));
  });

  it('getRenderer returns undefined for unknown type', () => {
    expect(getRenderer('never_registered_type_xyz')).toBeUndefined();
  });

  it('getRenderer returns the registered renderer for known type', () => {
    const r = getRenderer('text_shape');
    expect(r).toBeDefined();
    expect(r!.type).toBe('text_shape');
  });
});
