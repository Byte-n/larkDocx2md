import { Registry } from '../core/registry.js';
import type { NodeRenderer } from './types.js';

// ─── Renderer Registry ──────────────────────────────────────────────────────

const registry = new Registry<string, NodeRenderer>();

export function registerRenderer (renderer: NodeRenderer): void {
  registry.register(renderer.type, renderer);
}

export function getRenderer (type: string): NodeRenderer | undefined {
  return registry.get(type);
}

export function getAllRenderers (): ReadonlyMap<string, NodeRenderer> {
  return registry.getAll();
}
