import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { allIcons, canMark, iconName, iconSvg } from './icons';

describe('session icons', () => {
  it('marks only the group colours it knows', () => {
    expect(canMark('charts.blue')).toBe(true);
    expect(canMark('unknown')).toBe(false);
  });

  it('names a still file by kind, pin, colour and theme', () => {
    expect(iconName({ kind: 'active', pinned: false, color: 'charts.blue' }, 'dark')).toBe('active-blue-dark.svg');
    expect(iconName({ kind: 'idle', pinned: true }, 'light')).toBe('idle-pinned-none-light.svg');
    expect(iconName({ kind: 'unseen', pinned: true, color: 'charts.red' }, 'dark')).toBe('unseen-pinned-red-dark.svg');
  });

  it('draws the running icon as a closed box with the >_ prompt', () => {
    const svg = iconSvg({ kind: 'active', pinned: false }, 'dark');
    expect(svg).toContain('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>');
    expect(svg).toContain('d="M3.75 6l2 2-2 2"');
    expect(svg).toContain('d="M7.75 10h4.5"');
    expect(svg).toContain('stroke="#89D185" stroke-width="1.2"');
    expect(svg).not.toContain('<animate');
  });

  it('draws the not-running icon as the empty box in grey', () => {
    const svg = iconSvg({ kind: 'idle', pinned: false }, 'light');
    expect(svg).toContain('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>');
    expect(svg).toContain('stroke="#424242"');
    expect(svg).not.toContain('M3.75');
    expect(svg).not.toContain('h4.5');
  });

  it('fills a pinned running icon gold with its glyph in the background colour, and draws a pinned idle box hollow in gold', () => {
    const box = iconSvg({ kind: 'active', pinned: true }, 'dark');
    expect(box).toContain('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#E2B93B" stroke="none"/>');
    expect(box).toContain('stroke="#181818" stroke-width="1.4"');
    const idle = iconSvg({ kind: 'idle', pinned: true }, 'light');
    expect(idle).toContain('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>');
    expect(idle).toContain('stroke="#BF8803" stroke-width="1.2"');
    expect(idle).not.toContain('fill="#BF8803"');
  });

  it('lays the dot and then the group square on top, each under a background ring', () => {
    const svg = iconSvg({ kind: 'unseen', pinned: false, color: 'charts.red' }, 'dark');
    const ring = svg.indexOf('<rect x="-0.7" y="11.3" width="5.4" height="5.4" rx="1.3" fill="#181818" stroke="none"/>');
    const square = svg.indexOf('<rect x="0" y="12" width="4" height="4" rx="0.9" fill="#F14C4C" stroke="none"/>');
    const dotRing = svg.indexOf('<circle cx="13.5" cy="3.5" r="3.2" fill="#181818" stroke="none"/>');
    const dot = svg.indexOf('<circle cx="13.5" cy="3.5" r="2.5" fill="#F14C4C" stroke="none"');
    expect(svg.indexOf('d="M7.75 10h4.5"')).toBeLessThan(dotRing);
    expect(dotRing).toBeGreaterThan(-1);
    expect(dotRing).toBeLessThan(dot);
    expect(dot).toBeLessThan(ring);
    expect(ring).toBeLessThan(square);
    expect(iconSvg({ kind: 'active', pinned: false }, 'dark')).not.toContain('y="12"');
  });

  it('draws the working icon with an empty slot, and its twin scrambles four glyphs before the cursor settles', () => {
    const still = iconSvg({ kind: 'working', pinned: false }, 'dark');
    expect(still).toContain('d="M3.75 6l2 2-2 2"');
    expect(still).not.toContain('h4.5');
    const svg = iconSvg({ kind: 'working', pinned: false, animated: true }, 'dark');
    const glyphs = ['M8.2 6.2h3.6M10 6.2v3.6', 'M8.2 6.2l3.6 3.6M11.8 6.2l-3.6 3.6', 'M8.2 8h3.6M9 6.2v3.6M11 6.2v3.6', 'M8.2 9.8v-3.6h3.6v3.6'];
    const times = ['0;0.0000;0.0833', '0;0.0833;0.1667', '0;0.1667;0.2500', '0;0.2500;0.3333'];
    glyphs.forEach((d, i) => {
      expect(svg).toContain(`<path d="${d}" opacity="0"><animate attributeName="opacity" values="0;0.6;0" keyTimes="${times[i]}" dur="1.2s" calcMode="discrete" repeatCount="indefinite"/></path>`);
    });
    expect(svg).toContain('<path d="M7.75 10h4.5" opacity="0"><animate attributeName="opacity" values="0;1" keyTimes="0;0.3333" dur="1.2s" calcMode="discrete" repeatCount="indefinite"/></path>');
    expect(iconSvg({ kind: 'idle', pinned: false, animated: true }, 'dark')).not.toContain('<animate');
  });

  it('animates the unseen twin in a loop: the cursor blinks and the dot pulses', () => {
    const svg = iconSvg({ kind: 'unseen', pinned: false, animated: true }, 'light');
    expect(svg).toContain('<animate attributeName="opacity" values="0;1" keyTimes="0;0.3333" dur="1.2s" calcMode="discrete" repeatCount="indefinite"/>');
    expect(svg).toContain('<animate attributeName="fill" values="#E51400;#FF9B9B;#E51400" keyTimes="0;0.5;1" dur="1.2s" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/>');
  });

  it('pulses the cursor of the running twin softly, and keeps the running icon still', () => {
    const svg = iconSvg({ kind: 'active', pinned: false, animated: true }, 'light');
    expect(svg).toContain('<path d="M7.75 10h4.5"><animate attributeName="opacity" values="0.25;1;1;0.25" keyTimes="0;0.3333;0.6667;1" dur="1.2s" calcMode="spline" keySplines="0.4 0 0.6 1;0 0 1 1;0.4 0 0.6 1" repeatCount="indefinite"/></path>');
    expect(iconSvg({ kind: 'active', pinned: false }, 'light')).not.toContain('<animate');
  });

  it('starts every animation that far into the beat when given a phase', () => {
    const svg = iconSvg({ kind: 'unseen', pinned: false, animated: true }, 'dark', 0.37);
    expect(svg.match(/<animate /g)).toHaveLength(2);
    expect(svg.match(/<animate begin="-0.37s" /g)).toHaveLength(2);
    expect(iconSvg({ kind: 'unseen', pinned: false, animated: true }, 'dark')).not.toContain('begin=');
  });

  it('has one still icon per spec and theme', () => {
    const icons = allIcons();
    expect(icons).toHaveLength(96);
    expect(new Set(icons.map(i => i.name)).size).toBe(96);
    expect(icons.every(i => !i.svg.includes('<animate'))).toBe(true);
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
