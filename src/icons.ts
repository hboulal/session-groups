// Every session icon of the trees: a terminal box or a clock, gold when pinned, with the unseen dot and the group colour square on top.
// They are images, so the colours are the default colours of VS Code's dark and light themes, not the active theme's.

export type IconKind = 'active' | 'unseen' | 'idle';
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
const YELLOW = { dark: '#CCA700', light: '#BF8803' };
const GOLD = { dark: '#E2B93B', light: '#BF8803' };
const BG = { dark: '#181818', light: '#F3F3F3' };
const PALE = { dark: '#FFF3B0', light: '#FFE38A' };

const BOX = 'x="1.5" y="2.5" width="13" height="11" rx="1.5"';
const CHEVRON = 'd="M3.5 6l2 2-2 2"';
const UNDERSCORE = 'd="M7.5 10h2.5"';
const CLOCK = 'cx="8" cy="8" r="6"';
const DISC = 'cx="8" cy="8" r="6.3"';
const HANDS = 'd="M8 4.5V8l2.2 1.5"';
const SQUARE_RING = 'x="10.55" y="10.55" width="5.4" height="5.4" rx="1.4"';
const SQUARE = 'x="11.25" y="11.25" width="4.5" height="4.5" rx="1"';
const DOT_RING = 'cx="13.5" cy="3.5" r="3.2"';
const DOT = 'cx="13.5" cy="3.5" r="2.5"';

// The cursor blinks twice and the dot brightens twice, then both stay as in the still icon.
const BLINK = '<animate attributeName="opacity" values="1;0;0;1;1;0;0;1" keyTimes="0;0.01;0.25;0.26;0.5;0.51;0.75;0.76" dur="1s" calcMode="discrete" fill="freeze"/>';
const brighten = (theme: IconTheme) => `<animate attributeName="fill" values="${YELLOW[theme]};${PALE[theme]};${YELLOW[theme]};${PALE[theme]};${YELLOW[theme]}" keyTimes="0;0.25;0.5;0.75;1" dur="0.6s" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" fill="freeze"/>`;

const el = (tag: string, attrs: string, child = '') => child ? `<${tag} ${attrs}>${child}</${tag}>` : `<${tag} ${attrs}/>`;
const filled = (fill: string) => `fill="${fill}" stroke="none"`;

export function canMark(color: string): boolean {
  return color in CHART_HEX;
}

const isAnimated = (spec: IconSpec) => spec.animated === true && spec.kind === 'unseen';

// The file name of an icon, e.g. `unseen-pinned-blue-anim-dark.svg` or `idle-none-light.svg`.
export function iconName(spec: IconSpec, theme: IconTheme): string {
  const color = spec.color ? spec.color.replace('charts.', '') : 'none';
  return `${spec.kind}${spec.pinned ? '-pinned' : ''}-${color}${isAnimated(spec) ? '-anim' : ''}-${theme}.svg`;
}

export function iconSvg(spec: IconSpec, theme: IconTheme): string {
  const animated = isAnimated(spec);
  const body = spec.kind === 'idle'
    ? (spec.pinned ? el('circle', `${DISC} ${filled(GOLD[theme])}`) : el('circle', CLOCK)) + el('path', HANDS)
    : (spec.pinned ? el('rect', `${BOX} ${filled(GOLD[theme])}`) : el('rect', BOX)) + el('path', CHEVRON) + el('path', UNDERSCORE, animated ? BLINK : '');
  const dot = spec.kind === 'unseen'
    ? el('circle', `${DOT_RING} ${filled(BG[theme])}`) + el('circle', `${DOT} ${filled(YELLOW[theme])}`, animated ? brighten(theme) : '')
    : '';
  const mark = spec.color
    ? el('rect', `${SQUARE_RING} ${filled(BG[theme])}`) + el('rect', `${SQUARE} ${filled(CHART_HEX[spec.color]![theme])}`)
    : '';
  const stroke = spec.pinned ? BG[theme] : spec.kind === 'idle' ? GREY[theme] : GREEN[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${stroke}" stroke-width="${spec.pinned ? '1.4' : '1.2'}" stroke-linecap="round" stroke-linejoin="round">${body}${dot}${mark}</svg>`;
}

// Every icon; they are shipped in media/icons, since tree icons written into the extension's storage folder do not show.
export function allIcons(): { name: string; svg: string }[] {
  const kinds: IconKind[] = ['active', 'unseen', 'idle'];
  const themes: IconTheme[] = ['light', 'dark'];
  const colors: (string | undefined)[] = [...Object.keys(CHART_HEX), undefined];
  const still = kinds.flatMap(kind => [false, true].flatMap(pinned => colors.map((color): IconSpec => ({ kind, pinned, color }))));
  const twins = still.filter(spec => spec.kind === 'unseen').map((spec): IconSpec => ({ ...spec, animated: true }));
  return [...still, ...twins].flatMap(spec => themes.map(theme => ({ name: iconName(spec, theme), svg: iconSvg(spec, theme) })));
}
