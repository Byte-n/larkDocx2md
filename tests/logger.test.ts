import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger, setLogLevel } from '../src/logger.js';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';

describe('logger', () => {
  let writeSpy: any;
  let writes: string[] = [];

  beforeEach(() => {
    writes = [];
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    // 每个测试开始前把级别设成最高（trace）以便所有 log 都能输出
    setLogLevel(LoggerLevel.trace);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('createLogger returns object with all level methods', () => {
    const l = createLogger('test');
    expect(typeof l.fatal).toBe('function');
    expect(typeof l.error).toBe('function');
    expect(typeof l.warn).toBe('function');
    expect(typeof l.info).toBe('function');
    expect(typeof l.debug).toBe('function');
    expect(typeof l.trace).toBe('function');
  });

  it('writes each level with correct label', () => {
    const l = createLogger('mod');
    l.fatal('fm');
    l.error('em');
    l.warn('wm');
    l.info('im');
    l.debug('dm');
    l.trace('tm');
    expect(writes.length).toBe(6);
    expect(writes[0]).toContain('[FATAL]');
    expect(writes[0]).toContain('[mod]');
    expect(writes[0]).toContain('fm');
    expect(writes[1]).toContain('[ERROR]');
    expect(writes[2]).toContain('[WARN]');
    expect(writes[3]).toContain('[INFO]');
    expect(writes[4]).toContain('[DEBUG]');
    expect(writes[5]).toContain('[TRACE]');
  });

  it('includes ISO timestamp', () => {
    const l = createLogger('mod');
    l.info('hi');
    expect(writes[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });

  it('joins multiple args with spaces and coerces to string', () => {
    const l = createLogger('mod');
    l.info('a', 1, true, { toString: () => 'X' });
    expect(writes[0]).toContain('a 1 true X');
  });

  it('applies ANSI color and reset codes', () => {
    const l = createLogger('mod');
    l.error('oops');
    expect(writes[0]).toContain('\x1b[31m'); // red for error
    expect(writes[0]).toContain('\x1b[0m');  // reset
  });

  it('setLogLevel filters lower-priority messages', () => {
    const l = createLogger('mod');
    setLogLevel(LoggerLevel.warn);

    l.fatal('f'); // fatal=0 <= warn=2 → show
    l.error('e'); // error=1 <= warn=2 → show
    l.warn('w');  // warn=2 <= warn=2 → show
    l.info('i');  // info=3 > warn=2 → skip
    l.debug('d'); // skip
    l.trace('t'); // skip

    expect(writes.length).toBe(3);
    expect(writes[0]).toContain('[FATAL]');
    expect(writes[1]).toContain('[ERROR]');
    expect(writes[2]).toContain('[WARN]');
  });

  it('setLogLevel=fatal only allows fatal', () => {
    const l = createLogger('mod');
    setLogLevel(LoggerLevel.fatal);
    l.fatal('f');
    l.error('e');
    l.info('i');
    expect(writes.length).toBe(1);
    expect(writes[0]).toContain('[FATAL]');
  });

  it('each logger instance carries its own module tag', () => {
    const a = createLogger('modA');
    const b = createLogger('modB');
    a.info('x');
    b.info('y');
    expect(writes[0]).toContain('[modA]');
    expect(writes[1]).toContain('[modB]');
  });

  it('writes end with newline', () => {
    const l = createLogger('mod');
    l.info('line');
    expect(writes[0]!.endsWith('\n')).toBe(true);
  });
});
