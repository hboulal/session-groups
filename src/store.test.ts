import { describe, it, expect } from 'vitest';
import { Store, STATE_KEY, Memento } from './store';
import { Group, Session } from './model';

class FakeMemento implements Memento {
  data = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.data.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { await Promise.resolve(); this.data.set(key, value); }
}

const group = (id: string, name = id): Group => ({ id, name, before: '', shellPath: '' });
const session = (id: string, groupId: string): Session => ({ id, groupId, name: id, before: '', shellPath: '', cwd: '/w', agentId: 'claude', createdAt: '2026-10-30T00:00:00Z' });

describe('Store', () => {
  it('reads the empty state when nothing is stored', () => {
    expect(new Store(new FakeMemento()).read()).toEqual({ version: 1, groups: [], sessions: [] });
  });

  it('adds, updates and deletes a group', async () => {
    const s = new Store(new FakeMemento());
    await s.addGroup(group('g1', 'one'));
    await s.updateGroup('g1', { name: 'renamed', before: 'nvm use' });
    expect(s.read().groups).toEqual([{ id: 'g1', name: 'renamed', before: 'nvm use', shellPath: '' }]);
    await s.deleteGroup('g1', false);
    expect(s.read().groups).toEqual([]);
  });

  it('adds, renames and deletes a session', async () => {
    const s = new Store(new FakeMemento());
    await s.addSession(session('s1', 'g1'));
    await s.renameSession('s1', 'new name');
    expect(s.read().sessions[0]!.name).toBe('new name');
    await s.deleteSession('s1');
    expect(s.read().sessions).toEqual([]);
  });

  it('deleteGroup moves all its sessions to ungrouped', async () => {
    const s = new Store(new FakeMemento());
    await s.addGroup(group('g1'));
    await s.addGroup(group('g2'));
    await s.addSession(session('a', 'g1'));
    await s.addSession(session('b', 'g2'));
    await s.addSession({ ...session('old', 'g1'), archived: true });
    expect(await s.deleteGroup('g1', false)).toEqual([]);
    expect(s.read().groups.map(g => g.id)).toEqual(['g2']);
    expect(s.read().sessions.map(x => `${x.id}:${x.groupId}`)).toEqual(['old:', 'b:g2', 'a:']);
  });

  it('deleteGroup with its sessions removes and returns them all, archived included', async () => {
    const s = new Store(new FakeMemento());
    await s.addGroup(group('g1'));
    await s.addSession(session('u', ''));
    await s.addSession(session('a', 'g1'));
    await s.addSession({ ...session('old', 'g1'), archived: true });
    expect((await s.deleteGroup('g1', true)).map(x => x.id).sort()).toEqual(['a', 'old']);
    expect(s.read().sessions.map(x => x.id)).toEqual(['u']);
  });

  it('keeps an ungrouped session on read and through deleteGroup', async () => {
    const s = new Store(new FakeMemento());
    await s.addGroup(group('g1'));
    await s.addSession(session('u', ''));
    await s.addSession(session('a', 'g1'));
    expect(s.read().sessions.map(x => x.id)).toEqual(['a', 'u']);
    expect((await s.deleteGroup('g1', true)).map(x => x.id)).toEqual(['a']);
    expect(s.read().sessions.map(x => x.id)).toEqual(['u']);
  });

  it('appends a group and puts a new session first', async () => {
    const s = new Store(new FakeMemento());
    await s.addGroup(group('g1'));
    await s.addGroup(group('g2'));
    await s.addSession(session('a', 'g1'));
    await s.addSession(session('b', 'g1'));
    expect(s.read().groups.map(g => g.id)).toEqual(['g1', 'g2']);
    expect(s.read().sessions.map(x => x.id)).toEqual(['b', 'a']);
  });

  it('moves an entry, and writes nothing for a no-op or forbidden move', async () => {
    const s = new Store(new FakeMemento());
    await s.addGroup(group('g1'));
    await s.addGroup(group('g2'));
    let fired = 0;
    s.onDidChange(() => { fired++; });
    await s.move({ kind: 'group', id: 'g2' }, { kind: 'group', id: 'g1' });
    expect(s.read().groups.map(g => g.id)).toEqual(['g2', 'g1']);
    expect(fired).toBe(1);
    await s.move({ kind: 'group', id: 'g2' }, { kind: 'group', id: 'g2' });
    await s.move({ kind: 'group', id: 'g2' }, { kind: 'group', id: 'g1' });
    await s.move({ kind: 'session', id: 'nope' }, undefined);
    expect(fired).toBe(1);
  });

  it('persists concurrent writes that are not awaited one by one', async () => {
    const s = new Store(new FakeMemento());
    await Promise.all([s.addGroup(group('g1')), s.addSession(session('s1', 'g1'))]);
    expect(s.read().groups).toHaveLength(1);
    expect(s.read().sessions).toHaveLength(1);
  });

  it('skips an entry missing a string field and reads its neighbour', () => {
    const m = new FakeMemento();
    m.data.set(STATE_KEY, { version: 1, groups: [{ id: 'x', before: '', shellPath: '' }, group('ok')], sessions: [] });
    expect(new Store(m).read().groups.map(g => g.id)).toEqual(['ok']);
  });

  it('refuses writes on an unknown version and leaves it untouched', async () => {
    const m = new FakeMemento();
    const stored = { version: 2, groups: [group('g')], sessions: [] };
    m.data.set(STATE_KEY, stored);
    const s = new Store(m);
    expect(s.read()).toEqual({ version: 1, groups: [], sessions: [] });
    await expect(s.addGroup(group('n'))).rejects.toThrow(/version 2/);
    expect(m.data.get(STATE_KEY)).toBe(stored);
  });

  it('a rejected write does not break later writes', async () => {
    const m = new FakeMemento();
    m.data.set(STATE_KEY, { version: 2 });
    const s = new Store(m);
    await expect(s.addGroup(group('a'))).rejects.toThrow();
    m.data.delete(STATE_KEY);
    await s.addGroup(group('b'));
    expect(s.read().groups.map(g => g.id)).toEqual(['b']);
  });

  it('fires onDidChange once per write, not for unknown ids, and stops after dispose', async () => {
    const s = new Store(new FakeMemento());
    let n = 0;
    const d = s.onDidChange(() => n++);
    await s.addGroup(group('g1'));
    expect(n).toBe(1);
    await s.renameSession('nope', 'x');
    await s.updateGroup('nope', { name: 'x' });
    await s.deleteSession('nope');
    expect(await s.deleteGroup('nope', true)).toEqual([]);
    expect(n).toBe(1);
    d.dispose();
    await s.addGroup(group('g2'));
    expect(n).toBe(1);
  });

  it('archives and unarchives a session, ignoring unknown ids', async () => {
    const m = new FakeMemento();
    const s = new Store(m);
    await s.addSession(session('s1', 'g1'));
    let fired = 0;
    s.onDidChange(() => { fired++; });
    await s.setArchived('s1', true);
    expect(s.read().sessions[0]?.archived).toBe(true);
    await s.setArchived('s1', false);
    expect(s.read().sessions[0]?.archived).toBe(false);
    expect(fired).toBe(2);
    await s.setArchived('nope', true);
    expect(fired).toBe(2);
  });

  it('changeSessionId moves the entry to the new id and refuses a listed one', async () => {
    const s = new Store(new FakeMemento());
    await s.addSession({ ...session('a', 'g1'), agentTitle: 't' });
    await s.addSession(session('b', 'g1'));
    await s.changeSessionId('a', 'c');
    expect(s.read().sessions.map(x => x.id)).toEqual(['b', 'c']);
    expect(s.read().sessions[1]!.agentTitle).toBeUndefined();
    await expect(s.changeSessionId('c', 'b')).rejects.toThrow('already listed');
    expect(s.read().sessions.map(x => x.id)).toEqual(['b', 'c']);
  });

  it('deleteArchived removes and returns only archived sessions', async () => {
    const s = new Store(new FakeMemento());
    await s.addSession(session('keep', 'g1'));
    await s.addSession({ ...session('old', 'g1'), archived: true });
    expect((await s.deleteArchived()).map(x => x.id)).toEqual(['old']);
    expect(s.read().sessions.map(x => x.id)).toEqual(['keep']);
    expect(await s.deleteArchived()).toEqual([]);
  });

  it('applyAgentTitle renames once per new title', async () => {
    const s = new Store(new FakeMemento());
    await s.addSession(session('s1', 'g1'));
    let fired = 0;
    s.onDidChange(() => { fired++; });
    await s.applyAgentTitle('s1', 'from claude');
    expect(s.read().sessions[0]).toMatchObject({ name: 'from claude', agentTitle: 'from claude' });
    await s.renameSession('s1', 'from panel');
    await s.applyAgentTitle('s1', 'from claude');
    expect(s.read().sessions[0]!.name).toBe('from panel');
    await s.applyAgentTitle('s1', 'again');
    expect(s.read().sessions[0]!.name).toBe('again');
    await s.applyAgentTitle('nope', 'x');
    expect(fired).toBe(3);
  });

  it('keeps sessions without archived, drops a non-boolean archived', () => {
    const m = new FakeMemento();
    m.data.set(STATE_KEY, { version: 1, groups: [], sessions: [session('ok', 'g1'), { ...session('yes', 'g1'), archived: true }, { ...session('bad', 'g1'), archived: 'x' }] });
    expect(new Store(m).read().sessions.map(x => x.id)).toEqual(['ok', 'yes']);
  });
});
