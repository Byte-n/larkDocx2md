import { describe, it, expect } from 'vitest';
import { serializeYaml } from '../../../src/whiteboard/yaml/serialize.js';

describe('serializeYaml', () => {
  // ─── Scalars ──────────────────────────────────────────────────────────────

  describe('scalars', () => {
    it('serializes numbers', () => {
      expect(serializeYaml(42)).toBe('42\n');
      expect(serializeYaml(3.14)).toBe('3.14\n');
    });

    it('serializes booleans', () => {
      expect(serializeYaml(true)).toBe('true\n');
      expect(serializeYaml(false)).toBe('false\n');
    });

    it('serializes plain string without quotes', () => {
      expect(serializeYaml('hello')).toBe('hello\n');
    });

    it('quotes empty string', () => {
      expect(serializeYaml('')).toBe('""\n');
    });

    it('null / undefined become empty output', () => {
      expect(serializeYaml(null)).toBe('\n');
      expect(serializeYaml(undefined)).toBe('\n');
    });
  });

  // ─── String Quoting ───────────────────────────────────────────────────────

  describe('string quoting', () => {
    it('quotes strings containing colon', () => {
      expect(serializeYaml('key: value').trim()).toBe('"key: value"');
    });

    it('quotes strings containing #', () => {
      expect(serializeYaml('a#b').trim()).toBe('"a#b"');
    });

    it('quotes strings that look like booleans/null', () => {
      expect(serializeYaml('true').trim()).toBe('"true"');
      expect(serializeYaml('null').trim()).toBe('"null"');
      expect(serializeYaml('yes').trim()).toBe('"yes"');
    });

    it('quotes strings that look like numbers', () => {
      expect(serializeYaml('123').trim()).toBe('"123"');
      expect(serializeYaml('1.5e3').trim()).toBe('"1.5e3"');
    });

    it('quotes strings with leading/trailing spaces', () => {
      expect(serializeYaml(' padded ').trim()).toBe('" padded "');
    });

    it('quotes strings starting with special chars', () => {
      expect(serializeYaml('- item').trim()).toBe('"- item"');
      expect(serializeYaml('#hash').trim()).toBe('"#hash"');
      expect(serializeYaml('{brace').trim()).toBe('"{brace"');
    });

    it('escapes backslash and double-quote inside quoted string (when other quoting trigger is present)', () => {
      // 需要有触发引用的字符（如冒号），才会走到引号+转义分支
      expect(serializeYaml('a"b: c').trim()).toBe('"a\\"b: c"');
      expect(serializeYaml('a\\b: c').trim()).toBe('"a\\\\b: c"');
    });
  });

  // ─── Arrays ───────────────────────────────────────────────────────────────

  describe('arrays', () => {
    it('serializes empty array as []', () => {
      expect(serializeYaml([]).trim()).toBe('[]');
    });

    it('serializes array of scalars', () => {
      expect(serializeYaml(['a', 'b', 'c'])).toBe('- a\n- b\n- c\n');
    });

    it('serializes array of numbers', () => {
      expect(serializeYaml([1, 2, 3])).toBe('- 1\n- 2\n- 3\n');
    });

    it('serializes multi-line string with literal block', () => {
      const out = serializeYaml(['line1\nline2']);
      expect(out).toContain('- |');
      expect(out).toContain('line1');
      expect(out).toContain('line2');
    });
  });

  // ─── Objects ──────────────────────────────────────────────────────────────

  describe('objects', () => {
    it('serializes empty object as {}', () => {
      expect(serializeYaml({}).trim()).toBe('{}');
    });

    it('serializes flat scalar object inline', () => {
      expect(serializeYaml({ x: 1, y: 2 }).trim()).toBe('{x: 1, y: 2}');
    });

    it('does not inline objects with >4 keys', () => {
      const out = serializeYaml({ a: 1, b: 2, c: 3, d: 4, e: 5 });
      expect(out).not.toContain('{');
      expect(out).toContain('a: 1');
      expect(out).toContain('e: 5');
    });

    it('does not inline object with long string value', () => {
      const longStr = 'x'.repeat(61);
      const out = serializeYaml({ k: longStr });
      expect(out).not.toContain('{');
      expect(out).toContain(`k: ${longStr}`);
    });

    it('omits null/undefined values', () => {
      const out = serializeYaml({ a: 1, b: null, c: undefined, d: 2 });
      expect(out).not.toContain('b:');
      expect(out).not.toContain('c:');
      expect(out).toContain('a: 1');
      expect(out).toContain('d: 2');
    });

    it('serializes nested object (inner inlined when small)', () => {
      const out = serializeYaml({ outer: { inner: 'value' } });
      expect(out).toContain('outer:');
      // small inner object gets inlined on next line
      expect(out).toContain('{inner: value}');
    });

    it('serializes nested non-inlinable object with indentation', () => {
      // 5 keys → not inlinable, uses multi-line block with indent
      const out = serializeYaml({ outer: { a: 1, b: 2, c: 3, d: 4, e: 5 } });
      expect(out).toContain('outer:');
      expect(out).toContain('  a: 1');
      expect(out).toContain('  e: 5');
    });

    it('serializes multi-line string as literal block in non-inlinable object', () => {
      // 包含非标量值时对象无法 inline，走多行路径，才会识别多行字符串
      const out = serializeYaml({ items: [1, 2], text: 'line1\nline2\nline3' });
      expect(out).toContain('text: |');
      expect(out).toContain('  line1');
      expect(out).toContain('  line2');
    });
  });

  // ─── Arrays of Objects (core whiteboard shape) ────────────────────────────

  describe('arrays of objects', () => {
    it('first key on same line as -, scalars', () => {
      const out = serializeYaml([{ type: 'shape', text: 'hi' }]);
      expect(out).toContain('- type: shape');
      expect(out).toContain('  text: hi');
    });

    it('first key with object value opens new block', () => {
      const out = serializeYaml([{ children: [{ type: 'x' }] }]);
      expect(out).toContain('- children:');
      expect(out).toContain('type: x');
    });

    it('first key with multi-line string uses literal block', () => {
      const out = serializeYaml([{ text: 'a\nb' }]);
      expect(out).toContain('- text: |');
    });

    it('skips empty objects in arrays', () => {
      const out = serializeYaml([{ a: null }, { b: 1 }]);
      expect(out).toContain('b: 1');
      expect(out).not.toContain('a:');
    });
  });

  // ─── Snapshot: realistic whiteboard output ────────────────────────────────

  describe('integration', () => {
    it('produces expected yaml for whiteboard-like structure', () => {
      const data = {
        whiteboard: {
          nodes: [
            { type: 'text_shape', text: 'Hello' },
            { type: 'group', children: [{ type: 'image', token: 'IMG1' }] },
          ],
        },
      };
      const out = serializeYaml(data);
      expect(out).toContain('whiteboard:');
      expect(out).toContain('  nodes:');
      expect(out).toContain('- type: text_shape');
      expect(out).toContain('text: Hello');
      expect(out).toContain('- type: group');
      expect(out).toContain('children:');
      expect(out).toContain('type: image');
      expect(out).toContain('token: IMG1');
    });
  });
});
