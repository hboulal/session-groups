import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS, CLAUDE, COPILOT, GEMINI, GOOSE, OPENCODE, QWEN, fillTemplate, ageLabel, dateName, groupForFolder, idProblem, newSessionId, resolveAgents, startFolder } from './model';

describe('fillTemplate', () => {
  it('fills the id', () => {
    expect(fillTemplate('claude --resume {id}', 'abc')).toBe('claude --resume abc');
  });

  it('fills every occurrence', () => {
    expect(fillTemplate('x {id} y {id}', 'abc')).toBe('x abc y abc');
  });
});

describe('CLAUDE', () => {
  it('is built in with OpenCode, with its templates', () => {
    expect(BUILTIN_AGENTS).toEqual([CLAUDE, OPENCODE, COPILOT, GEMINI, QWEN, GOOSE]);
    expect(idProblem(COPILOT, '2f938c1f-b89d-4fe6-9a6a-7bc3dfdb2844')).toBeUndefined();
    expect(idProblem(GEMINI, 'ses_abc')).toBe('Not a session id for Gemini');
    expect(idProblem(GOOSE, 'my-session')).toBeUndefined();
    expect(CLAUDE).toMatchObject({ id: 'claude', name: 'Claude', start: 'claude --session-id {id}', resume: 'claude --resume {id}' });
  });
});

describe('idProblem', () => {
  it('takes the agent format only', () => {
    expect(idProblem(CLAUDE, '2f938c1f-b89d-4fe6-9a6a-7bc3dfdb2844')).toBeUndefined();
    expect(idProblem(CLAUDE, 'ses_abc')).toBe('Not a session id for Claude');
    expect(idProblem(OPENCODE, 'ses_f49fb398')).toBeUndefined();
    expect(idProblem(OPENCODE, '2f938c1f-b89d-4fe6-9a6a-7bc3dfdb2844')).toBe('Not a session id for OpenCode');
    expect(idProblem({ id: 'x', name: 'X', start: '{id}', resume: '{id}' }, 'any-thing')).toBeUndefined();
    expect(idProblem(CLAUDE, 'a b')).toBe('An id has no spaces');
  });

  it('a configured idPattern must be a regular expression', () => {
    expect(resolveAgents([{ id: 'x', name: 'X', start: '{id}', resume: '{id}', idPattern: '(' }]).errors).toHaveLength(1);
  });
});

describe('newSessionId', () => {
  it('is the UUID, or the prefix plus the UUID without dashes', () => {
    expect(newSessionId(CLAUDE, 'a-b-c')).toBe('a-b-c');
    expect(newSessionId(OPENCODE, 'f49f-b398')).toBe('ses_f49fb398');
  });
});

describe('resolveAgents', () => {
  const codex = { id: 'x', name: 'X', start: 'x --id {id}', resume: 'x resume {id}' };
  it('keeps the built-ins, adds new ids and replaces a built-in of the same id', () => {
    const { agents, errors } = resolveAgents([codex, { ...codex, id: 'claude', name: 'Mine' }]);
    expect(errors).toEqual([]);
    expect(agents.map(a => `${a.id}:${a.name}`)).toEqual(['claude:Mine', 'opencode:OpenCode', 'copilot:Copilot', 'gemini:Gemini', 'qwen:Qwen Code', 'goose:Goose', 'x:X']);
  });

  it('skips and reports an entry missing a field or {id}', () => {
    const { agents, errors } = resolveAgents([{ ...codex, name: '' }, { ...codex, start: 'x' }, 'junk']);
    expect(agents).toEqual([...BUILTIN_AGENTS]);
    expect(errors).toHaveLength(3);
  });

  it('is the built-ins when nothing is configured', () => {
    expect(resolveAgents(undefined)).toEqual({ agents: [...BUILTIN_AGENTS], errors: [] });
  });
});

describe('startFolder', () => {
  it('takes the first non-blank candidate', () => {
    expect(startFolder(undefined, ' ', 'C:\\default', 'C:\\home')).toBe('C:\\default');
    expect(startFolder('C:\\group', 'C:\\default')).toBe('C:\\group');
    expect(startFolder(undefined, '')).toBe('');
  });
});

describe('ageLabel', () => {
  const created = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).toISOString();
  it('is today on the same local day', () => {
    expect(ageLabel(created(30, 0, 5), new Date(2026, 9, 30, 23, 59))).toBe('today');
  });
  it('counts calendar days, not 24-hour spans', () => {
    expect(ageLabel(created(29, 23, 50), new Date(2026, 9, 30, 0, 10))).toBe('1 day');
  });
  it('is N days', () => {
    expect(ageLabel(created(25, 12, 0), new Date(2026, 9, 30, 8, 0))).toBe('5 days');
  });
});

describe('dateName', () => {
  it('is the local date and time, zero-padded', () => {
    expect(dateName(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07');
  });
});

describe('groupForFolder', () => {
  const g = (id: string, folder?: string) => ({ id, name: id, before: '', shellPath: '', ...(folder === undefined ? {} : { folder }) });
  const groups = [g('none'), g('blank', ' '), g('win', 'C:\\Work\\Api'), g('unix', '/home/me/web/')];

  it('finds the group starting in the folder', () => {
    expect(groupForFolder(groups, '/home/me/web', false)?.id).toBe('unix');
    expect(groupForFolder(groups, '/home/me/Web', false)).toBeUndefined();
    expect(groupForFolder(groups, '/home/me', false)).toBeUndefined();
  });

  it('ignores case and slashes on Windows', () => {
    expect(groupForFolder(groups, 'c:/work/api/', true)?.id).toBe('win');
    expect(groupForFolder(groups, 'C:\\Work\\Api', false)?.id).toBe('win');
    expect(groupForFolder(groups, 'c:\\work\\api', false)).toBeUndefined();
  });

  it('reads the folder of a lone cd in the before command', () => {
    const cd = (id: string, before: string) => ({ id, name: id, before, shellPath: '' });
    const older = [cd('chain', 'cd C:/a && npm i'), cd('plain', 'cd C:/a'), cd('quoted', 'cd /d "C:\\My Work"')];
    expect(groupForFolder(older, 'c:\\a', true)?.id).toBe('plain');
    expect(groupForFolder(older, 'C:\\My Work', true)?.id).toBe('quoted');
    expect(groupForFolder([{ ...cd('both', 'cd C:/a'), folder: 'C:/b' }], 'C:/a', true)).toBeUndefined();
  });
});
