import { describe, it, expect } from 'vitest';
import { moveEntry } from './order';
import type { Group, Session } from './model';
import type { State } from './store';

const group = (id: string): Group => ({ id, name: id, before: '', shellPath: '' });
const session = (id: string, groupId: string, archived?: boolean): Session => ({ id, groupId, name: id, before: `b-${id}`, shellPath: `sh-${id}`, cwd: `/${id}`, agentId: 'claude', createdAt: '2026-10-30T00:00:00Z', ...(archived === undefined ? {} : { archived }) });
const state = (groups: string[], sessions: Session[]): State => ({ version: 1, groups: groups.map(group), sessions });
const g = (id: string) => ({ kind: 'group' as const, id });
const s = (id: string) => ({ kind: 'session' as const, id });
const groupIds = (x: State | undefined) => x?.groups.map(y => y.id);
const sessionIds = (x: State | undefined) => x?.sessions.map(y => y.id);

describe('moveEntry groups', () => {
  const base = state(['a', 'b', 'c'], []);

  it('puts a group before the group it is dropped on', () => {
    expect(groupIds(moveEntry(base, g('c'), g('a')))).toEqual(['c', 'a', 'b']);
    expect(groupIds(moveEntry(base, g('a'), g('c')))).toEqual(['b', 'a', 'c']);
  });

  it('puts a group last on empty space', () => {
    expect(groupIds(moveEntry(base, g('a'), undefined))).toEqual(['b', 'c', 'a']);
  });

  it('puts a group before the group of the session it is dropped on', () => {
    const withSession = state(['a', 'b', 'c'], [session('x', 'b')]);
    expect(groupIds(moveEntry(withSession, g('c'), s('x')))).toEqual(['a', 'c', 'b']);
  });

  it('puts a group last when dropped on an ungrouped session', () => {
    const withSession = state(['a', 'b'], [session('u', '')]);
    expect(groupIds(moveEntry(withSession, g('a'), s('u')))).toEqual(['b', 'a']);
  });

  it('does nothing when dropped on an archived session', () => {
    const withSession = state(['a', 'b'], [session('z', 'b', true)]);
    expect(moveEntry(withSession, g('a'), s('z'))).toBeUndefined();
  });

  it('refuses itself, no-ops, unknown ids', () => {
    expect(moveEntry(base, g('a'), g('a'))).toBeUndefined();
    expect(moveEntry(base, g('c'), undefined)).toBeUndefined();
    expect(moveEntry(base, g('a'), g('b'))).toBeUndefined();
    expect(moveEntry(base, g('zz'), undefined)).toBeUndefined();
    expect(moveEntry(base, g('a'), g('zz'))).toBeUndefined();
  });
});

describe('moveEntry sessions', () => {
  const base = state(['g1', 'g2'], [session('a', 'g1'), session('b', 'g1'), session('c', 'g2'), session('u', ''), session('v', '')]);

  it('puts a session before another session, in that session group', () => {
    const next = moveEntry(base, s('a'), s('c'));
    expect(sessionIds(next)).toEqual(['b', 'a', 'c', 'u', 'v']);
    expect(next?.sessions.find(x => x.id === 'a')?.groupId).toBe('g2');
  });

  it('moves into the ungrouped list when dropped before an ungrouped session', () => {
    const next = moveEntry(base, s('a'), s('v'));
    expect(next?.sessions.find(x => x.id === 'a')?.groupId).toBe('');
    expect(sessionIds(next)).toEqual(['b', 'c', 'u', 'a', 'v']);
  });

  it('reorders within the same group', () => {
    expect(sessionIds(moveEntry(base, s('b'), s('a')))).toEqual(['b', 'a', 'c', 'u', 'v']);
  });

  it('keeps before, cwd and shellPath when changing group', () => {
    const moved = moveEntry(base, s('a'), s('c'))?.sessions.find(x => x.id === 'a');
    expect(moved).toMatchObject({ before: 'b-a', cwd: '/a', shellPath: 'sh-a' });
  });

  it('moves to the end of a group dropped on', () => {
    const next = moveEntry(base, s('c'), g('g1'));
    expect(next?.sessions.find(x => x.id === 'c')?.groupId).toBe('g1');
    expect(sessionIds(next)).toEqual(['a', 'b', 'c', 'u', 'v']);
  });

  it('moves to the end of an empty group', () => {
    const next = moveEntry(state(['g1', 'g2'], [session('a', 'g1')]), s('a'), g('g2'));
    expect(next?.sessions[0]).toMatchObject({ id: 'a', groupId: 'g2' });
  });

  it('makes the session ungrouped, last, on empty space', () => {
    const next = moveEntry(base, s('a'), undefined);
    expect(next?.sessions.find(x => x.id === 'a')?.groupId).toBe('');
    expect(sessionIds(next)).toEqual(['b', 'c', 'u', 'v', 'a']);
  });

  it('refuses itself, no-ops, unknown ids', () => {
    expect(moveEntry(base, s('a'), s('a'))).toBeUndefined();
    expect(moveEntry(base, s('a'), s('b'))).toBeUndefined();
    expect(moveEntry(base, s('v'), undefined)).toBeUndefined();
    expect(moveEntry(base, s('b'), g('g1'))).toBeUndefined();
    expect(moveEntry(base, s('zz'), undefined)).toBeUndefined();
    expect(moveEntry(base, s('a'), s('zz'))).toBeUndefined();
    expect(moveEntry(base, s('a'), g('zz'))).toBeUndefined();
  });

  it('refuses archived sessions as dragged or target', () => {
    const arch = state(['g1'], [session('a', 'g1'), session('z', 'g1', true)]);
    expect(moveEntry(arch, s('z'), undefined)).toBeUndefined();
    expect(moveEntry(arch, s('a'), s('z'))).toBeUndefined();
  });
});
