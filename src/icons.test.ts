import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { allIcons, canMark, iconName, iconSvg } from './icons';

describe('session icons', () => {
  it('marks only the group colours it knows', () => {
    expect(canMark('charts.blue')).toBe(true);
    expect(canMark('unknown')).toBe(false);
  });

  it('names a file by kind, pin, colour, animation and theme', () => {
    expect(iconName({ kind: 'active', pinned: false, color: 'charts.blue' }, 'dark')).toBe('active-blue-dark.svg');
    expect(iconName({ kind: 'idle', pinned: true }, 'light')).toBe('idle-pinned-none-light.svg');
    expect(iconName({ kind: 'unseen', pinned: true, color: 'charts.red', animated: true }, 'dark')).toBe('unseen-pinned-red-anim-dark.svg');
  });

  it('draws the running icon as a closed box with the >_ prompt', () => {
    const svg = iconSvg({ kind: 'active', pinned: false }, 'dark');
    expect(svg).toContain('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>');
    expect(svg).toContain('d="M3.5 6l2 2-2 2"');
    expect(svg).toContain('d="M7.5 10h2.5"');
    expect(svg).toContain('stroke="#89D185" stroke-width="1.2"');
    expect(svg).not.toContain('<animate');
  });

  it('draws the not-running icon as a clock in grey', () => {
    const svg = iconSvg({ kind: 'idle', pinned: false }, 'light');
    expect(svg).toContain('<circle cx="8" cy="8" r="6"/>');
    expect(svg).toContain('d="M8 4.5V8l2.2 1.5"');
    expect(svg).toContain('stroke="#424242"');
  });

  it('fills a pinned icon gold and draws its glyph in the background colour', () => {
    const box = iconSvg({ kind: 'active', pinned: true }, 'dark');
    expect(box).toContain('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#E2B93B" stroke="none"/>');
    expect(box).toContain('stroke="#181818" stroke-width="1.4"');
    const disc = iconSvg({ kind: 'idle', pinned: true }, 'light');
    expect(disc).toContain('<circle cx="8" cy="8" r="6.3" fill="#BF8803" stroke="none"/>');
    expect(disc).toContain('stroke="#F3F3F3" stroke-width="1.4"');
  });

  it('lays the group square and the dot on top, each under a background ring', () => {
    const svg = iconSvg({ kind: 'unseen', pinned: false, color: 'charts.red' }, 'dark');
    const ring = svg.indexOf('<rect x="10.55" y="10.55" width="5.4" height="5.4" rx="1.4" fill="#181818" stroke="none"/>');
    const square = svg.indexOf('<rect x="11.25" y="11.25" width="4.5" height="4.5" rx="1" fill="#F14C4C" stroke="none"/>');
    const dotRing = svg.indexOf('<circle cx="13.5" cy="3.5" r="3.2" fill="#181818" stroke="none"/>');
    const dot = svg.indexOf('<circle cx="13.5" cy="3.5" r="2.5" fill="#CCA700" stroke="none"');
    expect(svg.indexOf('d="M7.5 10h2.5"')).toBeLessThan(dotRing);
    expect(dotRing).toBeLessThan(dot);
    expect(dot).toBeLessThan(ring);
    expect(ring).toBeLessThan(square);
    expect(iconSvg({ kind: 'active', pinned: false }, 'dark')).not.toContain('x="11.25"');
  });

  it('animates only the unseen twin: the cursor blinks twice and the dot brightens twice, then both freeze', () => {
    const svg = iconSvg({ kind: 'unseen', pinned: false, animated: true }, 'light');
    expect(svg).toContain('<animate attributeName="opacity" values="1;0;0;1;1;0;0;1" keyTimes="0;0.01;0.25;0.26;0.5;0.51;0.75;0.76" dur="1s" calcMode="discrete" fill="freeze"/>');
    expect(svg).toContain('<animate attributeName="fill" values="#BF8803;#FFE38A;#BF8803;#FFE38A;#BF8803" keyTimes="0;0.25;0.5;0.75;1" dur="0.6s" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" fill="freeze"/>');
    expect(iconSvg({ kind: 'active', pinned: false, animated: true }, 'light')).not.toContain('<animate');
  });

  it('has one icon per spec and theme, 72 still and 24 animated', () => {
    const icons = allIcons();
    expect(icons).toHaveLength(96);
    expect(new Set(icons.map(i => i.name)).size).toBe(96);
    expect(icons.filter(i => i.name.includes('-anim-'))).toHaveLength(24);
  });

  // UPDATE_ICONS=1 npm test rewrites media/icons after a drawing change.
  it('matches the shipped files in media/icons', () => {
    const dir = path.join(__dirname, '..', 'media', 'icons');
    if (process.env.UPDATE_ICONS === '1') {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      for (const icon of allIcons()) { fs.writeFileSync(path.join(dir, icon.name), icon.svg); }
    }
    expect(fs.readdirSync(dir).sort()).toEqual(allIcons().map(i => i.name).sort());
    for (const icon of allIcons()) { expect(fs.readFileSync(path.join(dir, icon.name), 'utf8')).toBe(icon.svg); }
  });
});
