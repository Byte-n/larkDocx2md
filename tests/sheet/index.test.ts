import { describe, it, expect } from 'vitest';
import { cellToMd, expandMerges, trimTrailingEmpty, columnIndexToLetter } from '../../src/sheet/index.js';

// ─── cellToMd ───────────────────────────────────────────────────────────────

describe('cellToMd', () => {
  it('returns empty string for null/undefined', () => {
    expect(cellToMd(null)).toBe('');
    expect(cellToMd(undefined)).toBe('');
  });

  it('converts primitive values to string', () => {
    expect(cellToMd(123)).toBe('123');
    expect(cellToMd(true)).toBe('true');
    expect(cellToMd('hello')).toBe('hello');
  });

  it('escapes pipe and newline in primitives', () => {
    expect(cellToMd('a|b')).toBe('a\\|b');
    expect(cellToMd('a\nb')).toBe('a<br>b');
  });

  it('handles text type object', () => {
    expect(cellToMd({ type: 'text', text: 'hello' })).toBe('hello');
    expect(cellToMd({ type: 'text', text: 'a|b' })).toBe('a\\|b');
  });

  it('handles url type object', () => {
    expect(cellToMd({ type: 'url', text: 'Google', link: 'https://google.com' }))
      .toBe('[Google](https://google.com)');
  });

  it('handles mentionUser type', () => {
    expect(cellToMd({ type: 'mentionUser', name: 'Alice' })).toBe('@Alice');
  });

  it('handles formula type', () => {
    expect(cellToMd({ type: 'formula', text: 'SUM(A1:B2)' })).toBe('`SUM(A1:B2)`');
  });

  it('handles array of cells (rich text)', () => {
    expect(cellToMd([
      { type: 'text', text: 'hello ' },
      { type: 'url', text: 'world', link: 'https://example.com' },
    ])).toBe('hello [world](https://example.com)');
  });

  it('handles unknown object with text field', () => {
    expect(cellToMd({ type: 'unknown', text: 'fallback' })).toBe('fallback');
  });
});

// ─── expandMerges ───────────────────────────────────────────────────────────

describe('expandMerges', () => {
  it('returns same grid when no merges', () => {
    const rows = [['a', 'b'], ['c', 'd']];
    expect(expandMerges(rows, [])).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('does not mutate original array', () => {
    const rows = [['a', 'b'], ['c', 'd']];
    const result = expandMerges(rows, [{ start_row_index: 0, end_row_index: 1, start_column_index: 0, end_column_index: 0 }]);
    expect(rows[1]![0]).toBe('c'); // original unchanged
    expect(result[1]![0]).toBe('a'); // merged value
  });

  it('fills merged region with top-left value', () => {
    const rows = [['X', '', ''], ['', '', ''], ['', '', '']];
    const merges = [{ start_row_index: 0, end_row_index: 2, start_column_index: 0, end_column_index: 2 }];
    const result = expandMerges(rows, merges);
    expect(result).toEqual([['X', 'X', 'X'], ['X', 'X', 'X'], ['X', 'X', 'X']]);
  });

  it('handles multiple non-overlapping merges', () => {
    const rows = [['A', 'B', 'C'], ['', 'D', '']];
    const merges = [
      { start_row_index: 0, end_row_index: 1, start_column_index: 0, end_column_index: 0 },
      { start_row_index: 0, end_row_index: 0, start_column_index: 1, end_column_index: 2 },
    ];
    const result = expandMerges(rows, merges);
    expect(result[0]).toEqual(['A', 'B', 'B']);
    expect(result[1]![0]).toBe('A');
  });
});

// ─── trimTrailingEmpty ──────────────────────────────────────────────────────

describe('trimTrailingEmpty', () => {
  it('returns empty array when all cells empty', () => {
    expect(trimTrailingEmpty([['', ''], ['', '']])).toEqual([]);
  });

  it('trims trailing empty rows', () => {
    const rows = [['a', 'b'], ['c', 'd'], ['', ''], ['', '']];
    expect(trimTrailingEmpty(rows)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('trims trailing empty columns', () => {
    const rows = [['a', '', ''], ['b', '', '']];
    expect(trimTrailingEmpty(rows)).toEqual([['a'], ['b']]);
  });

  it('trims both trailing empty rows and columns', () => {
    const rows = [['a', 'b', ''], ['c', '', ''], ['', '', '']];
    expect(trimTrailingEmpty(rows)).toEqual([['a', 'b'], ['c', '']]);
  });

  it('keeps middle empty rows/columns', () => {
    const rows = [['a', '', 'b'], ['', '', ''], ['c', '', 'd']];
    expect(trimTrailingEmpty(rows)).toEqual([['a', '', 'b'], ['', '', ''], ['c', '', 'd']]);
  });
});

// ─── columnIndexToLetter ────────────────────────────────────────────────────

describe('columnIndexToLetter', () => {
  it('converts single letter columns', () => {
    expect(columnIndexToLetter(1)).toBe('A');
    expect(columnIndexToLetter(26)).toBe('Z');
  });

  it('converts double letter columns', () => {
    expect(columnIndexToLetter(27)).toBe('AA');
    expect(columnIndexToLetter(28)).toBe('AB');
    expect(columnIndexToLetter(52)).toBe('AZ');
    expect(columnIndexToLetter(53)).toBe('BA');
  });

  it('converts triple letter columns', () => {
    expect(columnIndexToLetter(703)).toBe('AAA');
  });

  it('returns empty string for 0', () => {
    expect(columnIndexToLetter(0)).toBe('');
  });
});
