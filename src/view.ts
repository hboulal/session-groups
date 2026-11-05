import { ageLabel, type Agent, type Group, type Session } from './model';
import type { State } from './store';

// The root node that holds the sessions without a group, so they never look like part of the last group.
export interface UngroupedNode { kind: 'ungrouped' }
export const UNGROUPED: UngroupedNode = { kind: 'ungrouped' };

// True when the session's terminal is open; also used for counts and the active filter.
export type IsActive = (sessionId: string) => boolean;

// Archived sessions whose group exists or is '' (the others are hidden like any orphan), in stored order.
export function archivedChildren(state: State): Session[] {
  return state.sessions.filter(s => s.archived === true && (s.groupId === '' || state.groups.some(g => g.id === s.groupId)));
}

// Groups, then the ungrouped sessions, in stored order; archived sessions have their own view. With the active filter on, inactive sessions are hidden.
// The Archived view by group: the groups that have archived sessions, then Ungrouped when an ungrouped one is archived.
export function archivedRoot(state: State): (Group | UngroupedNode)[] {
  const archived = archivedChildren(state);
  return [...state.groups.filter(g => archived.some(s => s.groupId === g.id)), ...(archived.some(s => s.groupId === '') ? [UNGROUPED] : [])];
}

export function archivedOf(state: State, groupId: string): Session[] {
  return archivedChildren(state).filter(s => s.groupId === groupId);
}

export function rootChildren(state: State, isActive?: IsActive): (Group | Session)[] {
  const ungrouped = state.sessions.filter(s => s.groupId === '' && s.archived !== true && (!isActive || isActive(s.id)));
  return [...state.groups, ...ungrouped];
}

// Without group rows: every group's sessions in group order, then the ungrouped ones.
export function flatChildren(state: State, isActive?: IsActive): Session[] {
  return rootChildren(state, isActive).flatMap(node => 'groupId' in node ? [node] : groupChildren(state, node.id, isActive));
}

// A session's label in the flat list: its group's name in front, when it has one.
export function flatLabel(state: State, s: Session): string {
  const group = state.groups.find(g => g.id === s.groupId);
  return group ? (s.name === '' ? group.name : `${group.name}/${s.name}`) : s.name;
}

// Group icon colours, in the order new groups take them; green is left to active sessions.
export const GROUP_COLORS = ['charts.blue', 'charts.purple', 'charts.orange', 'charts.yellow', 'charts.red'] as const;

// A group's own colour, or one from its position for a group stored without one.
export function groupColor(state: State, group: Group): string {
  return group.color ?? GROUP_COLORS[Math.max(0, state.groups.findIndex(g => g.id === group.id)) % GROUP_COLORS.length]!;
}

// The grouped view's root: the groups, then Ungrouped; empty only without groups or non-archived ungrouped sessions.
export function groupedRoot(state: State): (Group | UngroupedNode)[] {
  if (state.groups.length === 0 && ungroupedChildren(state).length === 0) { return []; }
  return [...state.groups, UNGROUPED];
}

export function ungroupedChildren(state: State, isActive?: IsActive): Session[] {
  return rootChildren(state, isActive).filter((n): n is Session => 'groupId' in n);
}

export function groupChildren(state: State, groupId: string, isActive?: IsActive): Session[] {
  return state.sessions.filter(s => s.groupId === groupId && s.archived !== true && (!isActive || isActive(s.id)));
}

export function groupCount(state: State, groupId: string, isActive?: IsActive): number {
  return groupChildren(state, groupId, isActive).length;
}

export function groupDescription(state: State, groupId: string, isActive: IsActive): string {
  const total = groupCount(state, groupId);
  const active = groupCount(state, groupId, isActive);
  return active > 0 ? `${total} · ${active} active` : String(total);
}

export interface SearchItem { id: string; label: string; description: string }
export interface SearchSection { label: string; items: SearchItem[] }

// Non-empty sections in tree order, with openable sessions in stored order.
export function searchItems(state: State, now: Date, agents: readonly Agent[]): SearchSection[] {
  return [...state.groups, { id: '', name: 'Ungrouped' }].map(g => ({
    label: g.name,
    items: groupChildren(state, g.id).map(s => ({ id: s.id, label: s.name, description: sessionDescription(state, s, now, false, agents) })),
  })).filter(section => section.items.length > 0);
}

// Age, preceded by the group when asked, and the agent except for Claude.
export function sessionDescription(state: State, s: Session, now: Date, withGroup: boolean, agents: readonly Agent[]): string {
  const age = ageLabel(s.createdAt, now);
  const group = withGroup ? state.groups.find(g => g.id === s.groupId) : undefined;
  const description = group ? `${group.name} · ${age}` : age;
  return s.agentId === 'claude' ? description : `${agents.find(a => a.id === s.agentId)?.name ?? s.agentId} · ${description}`;
}

// Active, non-archived sessions whose group exists or is '' (the same ones the tree can show).
export function activeCount(state: State, isActive: IsActive): number {
  return state.sessions.filter(s => s.archived !== true && (s.groupId === '' || state.groups.some(g => g.id === s.groupId)) && isActive(s.id)).length;
}
