// ─── Lightweight YAML Serializer ────────────────────────────────────────────
// No external dependencies. Supports the subset of YAML needed for whiteboard output:
// strings, numbers, booleans, null, arrays, objects, and nested combinations.

/**
 * Serialize a value to YAML string.
 */
export function serializeYaml (value: unknown): string {
  const lines: string[] = [];
  writeValue(lines, value, 0, false);
  return lines.join('\n') + '\n';
}

function writeValue (lines: string[], value: unknown, indent: number, inlineKey: boolean): void {
  if (value === null || value === undefined) {
    // null values are simply omitted when used as object values (handled in writeObject)
    if (inlineKey) lines.push('null');
    return;
  }

  if (typeof value === 'string') {
    lines.push(yamlString(value));
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    lines.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    writeArray(lines, value, indent);
    return;
  }

  if (typeof value === 'object') {
    writeObject(lines, value as Record<string, unknown>, indent, inlineKey);
    return;
  }

  lines.push(String(value));
}

function writeArray (lines: string[], arr: unknown[], indent: number): void {
  if (arr.length === 0) {
    lines.push(' '.repeat(indent) + '[]');
    return;
  }

  const pad = ' '.repeat(indent);
  for (const item of arr) {
    if (item === null || item === undefined) continue;

    if (typeof item === 'object' && !Array.isArray(item)) {
      // Object items: first key on same line as `-`, rest indented
      const obj = item as Record<string, unknown>;
      const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null);
      if (entries.length === 0) continue;

      const [firstKey, firstVal] = entries[0]!;
      if (typeof firstVal === 'string' && firstVal.includes('\n')) {
        // 多行字符串：literal block scalar
        const innerPad = ' '.repeat(indent + 4);
        const contentLines = firstVal.split('\n');
        lines.push(`${pad}- ${firstKey}: |`);
        for (const line of contentLines) {
          lines.push(innerPad + line);
        }
      } else if (isScalar(firstVal)) {
        lines.push(`${pad}- ${firstKey}: ${scalarToString(firstVal)}`);
      } else {
        lines.push(`${pad}- ${firstKey}:`);
        const subLines: string[] = [];
        writeValue(subLines, firstVal, indent + 4, false);
        for (const sl of subLines) lines.push(sl);
      }

      for (let i = 1; i < entries.length; i++) {
        const [key, val] = entries[i]!;
        writeObjectEntry(lines, key, val, indent + 2);
      }
    } else {
      // Scalar items
      if (typeof item === 'string' && item.includes('\n')) {
        const innerPad = ' '.repeat(indent + 4);
        const contentLines = item.split('\n');
        lines.push(`${pad}- |`);
        for (const line of contentLines) {
          lines.push(innerPad + line);
        }
      } else {
        const subLines: string[] = [];
        writeValue(subLines, item, indent + 2, false);
        if (subLines.length > 0) {
          lines.push(`${pad}- ${subLines[0]!.trimStart()}`);
          for (let i = 1; i < subLines.length; i++) lines.push(subLines[i]!);
        }
      }
    }
  }
}

function writeObject (lines: string[], obj: Record<string, unknown>, indent: number, inlineKey: boolean): void {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) {
    lines.push('{}');
    return;
  }

  // Small flat objects can be inlined: { x: 1, y: 2 }
  if (canInline(obj, entries)) {
    const parts = entries.map(([k, v]) => `${k}: ${scalarToString(v)}`);
    lines.push(`{${parts.join(', ')}}`);
    return;
  }

  // Multi-line object
  if (inlineKey) {
    // First entry on same line
    const [firstKey, firstVal] = entries[0]!;
    if (isScalar(firstVal)) {
      lines.push('');
      writeObjectEntry(lines, firstKey, firstVal, indent);
    } else {
      lines.push('');
      writeObjectEntry(lines, firstKey, firstVal, indent);
    }
    for (let i = 1; i < entries.length; i++) {
      writeObjectEntry(lines, entries[i]![0], entries[i]![1], indent);
    }
  } else {
    for (const [key, val] of entries) {
      writeObjectEntry(lines, key, val, indent);
    }
  }
}

function writeObjectEntry (lines: string[], key: string, value: unknown, indent: number): void {
  const pad = ' '.repeat(indent);
  if (typeof value === 'string' && value.includes('\n')) {
    // 多行字符串：literal block scalar，每行缩进 = indent + 2
    const innerPad = ' '.repeat(indent + 2);
    const contentLines = value.split('\n');
    lines.push(`${pad}${key}: |`);
    for (const line of contentLines) {
      lines.push(innerPad + line);
    }
  } else if (isScalar(value)) {
    lines.push(`${pad}${key}: ${scalarToString(value)}`);
  } else {
    lines.push(`${pad}${key}:`);
    const subLines: string[] = [];
    writeValue(subLines, value, indent + 2, false);
    for (const sl of subLines) lines.push(sl);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isScalar (v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function scalarToString (v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return yamlString(v);
  return String(v);
}

/** Inline only small flat objects with all scalar values (e.g. position, size) */
function canInline (obj: Record<string, unknown>, entries: [string, unknown][]): boolean {
  if (entries.length > 4) return false;
  for (const [, v] of entries) {
    if (!isScalar(v)) return false;
    if (typeof v === 'string' && v.length > 60) return false;
  }
  return true;
}

/** Properly quote a YAML string value */
function yamlString (s: string): string {
  if (s === '') return '""';
  // Strings that need quoting
  if (needsQuoting(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

function needsQuoting (s: string): boolean {
  // Starts with special chars
  if (/^[&*!|>%@`'"{}\[\],#?:-]/.test(s)) return true;
  // Contains chars that could confuse YAML parsers
  if (/[:#]/.test(s)) return true;
  // Looks like number/bool/null
  if (/^(true|false|null|yes|no|on|off|\d[\d.eE+-]*)$/i.test(s)) return true;
  // Contains trailing/leading spaces
  if (s !== s.trim()) return true;
  return false;
}
