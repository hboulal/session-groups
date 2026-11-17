import type { Session } from './model';
import type { State } from './store';

export interface Ref { kind: 'group' | 'session'; id: string }

const layout = (s: State) => JSON.stringify([s.groups.map(g => g.id), s.sessions.map(x => [x.id, x.groupId])]);

// The state after dropping `dragged` on `target` (undefined = empty space), or undefined when nothing changes or the move is not allowed.
// A drop across the pinned and unpinned bands is refused.
export function moveEntry(state: State, dragged: Ref, target: Ref | undefined): State | undefined {
  if (target?.kind === 'session' && state.sessions.find(x => x.id === target.id)?.archived === true) { return undefined; }
  const next = dragged.kind === 'group' ? moveGroup(state, dragged.id, target) : moveSession(state, dragged.id, target);
  return next && layout(next) !== layout(state) ? next : undefined;
}

function moveGroup(state: State, id: string, target: Ref | undefined): State | undefined {
  const moving = state.groups.find(g => g.id === id);
  if (!moving) { return undefined; }
  const session = target?.kind === 'session' ? state.sessions.find(x => x.id === target.id) : undefined;
  const onGroup = target?.kind === 'group' ? target : session && state.groups.some(g => g.id === session.groupId) ? { id: session.groupId } : undefined;
  if (onGroup && (onGroup.id === id || !state.groups.some(g => g.id === onGroup.id))) { return undefined; }
  const rest = state.groups.filter(g => g.id !== id);
  const at = onGroup ? rest.findIndex(g => g.id === onGroup.id) : rest.length;
  return { ...state, groups: [...rest.slice(0, at), moving, ...rest.slice(at)] };
}

function moveSession(state: State, id: string, target: Ref | undefined): State | undefined {
  const moving = state.sessions.find(x => x.id === id);
  if (!moving || moving.archived === true) { return undefined; }
  const rest = state.sessions.filter(x => x.id !== id);
  if (target?.kind === 'session') {
    const before = rest.find(x => x.id === target.id);
    if (!before || before.archived === true) { return undefined; }
    if ((before.pinned === true) !== (moving.pinned === true)) { return undefined; }
    const at = rest.indexOf(before);
    return { ...state, sessions: [...rest.slice(0, at), { ...moving, groupId: before.groupId }, ...rest.slice(at)] };
  }
  const groupId = target ? target.id : '';
  if (target && !state.groups.some(g => g.id === groupId)) { return undefined; }
  const last = rest.map(x => x.groupId).lastIndexOf(groupId);
  const at = target && last >= 0 ? last + 1 : rest.length;
  return { ...state, sessions: [...rest.slice(0, at), { ...moving, groupId }, ...rest.slice(at)] };
}

// The sessions with each listed group's non-archived sessions reordered pinned first, inside the positions they already hold.
// Each band keeps its order; other lists and archived sessions keep their positions.
export function settleBands(sessions: readonly Session[], groupIds: ReadonlySet<string>): Session[] {
  const next = [...sessions];
  for (const groupId of groupIds) {
    const slots = sessions.flatMap((x, i) => x.groupId === groupId && x.archived !== true ? [i] : []);
    const listed = slots.map(i => sessions[i]!);
    const settled = [...listed.filter(x => x.pinned === true), ...listed.filter(x => x.pinned !== true)];
    slots.forEach((i, k) => { next[i] = settled[k]!; });
  }
  return next;
}
