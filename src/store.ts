import { Group, Session } from './model';
import { moveEntry, type Ref } from './order';

export interface Memento { get<T>(key: string): T | undefined; update(key: string, value: unknown): PromiseLike<void> }
export interface State { version: 1; groups: Group[]; sessions: Session[] }
export const STATE_KEY = 'sessionGroups.state';

const GROUP_FIELDS = ['id', 'name', 'before', 'shellPath'];
const SESSION_FIELDS = ['id', 'groupId', 'name', 'before', 'shellPath', 'cwd', 'agentId', 'createdAt'];

function valid<T>(entries: unknown, fields: string[], booleans: string[] = []): T[] {
  if (!Array.isArray(entries)) { return []; }
  return entries.filter(e => e && typeof e === 'object'
    && fields.every(f => typeof (e as Record<string, unknown>)[f] === 'string')
    && booleans.every(f => ['undefined', 'boolean'].includes(typeof (e as Record<string, unknown>)[f]))) as T[];
}

export class Store {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly memento: Memento) {}

  readonly onDidChange = (listener: () => void): { dispose(): void } => {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  };

  read(): State {
    const raw = this.memento.get<{ version?: unknown; groups?: unknown; sessions?: unknown }>(STATE_KEY);
    if (!raw || raw.version !== 1) { return { version: 1, groups: [], sessions: [] }; }
    return { version: 1, groups: valid<Group>(raw.groups, GROUP_FIELDS), sessions: valid<Session>(raw.sessions, SESSION_FIELDS, ['archived']) };
  }

  addGroup(group: Group): Promise<void> {
    return this.write(s => ({ state: { ...s, groups: [...s.groups, group] }, result: undefined }));
  }

  updateGroup(id: string, patch: Partial<Pick<Group, 'name' | 'before' | 'shellPath' | 'color' | 'folder' | 'agentId'>>): Promise<void> {
    return this.write(s => s.groups.some(g => g.id === id)
      ? { state: { ...s, groups: s.groups.map(g => g.id === id ? { ...g, ...patch } : g) }, result: undefined }
      : undefined);
  }

  // Removes the group; its sessions, archived ones included, become ungrouped, or are removed too and returned.
  deleteGroup(id: string, withSessions: boolean): Promise<Session[]> {
    return this.write(s => {
      if (!s.groups.some(g => g.id === id)) { return undefined; }
      const groups = s.groups.filter(g => g.id !== id);
      if (withSessions) {
        return { state: { ...s, groups, sessions: s.sessions.filter(x => x.groupId !== id) }, result: s.sessions.filter(x => x.groupId === id) };
      }
      return { state: { ...s, groups, sessions: s.sessions.map(x => x.groupId === id ? { ...x, groupId: '' } : x) }, result: [] };
    }).then(r => r ?? []);
  }

  addSession(session: Session): Promise<void> {
    return this.write(s => ({ state: { ...s, sessions: [session, ...s.sessions] }, result: undefined }));
  }

  move(dragged: Ref, target: Ref | undefined): Promise<void> {
    return this.write(s => {
      const state = moveEntry(s, dragged, target);
      return state ? { state, result: undefined } : undefined;
    }).then(() => undefined);
  }

  // Points the entry at another agent session; refused when that id is already listed. The new session's title is picked up again.
  changeSessionId(id: string, newId: string): Promise<void> {
    return this.write(s => {
      const other = s.sessions.find(x => x.id === newId);
      if (other) { throw new Error(`that id is already listed as "${other.name || 'unnamed'}"`); }
      if (!s.sessions.some(x => x.id === id)) { return undefined; }
      return { state: { ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, id: newId, agentTitle: undefined } : x) }, result: undefined };
    });
  }

  renameSession(id: string, name: string): Promise<void> {
    return this.write(s => s.sessions.some(x => x.id === id)
      ? { state: { ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, name } : x) }, result: undefined }
      : undefined);
  }

  // Takes a title the agent reports (Claude's /rename) as the name, once per new title, so a rename in the panel holds until the next one.
  applyAgentTitle(id: string, title: string): Promise<void> {
    return this.write(s => s.sessions.some(x => x.id === id && x.agentTitle !== title)
      ? { state: { ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, name: title, agentTitle: title } : x) }, result: undefined }
      : undefined);
  }

  setArchived(id: string, archived: boolean): Promise<void> {
    return this.write(s => s.sessions.some(x => x.id === id)
      ? { state: { ...s, sessions: s.sessions.map(x => x.id === id ? { ...x, archived } : x) }, result: undefined }
      : undefined);
  }

  // Removes every archived session from the list and returns them.
  deleteArchived(): Promise<Session[]> {
    return this.write(s => s.sessions.some(x => x.archived === true)
      ? { state: { ...s, sessions: s.sessions.filter(x => x.archived !== true) }, result: s.sessions.filter(x => x.archived === true) }
      : undefined).then(r => r ?? []);
  }

  deleteSession(id: string): Promise<void> {
    return this.write(s => s.sessions.some(x => x.id === id)
      ? { state: { ...s, sessions: s.sessions.filter(x => x.id !== id) }, result: undefined }
      : undefined);
  }

  // One write at a time; a mutation returning undefined changes nothing and fires nothing.
  private write<R>(mutate: (s: State) => { state: State; result: R } | undefined): Promise<R | undefined> {
    const run = this.chain.then(async () => {
      const raw = this.memento.get<{ version?: unknown }>(STATE_KEY);
      if (raw && raw.version !== 1) { throw new Error(`Unsupported stored state version ${String(raw.version)}`); }
      const change = mutate(this.read());
      if (!change) { return undefined; }
      await this.memento.update(STATE_KEY, change.state);
      this.listeners.forEach(l => l());
      return change.result;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
