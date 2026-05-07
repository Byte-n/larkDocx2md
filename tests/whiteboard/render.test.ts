import { describe, it, expect } from 'vitest';
import { whiteboardNodesToSvg } from '../../src/whiteboard/index.js';
import type { WNode } from '../../src/whiteboard/types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mk (partial: Partial<WNode>): WNode {
  return { type: 'text_shape', x: 0, y: 0, width: 100, height: 40, ...partial } as WNode;
}

// ─── Top-level SVG structure ────────────────────────────────────────────────

describe('whiteboardNodesToSvg - top-level', () => {
  it('produces default viewBox for empty input', () => {
    const svg = whiteboardNodesToSvg([]);
    expect(svg).toMatchSnapshot();
  });

  it('includes background color rect', () => {
    const nodes: WNode[] = [mk({ id: 't', x: 0, y: 0, width: 50, height: 50 })];
    const svg = whiteboardNodesToSvg(nodes, '#f0f0f0');
    expect(svg).toContain('fill="#f0f0f0"');
    expect(svg).toMatchSnapshot();
  });

  it('includes dot-pattern background', () => {
    const nodes: WNode[] = [mk({ id: 't', x: 0, y: 0, width: 50, height: 50 })];
    const svg = whiteboardNodesToSvg(nodes, 'dot');
    expect(svg).toContain('<pattern id="grid"');
    expect(svg).toContain('url(#grid)');
  });

  it('omits bg when none', () => {
    const nodes: WNode[] = [mk({ id: 't', x: 0, y: 0, width: 50, height: 50 })];
    const svg = whiteboardNodesToSvg(nodes, 'none');
    expect(svg).not.toContain('<pattern');
    // 未指定 fill 的顶层 rect 背景不应出现
    expect(svg.match(/<rect[^>]*fill="#fff"/)).toBeNull();
  });

  it('calculates viewBox considering node bounds + padding', () => {
    const nodes: WNode[] = [
      mk({ id: 'a', x: 100, y: 50, width: 200, height: 100 }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    // 期望 viewBox 包围 [100,50]~[300,150]，padding=24 → [76,26,248,148]
    expect(svg).toMatch(/viewBox="76 26 248 148"/);
    expect(svg).toMatchSnapshot();
  });

  it('viewBox accounts for node rotation', () => {
    const nodes: WNode[] = [
      mk({ id: 'r', x: 0, y: 0, width: 100, height: 100, angle: 45 }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toMatchSnapshot();
  });
});

// ─── Simple renderers ───────────────────────────────────────────────────────

describe('renderers - simple', () => {
  it('renders text_shape', () => {
    const nodes: WNode[] = [
      mk({ id: 't', type: 'text_shape', x: 0, y: 0, width: 120, height: 30, text: { text: 'Hello' } as any }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toMatchSnapshot();
  });

  it('renders image with token', () => {
    const nodes: WNode[] = [
      mk({ id: 'i', type: 'image', x: 10, y: 20, width: 80, height: 60, image: { token: 'TOK_X' } as any }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('<image href="TOK_X"');
    expect(svg).toMatchSnapshot();
  });

  it('renders sticky_note with custom color', () => {
    const nodes: WNode[] = [
      mk({
        id: 's',
        type: 'sticky_note',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        text: { text: 'Note' } as any,
        style: { fill_color: '#f5f5dc' } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('fill="#f5f5dc"');
    expect(svg).toMatchSnapshot();
  });

  it('renders section with title and children', () => {
    const nodes: WNode[] = [
      mk({
        id: 'sec',
        type: 'section',
        x: 0,
        y: 0,
        width: 200,
        height: 150,
        section: { title: 'Group A' } as any,
        children: ['c1'],
      }),
      mk({ id: 'c1', type: 'text_shape', parent_id: 'sec', x: 10, y: 30, width: 80, height: 20, text: { text: 'inside' } as any }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('data-title="Group A"');
    expect(svg).toContain('Group A');
    expect(svg).toContain('inside');
    expect(svg).toMatchSnapshot();
  });

  it('renders group wrapping children', () => {
    const nodes: WNode[] = [
      mk({ id: 'g', type: 'group', x: 0, y: 0, width: 100, height: 100, children: ['c1'] }),
      mk({ id: 'c1', type: 'text_shape', parent_id: 'g', x: 10, y: 10, width: 40, height: 20, text: { text: 'x' } as any }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('data-type="group"');
    expect(svg).toMatchSnapshot();
  });

  it('renders paint (single point → circle)', () => {
    const nodes: WNode[] = [
      mk({
        id: 'p',
        type: 'paint' as any,
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        paint: { type: 'marker', width: 4, color: '#f00', lines: [{ x: 10, y: 10 }] } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('<circle');
    expect(svg).toContain('data-paint-type="marker"');
    expect(svg).toMatchSnapshot();
  });

  it('renders paint (multiple points → polyline)', () => {
    const nodes: WNode[] = [
      mk({
        id: 'p',
        type: 'paint' as any,
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        paint: { type: 'highlight', color: '#ff0', lines: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 5 }] } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('<polyline');
    expect(svg).toContain('stroke-opacity="0.4"'); // highlight
    expect(svg).toMatchSnapshot();
  });

  it('renders svg node with embedded svg_code', () => {
    const nodes: WNode[] = [
      mk({
        id: 'sv',
        type: 'svg' as any,
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        svg: { svg_code: '<svg width="50" height="40"><circle r="10"/></svg>' } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="80"');
    expect(svg).toContain('viewBox="0 0 50 40"');
  });
});

// ─── Composite Shape ────────────────────────────────────────────────────────

describe('renderers - composite_shape', () => {
  it('renders rectangle shape with text', () => {
    const nodes: WNode[] = [
      mk({
        id: 'r',
        type: 'composite_shape',
        x: 0,
        y: 0,
        width: 100,
        height: 60,
        composite_shape: { type: 'rect' } as any,
        text: { text: 'Rect' } as any,
        style: { fill_color: '#e0e0e0', border_color: '#333' } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('Rect');
    expect(svg).toMatchSnapshot();
  });

  it('renders ellipse shape', () => {
    const nodes: WNode[] = [
      mk({
        id: 'e',
        type: 'composite_shape',
        x: 0,
        y: 0,
        width: 80,
        height: 60,
        composite_shape: { type: 'ellipse' } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toMatchSnapshot();
  });
});

// ─── Connector ──────────────────────────────────────────────────────────────

describe('renderers - connector', () => {
  it('renders connector with two attached endpoints', () => {
    const nodes: WNode[] = [
      mk({ id: 'a', type: 'composite_shape', x: 0, y: 0, width: 60, height: 40, composite_shape: { type: 'rect' } as any }),
      mk({ id: 'b', type: 'composite_shape', x: 200, y: 100, width: 60, height: 40, composite_shape: { type: 'rect' } as any }),
      mk({
        id: 'c',
        type: 'connector',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connector: {
          shape: 'straight',
          start: { attached_object: { id: 'a' }, arrow_style: 'none' },
          end: { attached_object: { id: 'b' }, arrow_style: 'triangle_arrow' },
        } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('<defs>'); // markers
    expect(svg).toMatchSnapshot();
  });

  it('renders connector with caption label', () => {
    const nodes: WNode[] = [
      mk({ id: 'a', type: 'composite_shape', x: 0, y: 0, width: 60, height: 40, composite_shape: { type: 'rect' } as any }),
      mk({ id: 'b', type: 'composite_shape', x: 200, y: 0, width: 60, height: 40, composite_shape: { type: 'rect' } as any }),
      mk({
        id: 'c',
        type: 'connector',
        x: 0, y: 0, width: 0, height: 0,
        connector: {
          shape: 'curve',
          start: { attached_object: { id: 'a' } },
          end: { attached_object: { id: 'b' } },
          captions: { data: [{ text: 'flow' }] },
        } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('flow');
  });
});

// ─── Table ──────────────────────────────────────────────────────────────────

describe('renderers - table', () => {
  it('renders 2x2 table with meta and cells', () => {
    const nodes: WNode[] = [
      mk({
        id: 't',
        type: 'table',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        table: {
          meta: { row_num: 2, col_num: 2, row_heights: [50, 50], col_widths: [100, 100] },
          cells: [
            { row_index: 1, col_index: 1, text: { text: 'A' } },
            { row_index: 1, col_index: 2, text: { text: 'B' } },
            { row_index: 2, col_index: 1, text: { text: 'C' } },
            { row_index: 2, col_index: 2, text: { text: 'D' } },
          ],
        } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('A');
    expect(svg).toContain('D');
    expect(svg).toContain('data-type="table"');
    expect(svg).toMatchSnapshot();
  });
});

// ─── Mind Map ───────────────────────────────────────────────────────────────

describe('renderers - mind_map', () => {
  it('renders mind map root with child branches', () => {
    const nodes: WNode[] = [
      mk({
        id: 'root',
        type: 'mind_map',
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        mind_map_root: { right_children: ['c1'] } as any,
        text: { text: 'Topic' } as any,
      }),
      mk({
        id: 'c1',
        type: 'mind_map',
        x: 200,
        y: 0,
        width: 100,
        height: 30,
        parent_id: 'root',
        mind_map_node: { parent_id: 'root' } as any,
        text: { text: 'Sub' } as any,
      }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    expect(svg).toContain('Topic');
    expect(svg).toContain('Sub');
    expect(svg).toContain('data-type="mind_map"');
  });
});

// ─── Mix / ordering ─────────────────────────────────────────────────────────

describe('whiteboardNodesToSvg - ordering', () => {
  it('renders nodes ordered by z_index', () => {
    const nodes: WNode[] = [
      mk({ id: 'top', type: 'composite_shape', x: 0, y: 0, width: 50, height: 50, z_index: 10, composite_shape: { type: 'rect' } as any, text: { text: 'TOP' } as any }),
      mk({ id: 'bot', type: 'composite_shape', x: 0, y: 0, width: 50, height: 50, z_index: 1, composite_shape: { type: 'rect' } as any, text: { text: 'BOT' } as any }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    // BOT 在前（z_index 小）
    expect(svg.indexOf('BOT')).toBeLessThan(svg.indexOf('TOP'));
  });

  it('skips child nodes at top level (renders via parent)', () => {
    const nodes: WNode[] = [
      mk({ id: 'p', type: 'group', x: 0, y: 0, width: 100, height: 100, children: ['c'] }),
      mk({ id: 'c', type: 'text_shape', parent_id: 'p', x: 0, y: 0, width: 50, height: 20, text: { text: 'child' } as any }),
    ];
    const svg = whiteboardNodesToSvg(nodes);
    // child should appear exactly once
    const matches = svg.match(/child/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
