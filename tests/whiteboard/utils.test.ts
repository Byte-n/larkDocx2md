import { describe, it, expect } from 'vitest';
import {
  r, esc, styleAttrs, transformAttr, walkNodes, filterNodes, gWrap, nodeDataAttrs,
  BORDER_WIDTH_MAP, DASH_ARRAY_MAP,
} from '../../src/whiteboard/utils.js';

// ─── r / esc ────────────────────────────────────────────────────────────────

describe('r (round to 2 decimals)', () => {
  it('rounds to at most 2 decimals', () => {
    expect(r(1.234)).toBe(1.23);
    expect(r(1.235)).toBe(1.24);
    expect(r(1)).toBe(1);
    expect(r(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(r(-1.234)).toBe(-1.23);
  });
});

describe('esc', () => {
  it('escapes &, <, >, "', () => {
    expect(esc('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });

  it('escapes & first to avoid double-escaping', () => {
    expect(esc('&lt;')).toBe('&amp;lt;');
  });

  it('returns unchanged for safe strings', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

// ─── styleAttrs ─────────────────────────────────────────────────────────────

describe('styleAttrs', () => {
  it('returns default when style is undefined', () => {
    expect(styleAttrs(undefined)).toBe('fill="none" stroke="#333"');
  });

  it('applies fill_color', () => {
    expect(styleAttrs({ fill_color: '#f00' } as any)).toContain('fill="#f00"');
  });

  it('uses fill="none" when fill_color missing', () => {
    expect(styleAttrs({} as any)).toContain('fill="none"');
  });

  it('omits fill-opacity when equal to 100', () => {
    expect(styleAttrs({ fill_opacity: 100 } as any)).not.toContain('fill-opacity');
  });

  it('includes fill-opacity when != 100', () => {
    expect(styleAttrs({ fill_opacity: 50 } as any)).toContain('fill-opacity="0.5"');
  });

  it('applies border_color as stroke', () => {
    expect(styleAttrs({ border_color: '#00f' } as any)).toContain('stroke="#00f"');
  });

  it('sets stroke="none" when border_style is "none"', () => {
    expect(styleAttrs({ border_style: 'none' } as any)).toContain('stroke="none"');
  });

  it('omits stroke-width when == 1 (narrow default)', () => {
    expect(styleAttrs({ border_width: 'narrow' } as any)).not.toContain('stroke-width');
  });

  it('includes stroke-width when != 1', () => {
    expect(styleAttrs({ border_width: 'bold' } as any)).toContain('stroke-width="3"');
  });

  it('applies dash array for dashed border', () => {
    expect(styleAttrs({ border_style: 'dash' } as any)).toContain('stroke-dasharray="8,4"');
    expect(styleAttrs({ border_style: 'dot' } as any)).toContain('stroke-dasharray="2,2"');
  });
});

// ─── transformAttr ──────────────────────────────────────────────────────────

describe('transformAttr', () => {
  it('returns empty string for untransformed node', () => {
    expect(transformAttr({ type: 'x' } as any)).toBe('');
  });

  it('includes translate for x/y', () => {
    expect(transformAttr({ type: 'x', x: 10, y: 20 } as any)).toContain('translate(10,20)');
  });

  it('includes rotate when angle present', () => {
    const result = transformAttr({ type: 'x', x: 0, y: 0, angle: 45, width: 100, height: 50 } as any);
    expect(result).toContain('rotate(45,50,25)');
  });

  it('includes scale for h_flip / v_flip', () => {
    const result = transformAttr({ type: 'x', width: 100, height: 50, style: { h_flip: true } } as any);
    expect(result).toContain('scale(-1,1)');
  });
});

// ─── walkNodes ──────────────────────────────────────────────────────────────

describe('walkNodes', () => {
  it('visits all nodes in DFS order from roots', () => {
    const nodes = [
      { id: 'a', type: 't', children: ['b', 'c'] },
      { id: 'b', type: 't', parent_id: 'a' },
      { id: 'c', type: 't', parent_id: 'a', children: ['d'] },
      { id: 'd', type: 't', parent_id: 'c' },
    ] as any[];

    const visited: string[] = [];
    walkNodes(nodes, (n) => { visited.push(n.id!); });
    expect(visited).toEqual(['a', 'b', 'c', 'd']);
  });

  it('passes depth correctly', () => {
    const nodes = [
      { id: 'a', type: 't', children: ['b'] },
      { id: 'b', type: 't', parent_id: 'a', children: ['c'] },
      { id: 'c', type: 't', parent_id: 'b' },
    ] as any[];
    const depths: Record<string, number> = {};
    walkNodes(nodes, (n, _p, d) => { depths[n.id!] = d; });
    expect(depths).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('skips children when visitor returns false', () => {
    const nodes = [
      { id: 'a', type: 't', children: ['b'] },
      { id: 'b', type: 't', parent_id: 'a', children: ['c'] },
      { id: 'c', type: 't', parent_id: 'b' },
    ] as any[];
    const visited: string[] = [];
    walkNodes(nodes, (n) => {
      visited.push(n.id!);
      if (n.id === 'b') return false;
    });
    expect(visited).toEqual(['a', 'b']); // c skipped
  });

  it('walks mind_map_root direction children', () => {
    const nodes = [
      { id: 'root', type: 'mm', mind_map_root: { up_children: ['u'], down_children: ['d'], left_children: [], right_children: [] } },
      { id: 'u', type: 'x', parent_id: 'root' },
      { id: 'd', type: 'x', parent_id: 'root' },
    ] as any[];
    const visited: string[] = [];
    walkNodes(nodes, (n) => { visited.push(n.id!); });
    expect(visited).toContain('u');
    expect(visited).toContain('d');
  });

  it('walks table cell children', () => {
    const nodes = [
      { id: 'tbl', type: 'table', table: { cells: [{ children: ['c1'] }] } },
      { id: 'c1', type: 'x', parent_id: 'tbl' },
    ] as any[];
    const visited: string[] = [];
    walkNodes(nodes, (n) => { visited.push(n.id!); });
    expect(visited).toEqual(['tbl', 'c1']);
  });
});

// ─── filterNodes ────────────────────────────────────────────────────────────

describe('filterNodes', () => {
  it('keeps all nodes when predicate is always true', () => {
    const nodes = [
      { id: 'a', type: 't', children: ['b'] },
      { id: 'b', type: 't', parent_id: 'a' },
    ] as any[];
    const result = filterNodes(nodes, () => true);
    expect(result.map(n => n.id)).toEqual(['a', 'b']);
  });

  it('removes nodes failing predicate', () => {
    const nodes = [
      { id: 'a', type: 'keep', children: ['b', 'c'] },
      { id: 'b', type: 'drop', parent_id: 'a' },
      { id: 'c', type: 'keep', parent_id: 'a' },
    ] as any[];
    const result = filterNodes(nodes, (n) => (n.type as string) !== 'drop');
    expect(result.map(n => n.id).sort()).toEqual(['a', 'c']);
    // children reference updated
    expect(result.find(n => n.id === 'a')!.children).toEqual(['c']);
  });

  it('preserves structure when only leaf nodes are excluded', () => {
    const nodes = [
      { id: 'a', type: 'keep', children: ['b'] },
      { id: 'b', type: 'drop', parent_id: 'a' },
    ] as any[];
    const result = filterNodes(nodes, (n) => (n.type as string) !== 'drop');
    expect(result.map(n => n.id)).toEqual(['a']);
    // a's children list is updated to exclude b
    expect(result[0]!.children).toEqual([]);
  });
});

// ─── gWrap / nodeDataAttrs ──────────────────────────────────────────────────

describe('gWrap', () => {
  it('wraps content in <g> tag', () => {
    expect(gWrap('', ['<rect/>'])).toBe('<g>\n<rect/>\n</g>');
  });

  it('returns empty g when all parts empty', () => {
    expect(gWrap('', ['', ''])).toBe('<g></g>');
  });

  it('includes transform attribute', () => {
    expect(gWrap(' transform="translate(1,2)"', ['<x/>'])).toContain('transform="translate(1,2)"');
  });

  it('filters out empty parts', () => {
    const result = gWrap('', ['', '<a/>', '', '<b/>']);
    expect(result).toContain('<a/>\n<b/>');
  });
});

describe('nodeDataAttrs', () => {
  it('adds data-type for typed nodes', () => {
    expect(nodeDataAttrs({ id: 'x', type: 'table' } as any)).toContain('data-type="table"');
    expect(nodeDataAttrs({ id: 'x', type: 'group' } as any)).toContain('data-type="group"');
  });

  it('omits data-type for non-typed nodes', () => {
    expect(nodeDataAttrs({ id: 'x', type: 'shape' } as any)).not.toContain('data-type');
  });

  it('omits data-id when id not referenced', () => {
    expect(nodeDataAttrs({ id: 'x', type: 'shape' } as any, new Set())).not.toContain('data-id');
  });

  it('includes data-id when id is referenced', () => {
    expect(nodeDataAttrs({ id: 'x', type: 'shape' } as any, new Set(['x']))).toContain('data-id="x"');
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe('constants', () => {
  it('exposes BORDER_WIDTH_MAP values', () => {
    expect(BORDER_WIDTH_MAP.narrow).toBe(1);
    expect(BORDER_WIDTH_MAP.bold).toBe(3);
  });

  it('exposes DASH_ARRAY_MAP values', () => {
    expect(DASH_ARRAY_MAP.solid).toBe('');
    expect(DASH_ARRAY_MAP.dash).toBe('8,4');
    expect(DASH_ARRAY_MAP.dot).toBe('2,2');
  });
});
