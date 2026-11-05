// Session icons marked with their group's colour in the Groups view: a small square in the bottom-right corner.
// They are images, so the colours are the default chart colours of VS Code's dark and light themes, not the active theme's.

export type MarkedKind = 'active' | 'unseen' | 'idle';
export type IconTheme = 'light' | 'dark';

const CHART_HEX: Record<string, Record<IconTheme, string>> = {
  'charts.blue': { dark: '#59A4F9', light: '#0063D3' },
  'charts.purple': { dark: '#B180D7', light: '#652D90' },
  'charts.orange': { dark: '#D18616', light: '#D18616' },
  'charts.yellow': { dark: '#CCA700', light: '#BF8803' },
  'charts.red': { dark: '#F14C4C', light: '#E51400' },
};
const GREEN = { dark: '#89D185', light: '#388A34' };
const YELLOW = { dark: '#CCA700', light: '#BF8803' };
const GREY = { dark: '#C5C5C5', light: '#424242' };

export function canMark(color: string): boolean {
  return color in CHART_HEX;
}

// The file name of a marked icon, e.g. `active-blue-dark.svg`.
export function markedName(kind: MarkedKind, color: string, theme: IconTheme): string {
  return `${kind}-${color.replace('charts.', '')}-${theme}.svg`;
}

export function markedSvg(kind: MarkedKind, color: string, theme: IconTheme): string {
  const mark = `<rect x="11" y="10.5" width="5" height="5" rx="1" fill="${CHART_HEX[color]![theme]}" stroke="none"/>`;
  const body = kind === 'idle'
    ? `<path d="M14 7.2A6 6 0 1 0 9.5 13.8"/><path d="M8 4.5V8l2.2 1.5"/>`
    : kind === 'unseen'
      ? `<path d="M10 2.5H3a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 3 13.5h7M14.5 8v1"/><path d="M4.5 6l2 2-2 2"/><circle cx="13" cy="3.5" r="2.5" fill="${YELLOW[theme]}" stroke="none"/>`
      : `<path d="M14.5 9V4a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 4v8A1.5 1.5 0 0 0 3 13.5h7"/><path d="M4.5 6l2 2-2 2"/>`;
  const stroke = kind === 'idle' ? GREY[theme] : GREEN[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}${mark}</svg>`;
}

// Every marked icon; they are shipped in media/marked, since tree icons written into the extension's storage folder do not show.
export function markedIcons(): { name: string; svg: string }[] {
  const kinds: MarkedKind[] = ['active', 'unseen', 'idle'];
  const themes: IconTheme[] = ['light', 'dark'];
  return Object.keys(CHART_HEX).flatMap(color => kinds.flatMap(kind => themes.map(theme => ({ name: markedName(kind, color, theme), svg: markedSvg(kind, color, theme) }))));
}
