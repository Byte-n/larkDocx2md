import { describe, it, expect } from 'vitest';
import { whiteboardNodesToYaml } from '../../../src/whiteboard/yaml/index.js';
import type { WNode } from '../../../src/whiteboard/types.js';

// ─── Helper: 创建最小化的 WNode ──────────────────────────────────────────

function mk (partial: Partial<WNode>): WNode {
  return { type: 'text_shape', ...partial } as WNode;
}

describe('whiteboardNodesToYaml', () => {
  it('handles empty input', () => {
    const { yaml, imageTokens } = whiteboardNodesToYaml([]);
    expect(yaml).toContain('whiteboard:');
    expect(yaml).toContain('nodes:');
    expect(imageTokens).toEqual([]);
  });

  it('discards paint and svg nodes', () => {
    const nodes: WNode[] = [
      mk({ id: 'p1', type: 'paint' as any }),
      mk({ id: 's1', type: 'svg' as any }),
      mk({ id: 't1', type: 'text_shape', text: { text: 'keep' } as any }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('text: keep');
    expect(yaml).not.toContain('paint');
    expect(yaml).not.toContain('svg');
  });

  it('converts text_shape with text', () => {
    const nodes: WNode[] = [mk({ id: 'a', type: 'text_shape', text: { text: 'Hello' } as any })];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('type: text_shape');
    expect(yaml).toContain('text: Hello');
  });

  it('converts composite_shape with shape type', () => {
    const nodes: WNode[] = [
      mk({ id: 'c', type: 'composite_shape', composite_shape: { type: 'ellipse' } as any, text: { text: 'T' } as any }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('shape: ellipse');
    expect(yaml).toContain('text: T');
  });

  it('defaults composite_shape to rect when type missing', () => {
    const nodes: WNode[] = [mk({ id: 'c', type: 'composite_shape' })];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('shape: rect');
  });

  it('collects image tokens', () => {
    const nodes: WNode[] = [
      mk({ id: 'i1', type: 'image', image: { token: 'TOK1' } as any }),
      mk({ id: 'i2', type: 'image', image: { token: 'TOK2' } as any }),
    ];
    const { yaml, imageTokens } = whiteboardNodesToYaml(nodes);
    expect(imageTokens).toEqual(['TOK1', 'TOK2']);
    expect(yaml).toContain('token: TOK1');
    expect(yaml).toContain('token: TOK2');
  });

  it('converts connector with from/to and labels', () => {
    const nodes: WNode[] = [
      mk({ id: 'a', type: 'text_shape', text: { text: 'A' } as any }),
      mk({ id: 'b', type: 'text_shape', text: { text: 'B' } as any }),
      mk({
        id: 'c',
        type: 'connector',
        connector: {
          shape: 'curve',
          start: { attached_object: { id: 'a' }, arrow_style: 'filled' },
          end: { attached_object: { id: 'b' }, arrow_style: 'none' },
          captions: { data: [{ text: 'label' }] },
        } as any,
      }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('from: a');
    expect(yaml).toContain('to: b');
    expect(yaml).toContain('connector_shape: curve');
    expect(yaml).toContain('label: label');
    expect(yaml).toContain('start_arrow: filled');
    expect(yaml).not.toContain('end_arrow'); // 'none' is stripped
  });

  it('marks connector endpoints as referenced (adds data-id)', () => {
    const nodes: WNode[] = [
      mk({ id: 'a', type: 'text_shape', text: { text: 'A' } as any }),
      mk({
        id: 'c',
        type: 'connector',
        connector: {
          start: { attached_object: { id: 'a' } },
          end: { attached_object: { id: 'a' } },
        } as any,
      }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    // Referenced nodes include their id field
    expect(yaml).toContain('id: a');
  });

  it('drops connector without connector field', () => {
    const nodes: WNode[] = [mk({ id: 'c', type: 'connector' })];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).not.toContain('type: connector');
  });

  it('converts group with children', () => {
    const nodes: WNode[] = [
      mk({ id: 'g', type: 'group', children: ['c1', 'c2'] }),
      mk({ id: 'c1', type: 'text_shape', parent_id: 'g', text: { text: 'child1' } as any }),
      mk({ id: 'c2', type: 'text_shape', parent_id: 'g', text: { text: 'child2' } as any }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('type: group');
    expect(yaml).toContain('child1');
    expect(yaml).toContain('child2');
  });

  it('converts section with title', () => {
    const nodes: WNode[] = [
      mk({ id: 's', type: 'section' as any, section: { title: 'My Section' } as any, children: ['c1'] }),
      mk({ id: 'c1', type: 'text_shape', parent_id: 's', text: { text: 'inside' } as any }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('title: My Section');
    expect(yaml).toContain('inside');
  });

  it('converts sticky_note with color', () => {
    const nodes: WNode[] = [
      mk({
        id: 's',
        type: 'sticky_note',
        text: { text: 'note' } as any,
        style: { fill_color: '#ff0' } as any,
      }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('type: sticky_note');
    expect(yaml).toContain('text: note');
    expect(yaml).toContain('color: "#ff0"');
  });

  it('converts table with cells and merges', () => {
    const nodes: WNode[] = [
      mk({
        id: 't',
        type: 'table',
        table: {
          meta: { row_num: 2, col_num: 2 },
          cells: [
            { row_index: 1, col_index: 1, text: { text: 'A' }, merge_info: { row_span: 1, col_span: 2 } },
            { row_index: 2, col_index: 1, text: { text: 'C' } },
          ],
        } as any,
      }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('type: table');
    expect(yaml).toContain('rows: 2');
    expect(yaml).toContain('cols: 2');
    expect(yaml).toContain('text: A');
    expect(yaml).toContain('col_span: 2');
    expect(yaml).toContain('text: C');
  });

  it('table without meta falls back to base', () => {
    const nodes: WNode[] = [mk({ id: 't', type: 'table', table: {} as any })];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('type: table');
    expect(yaml).not.toContain('rows:');
  });

  it('converts mind_map tree structure', () => {
    const nodes: WNode[] = [
      mk({
        id: 'root',
        type: 'mind_map',
        mind_map_root: {} as any,
        text: { text: 'Root Topic' } as any,
      }),
      mk({
        id: 'c1',
        type: 'mind_map',
        parent_id: 'root',
        mind_map_node: { parent_id: 'root' } as any,
        text: { text: 'Child 1' } as any,
      }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('type: mind_map');
    expect(yaml).toContain('mind_map:');
    expect(yaml).toContain('text: Root Topic');
    expect(yaml).toContain('text: Child 1');
  });

  it('mind_map without mind_map_root is dropped at top level', () => {
    const nodes: WNode[] = [mk({ id: 'n', type: 'mind_map' })];
    const { yaml } = whiteboardNodesToYaml(nodes);
    // No root → no mind_map node in output
    expect(yaml).not.toContain('mind_map:');
  });

  it('fallback handles unknown types', () => {
    const nodes: WNode[] = [
      mk({ id: 'u', type: 'life_line' as any, text: { text: 'custom' } as any }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    expect(yaml).toContain('type: life_line');
    expect(yaml).toContain('text: custom');
  });

  it('collects tokens from nested images in groups', () => {
    const nodes: WNode[] = [
      mk({ id: 'g', type: 'group', children: ['i1'] }),
      mk({ id: 'i1', type: 'image', parent_id: 'g', image: { token: 'NESTED' } as any }),
    ];
    const { imageTokens } = whiteboardNodesToYaml(nodes);
    expect(imageTokens).toContain('NESTED');
  });

  it('collects tokens from images inside table cells', () => {
    const nodes: WNode[] = [
      mk({
        id: 't',
        type: 'table',
        table: {
          meta: { row_num: 1, col_num: 1 },
          cells: [{ row_index: 1, col_index: 1, children: ['ic'] }],
        } as any,
      }),
      mk({ id: 'ic', type: 'image', parent_id: 't', image: { token: 'TABLE_IMG' } as any }),
    ];
    const { imageTokens } = whiteboardNodesToYaml(nodes);
    expect(imageTokens).toContain('TABLE_IMG');
  });

  it('sorts root nodes by z_index', () => {
    const nodes: WNode[] = [
      mk({ id: 'a', type: 'text_shape', text: { text: 'high' } as any, z_index: 10 }),
      mk({ id: 'b', type: 'text_shape', text: { text: 'low' } as any, z_index: 1 }),
    ];
    const { yaml } = whiteboardNodesToYaml(nodes);
    // 'low' (z_index=1) should come before 'high' (z_index=10)
    const lowIdx = yaml.indexOf('low');
    const highIdx = yaml.indexOf('high');
    expect(lowIdx).toBeLessThan(highIdx);
  });
});
