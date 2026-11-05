import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeConfigDir, findTranscript, lastCustomTitle, lastCwd, lastTurn, readTail } from './title';

const entry = (title: string) => JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: 's1' });

describe('lastCustomTitle', () => {
  it('returns the last custom-title entry', () => {
    expect(lastCustomTitle([entry('first'), '{"type":"user"}', entry('second'), ''].join('\n'))).toBe('second');
  });

  it('skips a cut line, other types and blank titles', () => {
    const cut = entry('cut').slice(5);
    expect(lastCustomTitle([entry('kept'), '{"type":"user","text":"custom-title"}', entry('  '), cut].join('\n'))).toBe('kept');
  });

  it('is undefined without a title', () => {
    expect(lastCustomTitle('{"type":"user"}\n')).toBeUndefined();
  });
});

describe('lastTurn', () => {
  const user = (content: unknown, extra = {}) => JSON.stringify({ type: 'user', message: { role: 'user', content }, ...extra });
  const assistant = (stop: string | null, extra = {}) => JSON.stringify({ type: 'assistant', message: { stop_reason: stop }, ...extra });
  it('is working after a prompt, a tool call or a tool result, done after end_turn', () => {
    expect(lastTurn(user('hi'))).toBe('working');
    expect(lastTurn([user('hi'), assistant('tool_use')].join('\n'))).toBe('working');
    expect(lastTurn([user('hi'), assistant('tool_use'), user([{ type: 'tool_result' }])].join('\n'))).toBe('working');
    expect(lastTurn([user('hi'), assistant('end_turn'), '{"type":"system","subtype":"turn_duration"}'].join('\n'))).toBe('done');
  });

  it('is done after an interrupt, skips sidechain and meta entries, undefined before any prompt', () => {
    expect(lastTurn([user('hi'), assistant('tool_use'), user([{ type: 'text', text: '[Request interrupted by user]' }])].join('\n'))).toBe('done');
    expect(lastTurn([assistant('end_turn'), assistant('tool_use', { isSidechain: true }), user('x', { isMeta: true })].join('\n'))).toBe('done');
    expect(lastTurn('{"type":"custom-title","customTitle":"t"}')).toBeUndefined();
    expect(lastTurn([assistant('end_turn'), user('This session is being continued', { isCompactSummary: true, isVisibleInTranscriptOnly: true })].join('\n'))).toBe('done');
    expect(lastTurn([user('summary', { isCompactSummary: true }), assistant('tool_use')].join('\n'))).toBe('working');
  });
});

describe('lastCwd', () => {
  it('returns the last cwd, skipping cut lines', () => {
    const text = [JSON.stringify({ type: 'user', cwd: 'C:\\a' }), JSON.stringify({ type: 'user', cwd: 'C:\\b' }), '"cwd":"C:\\cut'].join('\n');
    expect(lastCwd(text)).toBe('C:\\b');
    expect(lastCwd('{"type":"user"}')).toBeUndefined();
  });
});

describe('claudeConfigDir', () => {
  it('prefers CLAUDE_CONFIG_DIR', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: 'X:\\cfg' })).toBe('X:\\cfg');
    expect(claudeConfigDir({})).toBe(path.join(os.homedir(), '.claude'));
  });
});

describe('findTranscript and readTail', () => {
  it('finds the session file in any project folder and reads its end', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-title-'));
    try {
      await fs.mkdir(path.join(dir, 'projects', 'a'), { recursive: true });
      await fs.mkdir(path.join(dir, 'projects', 'b'), { recursive: true });
      const file = path.join(dir, 'projects', 'b', 's1.jsonl');
      await fs.writeFile(file, 'abcdef');
      expect(await findTranscript(dir, 's1')).toBe(file);
      expect(await findTranscript(dir, 'missing')).toBeUndefined();
      expect(await findTranscript(path.join(dir, 'nowhere'), 's1')).toBeUndefined();
      expect(await readTail(file, 3)).toBe('def');
      expect(await readTail(file, 100)).toBe('abcdef');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
