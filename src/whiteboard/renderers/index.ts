import { registerRenderer } from '../node-renderer.js';
import { compositeShapeRenderer } from './composite-shape.js';
import { connectorRenderer } from './connector.js';
import { tableRenderer } from './table.js';
import { mindMapRenderer } from './mind-map.js';
import {
  groupRenderer, imageRenderer, paintRenderer, sectionRenderer, stickyNoteRenderer, svgNodeRenderer, textShapeRenderer,
} from './simple.js';

// ─── Register all built-in renderers ────────────────────────────────────────

export function registerAllRenderers (): void {
  registerRenderer(compositeShapeRenderer);
  registerRenderer(connectorRenderer);
  registerRenderer(tableRenderer);
  registerRenderer(mindMapRenderer);
  registerRenderer(textShapeRenderer);
  registerRenderer(imageRenderer);
  registerRenderer(groupRenderer);
  registerRenderer(stickyNoteRenderer);
  registerRenderer(sectionRenderer);
  registerRenderer(paintRenderer);
  registerRenderer(svgNodeRenderer);
}

// Re-export resolveConnectorPoints for ViewBox calculation
export { resolveConnectorPoints } from './connector.js';
