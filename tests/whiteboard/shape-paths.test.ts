import { describe, it, expect } from 'vitest';
import { getShapePath, registerShapePath, defaultShapePath } from '../../src/whiteboard/shape-paths.js';
// 触发形状注册的 side-effect
import '../../src/whiteboard/shape-paths.js';
import type { WNode } from '../../src/whiteboard/types.js';

const SA = 'fill="#eee" stroke="#333"';
const W = 100;
const H = 60;

function blankNode (overrides: Partial<WNode> = {}): WNode {
  return { type: 'composite_shape', ...overrides } as unknown as WNode;
}

// 形状 → 期望包含的 SVG 片段/标签
const SHAPE_CASES: Array<[string, RegExp | string]> = [
  // rect 类
  ['rect', /^<rect width="100" height="60"/],
  ['predefined_process', /<rect width="100"/],
  ['condition_shape', /<rect width="100"/],
  ['condition_shape2', /<rect width="100"/],
  // 圆角矩形
  ['round_rect', /rx="8"/],
  ['flow_chart_round_rect', /rx="8"/],
  ['data_flow_round_rect', /rx="8"/],
  ['mind_node_round_rect', /rx="8"/],
  // 全圆角矩形（rx = min(w,h)/2）
  ['round_rect2', /rx="30"/],
  ['flow_chart_round_rect2', /rx="30"/],
  ['mind_node_full_round_rect', /rx="30"/],
  // 椭圆
  ['ellipse', /<ellipse cx="50" cy="30" rx="50" ry="30"/],
  ['data_flow_ellipse', /<ellipse/],
  ['state_start', /<ellipse/],
  ['state_end', /<ellipse/],
  // 多边形
  ['diamond', /<polygon points="50,0 100,30 50,60 0,30"/],
  ['flow_chart_diamond', /<polygon points="50,0/],
  ['triangle', /<polygon points="50,0 100,60 0,60"/],
  ['right_triangle', /<polygon points="0,0 100,60 0,60"/],
  ['hexagon', /<polygon points="20,0 80,0/],
  ['flow_chart_hexagon', /<polygon/],
  ['pentagon', /<polygon/],
  ['octagon', /<polygon/],
  ['parallelogram', /<polygon points="20,0 100,0 80,60 0,60"/],
  ['flow_chart_parallelogram', /<polygon/],
  ['trapezoid', /<polygon points="20,0 80,0 100,60 0,60"/],
  ['flow_chart_trapezoid', /<polygon/],
  // 箭头
  ['forward_arrow', /<polygon/],
  ['backward_arrow', /<polygon/],
  ['double_arrow', /<polygon/],
  // 其他
  ['cross', /<polygon/],
  ['cloud', /<ellipse/],
  ['document_shape', /<path d="M 0 0/],
];

describe('shape-paths: simple shapes', () => {
  for (const [type, pattern] of SHAPE_CASES) {
    it(`renders ${type}`, () => {
      const fn = getShapePath(type);
      expect(fn, `shape ${type} should be registered`).toBeDefined();
      const out = fn!(W, H, SA, blankNode());
      expect(out).toContain('fill="#eee"');
      if (pattern instanceof RegExp) {
        expect(out).toMatch(pattern);
      } else {
        expect(out).toContain(pattern);
      }
    });
  }
});

describe('shape-paths: composite shapes with multiple elements', () => {
  it('cylinder outputs top + body + side lines + bottom', () => {
    const fn = getShapePath('cylinder')!;
    const out = fn(100, 80, SA, blankNode({ style: { border_color: '#444', border_width: 'normal' } as any }));
    // 顶椭圆 + 中间矩形 + 两条 line + 底椭圆
    expect(out.match(/<ellipse/g)!.length).toBe(2);
    expect(out).toContain('<rect');
    expect(out.match(/<line/g)!.length).toBe(2);
    expect(out).toContain('stroke="#444"');
  });

  it('cylinder uses default stroke when border_color missing', () => {
    const fn = getShapePath('cylinder')!;
    const out = fn(100, 80, SA, blankNode());
    expect(out).toContain('stroke="#333"');
  });

  it('flow_chart_cylinder and data_base are aliases of cylinder', () => {
    expect(getShapePath('flow_chart_cylinder')).toBe(getShapePath('cylinder'));
    expect(getShapePath('data_base')).toBe(getShapePath('cylinder'));
  });

  it('bubble renders body rect + tail polygon (large corner radius)', () => {
    const fn = getShapePath('bubble')!;
    const n = blankNode({ composite_shape: { type: 'bubble' } as any });
    const out = fn(100, 80, SA, n);
    expect(out).toContain('<rect');
    expect(out).toContain('<polygon');
    // bubble: rx = min(w, bodyH)/2 = min(100, 68)/2 = 34
    expect(out).toMatch(/rx="34"/);
  });

  it('rect_bubble uses fixed small corner radius', () => {
    const fn = getShapePath('rect_bubble')!;
    const n = blankNode({ composite_shape: { type: 'rect_bubble' } as any });
    const out = fn(100, 80, SA, n);
    expect(out).toContain('rx="4"');
  });

  it('actor renders head circle + body/limb lines', () => {
    const fn = getShapePath('actor')!;
    const out = fn(100, 100, SA, blankNode());
    expect(out).toContain('<circle');
    expect(out.match(/<line/g)!.length).toBe(4); // 身体 + 双臂 + 两条腿其中三条 line（实际 4）
  });

  it('actor uses custom border color and width', () => {
    const fn = getShapePath('actor')!;
    const out = fn(100, 100, SA, blankNode({
      style: { border_color: '#f00', border_width: 'extra_bold' } as any,
    }));
    expect(out).toContain('stroke="#f00"');
  });

  it('circular_ring renders outer circle + inner cut-out', () => {
    const fn = getShapePath('circular_ring')!;
    const out = fn(100, 100, SA, blankNode({
      composite_shape: { circular_ring: { sector_ratio: 0.3 } } as any,
    }));
    const circles = out.match(/<circle/g)!;
    expect(circles.length).toBe(2);
    // 外圆 r=50，内圆 r=50*(1-0.3)=35
    expect(out).toContain('r="50"');
    expect(out).toContain('r="35"');
  });

  it('circular_ring uses default sector_ratio 0.5 when missing', () => {
    const fn = getShapePath('circular_ring')!;
    const out = fn(100, 100, SA, blankNode());
    expect(out).toContain('r="25"'); // 50 * (1 - 0.5)
  });

  it('pie without composite_shape.pie falls back to ellipse', () => {
    const fn = getShapePath('pie')!;
    const out = fn(100, 100, SA, blankNode());
    expect(out).toContain('<ellipse');
  });

  it('pie renders arc path for given angles', () => {
    const fn = getShapePath('pie')!;
    const out = fn(100, 100, SA, blankNode({
      composite_shape: { pie: { start_radial_line_angle: 0, central_angle: 90, radius: 50 } } as any,
    }));
    expect(out).toContain('<path d="M');
    expect(out).toContain('A 50 50');
    expect(out).toMatch(/0 0 0/); // largeArc=0 (<=180)
  });

  it('pie large arc flag triggers when central_angle > 180', () => {
    const fn = getShapePath('pie')!;
    const out = fn(100, 100, SA, blankNode({
      composite_shape: { pie: { start_radial_line_angle: 0, central_angle: 270, radius: 50 } } as any,
    }));
    expect(out).toMatch(/0 1 0/); // largeArc=1
  });

  it('cube renders 3 faces as polygons', () => {
    const fn = getShapePath('cube')!;
    const out = fn(100, 80, SA, blankNode());
    const polys = out.match(/<polygon/g)!;
    expect(polys.length).toBe(3);
  });

  it('brace and brace_reverse render path without fill', () => {
    const brace = getShapePath('brace')!(100, 80, SA, blankNode());
    const rev = getShapePath('brace_reverse')!(100, 80, SA, blankNode());
    expect(brace).toContain('<path d="M 100 0');
    expect(brace).toContain('fill="none"');
    expect(rev).toContain('<path d="M 0 0');
    expect(rev).toContain('fill="none"');
  });
});

describe('shape-paths: stars', () => {
  it('star renders a 10-point polygon (5-pointed star)', () => {
    const out = getShapePath('star')!(100, 100, SA, blankNode());
    expect(out).toContain('<polygon');
    // 5 角星 = 10 个顶点
    const points = out.match(/points="([^"]+)"/)![1]!.split(' ');
    expect(points.length).toBe(10);
  });

  it('star2 renders 16 vertices (8-pointed)', () => {
    const out = getShapePath('star2')!(100, 100, SA, blankNode());
    const points = out.match(/points="([^"]+)"/)![1]!.split(' ');
    expect(points.length).toBe(16);
  });

  it('star3 renders 8 vertices (4-pointed)', () => {
    const out = getShapePath('star3')!(100, 100, SA, blankNode());
    const points = out.match(/points="([^"]+)"/)![1]!.split(' ');
    expect(points.length).toBe(8);
  });

  it('star4 renders 12 vertices (6-pointed)', () => {
    const out = getShapePath('star4')!(100, 100, SA, blankNode());
    const points = out.match(/points="([^"]+)"/)![1]!.split(' ');
    expect(points.length).toBe(12);
  });
});

describe('shape-paths: registry', () => {
  it('getShapePath returns undefined for unknown shape', () => {
    expect(getShapePath('totally-missing')).toBeUndefined();
  });

  it('registerShapePath supports string and array keys', () => {
    registerShapePath('custom_single', () => '<custom-single/>');
    registerShapePath(['custom_a', 'custom_b'], () => '<custom-multi/>');
    expect(getShapePath('custom_single')!(1, 1, '', blankNode())).toBe('<custom-single/>');
    expect(getShapePath('custom_a')!(1, 1, '', blankNode())).toBe('<custom-multi/>');
    expect(getShapePath('custom_b')!(1, 1, '', blankNode())).toBe('<custom-multi/>');
  });

  it('defaultShapePath produces rounded rect fallback', () => {
    const out = defaultShapePath(100, 60, SA, blankNode());
    expect(out).toContain('<rect width="100" height="60"');
    expect(out).toContain('rx="4"');
    expect(out).toContain('ry="4"');
  });
});
