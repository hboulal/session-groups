// Every session icon of the trees: one terminal box whose prompt slot tells the state, gold when pinned, with the unseen dot and the group colour square on top.
// They are images, so the colours are the default colours of VS Code's dark and light themes, not the active theme's.

export type IconKind = 'active' | 'working' | 'unseen' | 'idle';
export type IconTheme = 'light' | 'dark';

export interface IconSpec {
  kind: IconKind;
  pinned: boolean;
  color?: string;
  animated?: boolean;
}

const CHART_HEX: Record<string, Record<IconTheme, string>> = {
  'charts.blue': { dark: '#59A4F9', light: '#0063D3' },
  'charts.purple': { dark: '#B180D7', light: '#652D90' },
  'charts.orange': { dark: '#D18616', light: '#D18616' },
  'charts.yellow': { dark: '#CCA700', light: '#BF8803' },
  'charts.red': { dark: '#F14C4C', light: '#E51400' },
};
const GREEN = { dark: '#89D185', light: '#388A34' };
const GREY = { dark: '#C5C5C5', light: '#424242' };
const UNSEEN_DOT = { dark: '#F14C4C', light: '#E51400' };
const GOLD = { dark: '#E2B93B', light: '#BF8803' };
const BG = { dark: '#181818', light: '#F3F3F3' };
const UNSEEN_DOT_BRIGHT = { dark: '#FFC9C9', light: '#FF9B9B' };

const BOX = 'x="1.5" y="2.5" width="13" height="11" rx="1.5"';
const CHEVRON = 'd="M3.75 6l2 2-2 2"';
const CURSOR = 'M7.75 10h4.5';
const GLYPHS = ['M8.2 6.2h3.6M10 6.2v3.6', 'M8.2 6.2l3.6 3.6M11.8 6.2l-3.6 3.6', 'M8.2 8h3.6M9 6.2v3.6M11 6.2v3.6', 'M8.2 9.8v-3.6h3.6v3.6'];
const DOT_RING = 'cx="13.5" cy="3.5" r="3.2"';
const DOT = 'cx="13.5" cy="3.5" r="2.5"';
const SQUARE_RING = 'x="-0.7" y="11.3" width="5.4" height="5.4" rx="1.3"';
const SQUARE = 'x="0" y="12" width="4" height="4" rx="0.9"';

// All loop in time with one beat of 1.2 s; drawn with the clock's place in the beat as `phase`, every row moves in time with the others.
// Running: the cursor fades slowly to a quarter opacity and back, once a beat. Unseen: the cursor blinks fast, on and off twice a beat, and the dot pulses to a pale red and back.
// Working: no cursor; a glyph in each twelfth of the beat, in an order that never shows the same one twice running, and the glyphs fade with the running cursor's pulse.
export const BEAT = 1.2;
const ORDER = [0, 1, 2, 3, 1, 0, 3, 2, 0, 2, 1, 3];
const SLOTS = ORDER.map((_, i) => (i / ORDER.length).toFixed(4)).join(';');
const scramble = (d: string, glyph: number) => `<path d="${d}" opacity="0"><animate attributeName="opacity" values="${ORDER.map(o => o === glyph ? '1' : '0').join(';')}" keyTimes="${SLOTS}" dur="${BEAT}s" calcMode="discrete" repeatCount="indefinite"/></path>`;
const PULSE = `<animate attributeName="opacity" values="1;0.25;1" keyTimes="0;0.5;1" dur="${BEAT}s" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/>`;
const BLINK = `<animate attributeName="opacity" values="1;0" keyTimes="0;0.5" dur="${BEAT / 2}s" calcMode="discrete" repeatCount="indefinite"/>`;
const brighten = (theme: IconTheme) => `<animate attributeName="fill" values="${UNSEEN_DOT[theme]};${UNSEEN_DOT_BRIGHT[theme]};${UNSEEN_DOT[theme]}" keyTimes="0;0.5;1" dur="${BEAT}s" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/>`;

const el = (tag: string, attrs: string, child = '') => child ? `<${tag} ${attrs}>${child}</${tag}>` : `<${tag} ${attrs}/>`;
const filled = (fill: string) => `fill="${fill}" stroke="none"`;

export function canMark(color: string): boolean {
  return color in CHART_HEX;
}

const ANIMATED_KINDS: IconKind[] = ['active', 'working', 'unseen'];
const isAnimated = (spec: IconSpec) => spec.animated === true && ANIMATED_KINDS.includes(spec.kind);

// The file name of a still icon, e.g. `unseen-pinned-blue-dark.svg` or `idle-none-light.svg`.
export function iconName(spec: IconSpec, theme: IconTheme): string {
  const color = spec.color ? spec.color.replace('charts.', '') : 'none';
  return `${spec.kind}${spec.pinned ? '-pinned' : ''}-${color}-${theme}.svg`;
}

// `phase` is how far into the beat the animations start, in seconds, so that an icon drawn at any moment joins the beat of the others.
export function iconSvg(spec: IconSpec, theme: IconTheme, phase = 0): string {
  const animated = isAnimated(spec);
  const running = spec.kind !== 'idle';
  const box = spec.pinned && running ? el('rect', `${BOX} ${filled(GOLD[theme])}`) : el('rect', BOX);
  const slot = spec.kind === 'working'
    ? (animated ? `<g>${PULSE}${GLYPHS.map(scramble).join('')}</g>` : '')
    : el('path', `d="${CURSOR}"`, animated ? (spec.kind === 'unseen' ? BLINK : PULSE) : '');
  const prompt = running ? el('path', CHEVRON) + slot : '';
  const dot = spec.kind === 'unseen'
    ? el('circle', `${DOT_RING} ${filled(BG[theme])}`) + el('circle', `${DOT} ${filled(UNSEEN_DOT[theme])}`, animated ? brighten(theme) : '')
    : '';
  const mark = spec.color
    ? el('rect', `${SQUARE_RING} ${filled(BG[theme])}`) + el('rect', `${SQUARE} ${filled(CHART_HEX[spec.color]![theme])}`)
    : '';
  const stroke = !running ? (spec.pinned ? GOLD[theme] : GREY[theme]) : spec.pinned ? BG[theme] : GREEN[theme];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${stroke}" stroke-width="${spec.pinned && running ? '1.4' : '1.2'}" stroke-linecap="round" stroke-linejoin="round">${box}${prompt}${dot}${mark}</svg>`;
  return phase > 0 ? svg.replaceAll('<animate ', `<animate begin="-${phase.toFixed(2)}s" `) : svg;
}

// Every still icon; they are shipped in media/icons, since tree icons written into the extension's storage folder do not show. The animated ones are drawn when shown, as data URIs.
export function allIcons(): { name: string; svg: string }[] {
  const kinds: IconKind[] = ['active', 'working', 'unseen', 'idle'];
  const themes: IconTheme[] = ['light', 'dark'];
  const colors: (string | undefined)[] = [...Object.keys(CHART_HEX), undefined];
  const still = kinds.flatMap(kind => [false, true].flatMap(pinned => colors.map((color): IconSpec => ({ kind, pinned, color }))));
  return still.flatMap(spec => themes.map(theme => ({ name: iconName(spec, theme), svg: iconSvg(spec, theme) })));
}
