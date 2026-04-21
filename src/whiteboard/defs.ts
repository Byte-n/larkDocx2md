// ─── SVG Defs (arrow markers, on-demand) ─────────────────────────────────────

const MARKER_DEFS: Record<string, string> = {
  'arrow-line': '<marker id="arrow-line" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="currentColor" stroke-width="1.5"/></marker>',
  'arrow-triangle': '<marker id="arrow-triangle" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker>',
  'arrow-empty-triangle': '<marker id="arrow-empty-triangle" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#fff" stroke="currentColor"/></marker>',
  'arrow-circle': '<marker id="arrow-circle" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><circle cx="5" cy="5" r="4" fill="currentColor"/></marker>',
  'arrow-empty-circle': '<marker id="arrow-empty-circle" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><circle cx="5" cy="5" r="4" fill="#fff" stroke="currentColor"/></marker>',
  'arrow-diamond': '<marker id="arrow-diamond" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0 6L6 0L12 6L6 12Z" fill="currentColor"/></marker>',
  'arrow-empty-diamond': '<marker id="arrow-empty-diamond" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0 6L6 0L12 6L6 12Z" fill="#fff" stroke="currentColor"/></marker>',
};

export function renderDefs (usedMarkers: Set<string>): string {
  if (usedMarkers.size === 0) return '';
  const markers = [...usedMarkers].map(id => MARKER_DEFS[id]).filter(Boolean).join('');
  return `<defs>${markers}</defs>`;
}

const ARROW_STYLE_MAP: Record<string, string> = {
  line_arrow: 'arrow-line',
  triangle_arrow: 'arrow-triangle',
  empty_triangle_arrow: 'arrow-empty-triangle',
  circle_arrow: 'arrow-circle',
  empty_circle_arrow: 'arrow-empty-circle',
  diamond_arrow: 'arrow-diamond',
  empty_diamond_arrow: 'arrow-empty-diamond',
  single_arrow: 'arrow-triangle',
  multi_arrow: 'arrow-triangle',
  exact_single_arrow: 'arrow-triangle',
  x_arrow: 'arrow-line',
};

export function arrowMarkerRef (style: string | undefined, usedMarkers: Set<string>): string {
  if (!style || style === 'none') return '';
  const id = ARROW_STYLE_MAP[style];
  if (!id) return '';
  usedMarkers.add(id);
  return `url(#${id})`;
}
