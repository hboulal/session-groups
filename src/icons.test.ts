import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { canMark, markedIcons, markedName, markedSvg } from './icons';

describe('marked icons', () => {
  it('marks only the group colours it knows', () => {
    expect(canMark('charts.blue')).toBe(true);
    expect(canMark('unknown')).toBe(false);
  });

  it('names a file by kind, colour and theme', () => {
    expect(markedName('active', 'charts.blue', 'dark')).toBe('active-blue-dark.svg');
  });

  it('draws the group colour in the corner, in the theme default', () => {
    expect(markedSvg('idle', 'charts.red', 'light')).toContain('fill="#E51400"');
    expect(markedSvg('unseen', 'charts.red', 'dark')).toContain('fill="#F14C4C"');
  });

  it('has one icon per colour, kind and theme', () => {
    const icons = markedIcons();
    expect(icons).toHaveLength(5 * 3 * 2);
    expect(new Set(icons.map(i => i.name)).size).toBe(icons.length);
  });

  // UPDATE_ICONS=1 npm test rewrites media/marked after a drawing change.
  it('matches the shipped files in media/marked', () => {
    const dir = path.join(__dirname, '..', 'media', 'marked');
    if (process.env.UPDATE_ICONS === '1') {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      for (const icon of markedIcons()) { fs.writeFileSync(path.join(dir, icon.name), icon.svg); }
    }
    expect(fs.readdirSync(dir).sort()).toEqual(markedIcons().map(i => i.name).sort());
    for (const icon of markedIcons()) { expect(fs.readFileSync(path.join(dir, icon.name), 'utf8')).toBe(icon.svg); }
  });
});
