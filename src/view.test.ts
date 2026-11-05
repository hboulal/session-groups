import { describe, it, expect } from 'vitest';
import { UNGROUPED, archivedOf, archivedRoot, groupedRoot, ungroupedChildren, activeCount, flatChildren, flatLabel, GROUP_COLORS, groupColor, archivedChildren, groupCount, groupDescription, groupChildren, rootChildren, searchItems, sessionDescription } from './view';
import { CLAUDE, OPENCODE, type Group, type Session } from './model';
import type { State } from './store';

const group = (id: string, name: string): Group => ({ id, name, before: '', shellPath: '' });
const session = (id: string, groupId: string, createdAt: string, archived?: boolean): Session => ({ id, groupId, name: id, before: '', shellPath: '', cwd: '/w', agentId: 'claude', createdAt, ...(archived === undefined ? {} : { archived }) });

describe('flatChildren and flatLabel', () => {
  it('lists sessions by group order without group rows, and prefixes the group name', () => {
    const state = {
      version: 1 as const,
      groups: [{ id: 'g2', name: 'api', before: '', shellPath: '' }, { id: 'g1', name: 'web', before: '', shellPath: '' }],
      sessions: [session('a', 'g1', '2026-10-01T00:00:00Z', false), session('b', 'g2', '2026-10-01T00:00:00Z', false), session('u', '', '2026-10-01T00:00:00Z', false), session('x', 'g2', '2026-10-01T00:00:00Z', true)],
    };
    expect(flatChildren(state).map(x => x.id)).toEqual(['b', 'a', 'u']);
    expect(flatChildren(state, id => id === 'a').map(x => x.id)).toEqual(['a']);
    expect(flatLabel(state, state.sessions[1]!, false)).toBe('api/b');
    expect(flatLabel(state, state.sessions[2]!, false)).toBe('u');
    expect(flatLabel(state, { ...state.sessions[1]!, name: '' }, false)).toBe('api');
  });

  it('leaves the group name out when the icon carries the group colour', () => {
    const state: State = { version: 1, groups: [group('g1', 'api')], sessions: [] };
    expect(flatLabel(state, session('a', 'g1', '2026-10-01T00:00:00Z'), true)).toBe('a');
    expect(flatLabel(state, { ...session('a', 'g1', '2026-10-01T00:00:00Z'), name: '' }, true)).toBe('api');
    expect(flatLabel(state, session('u', '', '2026-10-01T00:00:00Z'), true)).toBe('u');
  });
});

describe('groupedRoot and ungroupedChildren', () => {
  const state: State = {
    version: 1,
    groups: [group('g1', 'alpha')],
    sessions: [session('a', 'g1', '2026-10-01T00:00:00Z'), session('u', '', '2026-10-02T00:00:00Z'), session('v', '', '2026-10-03T00:00:00Z', true)],
  };

  it('lists the groups, then Ungrouped, including when every group is empty', () => {
    expect(groupedRoot(state)).toEqual([state.groups[0], UNGROUPED]);
    expect(groupedRoot({ ...state, sessions: [] })).toEqual([state.groups[0], UNGROUPED]);
    expect(ungroupedChildren(state).map(s => s.id)).toEqual(['u']);
  });

  it('returns an empty root without groups or non-archived ungrouped sessions', () => {
    expect(groupedRoot({ version: 1, groups: [], sessions: [] })).toEqual([]);
    expect(groupedRoot({ version: 1, groups: [], sessions: [session('v', '', '2026-10-03T00:00:00Z', true), session('o', 'gone', '2026-10-03T00:00:00Z')] })).toEqual([]);
  });

  it('keeps Ungrouped for an inactive ungrouped session even when its filtered children are empty', () => {
    const ungrouped = { ...state, groups: [] };
    expect(ungroupedChildren(ungrouped, () => false)).toEqual([]);
    expect(groupedRoot(ungrouped)).toEqual([UNGROUPED]);
  });

  it('filters the ungrouped sessions', () => {
    expect(ungroupedChildren(state, id => id === 'u').map(s => s.id)).toEqual(['u']);
  });
});

describe('archivedRoot and archivedOf', () => {
  it('lists only the groups with archived sessions, then Ungrouped', () => {
    const state: State = {
      version: 1,
      groups: [group('g1', 'alpha'), group('g2', 'beta'), group('g3', 'gamma')],
      sessions: [session('a', 'g2', '2026-10-01T00:00:00Z', true), session('b', 'g1', '2026-10-01T00:00:00Z'), session('u', '', '2026-10-01T00:00:00Z', true), session('c', 'g2', '2026-10-02T00:00:00Z', true)],
    };
    expect(archivedRoot(state)).toEqual([state.groups[1], UNGROUPED]);
    expect(archivedOf(state, 'g2').map(s => s.id)).toEqual(['a', 'c']);
    expect(archivedOf(state, '').map(s => s.id)).toEqual(['u']);
    expect(archivedRoot({ ...state, sessions: [] })).toEqual([]);
  });
});

describe('groupColor', () => {
  it('uses the stored colour, else one from the group position', () => {
    const g = (id: string, color?: string) => ({ id, name: id, before: '', shellPath: '', ...(color ? { color } : {}) });
    const state = { version: 1 as const, groups: [g('a'), g('b', 'charts.red'), g('c')], sessions: [] };
    expect(groupColor(state, state.groups[0]!)).toBe(GROUP_COLORS[0]);
    expect(groupColor(state, state.groups[1]!)).toBe('charts.red');
    expect(groupColor(state, state.groups[2]!)).toBe(GROUP_COLORS[2]);
  });
});

describe('rootChildren', () => {
  it('lists groups, then ungrouped sessions, in stored order', () => {
    const state: State = {
      version: 1,
      groups: [group('g2', 'beta'), group('g1', 'alpha')],
      sessions: [session('old', '', '2026-10-01T00:00:00Z'), session('in-group', 'g1', '2026-10-05T00:00:00Z'), session('new', '', '2026-10-03T00:00:00Z')],
    };
    expect(rootChildren(state).map(x => x.id)).toEqual(['g2', 'g1', 'old', 'new']);
  });

  it('hides sessions whose group does not exist', () => {
    const state: State = { version: 1, groups: [], sessions: [session('orphan', 'gone', '2026-10-01T00:00:00Z')] };
    expect(rootChildren(state)).toEqual([]);
  });
});

describe('archive in the tree', () => {
  const state: State = {
    version: 1,
    groups: [group('g1', 'alpha')],
    sessions: [
      session('a', 'g1', '2026-10-01T00:00:00Z'),
      session('b', 'g1', '2026-10-02T00:00:00Z', true),
      session('u', '', '2026-10-03T00:00:00Z'),
      session('v', '', '2026-10-04T00:00:00Z', true),
      session('o', 'gone', '2026-10-05T00:00:00Z', true),
    ],
  };

  it('hides archived sessions', () => {
    expect(rootChildren(state).map(x => x.id)).toEqual(['g1', 'u']);
  });

  it('lists archived sessions in stored order, ignoring orphans', () => {
    expect(archivedChildren(state).map(x => x.id)).toEqual(['b', 'v']);
  });

  it('group children and count exclude archived', () => {
    expect(groupChildren(state, 'g1').map(x => x.id)).toEqual(['a']);
    expect(groupCount(state, 'g1')).toBe(1);
  });
});

describe('active filter', () => {
  const state: State = {
    version: 1,
    groups: [group('g1', 'alpha'), group('g2', 'beta')],
    sessions: [session('a', 'g1', '2026-10-01T00:00:00Z'), session('b', 'g1', '2026-10-02T00:00:00Z'), session('u', '', '2026-10-03T00:00:00Z'), session('v', '', '2026-10-04T00:00:00Z'), session('z', 'g1', '2026-10-05T00:00:00Z', true)],
  };
  const active = (id: string) => id === 'b' || id === 'v';

  it('keeps groups, hides inactive sessions', () => {
    expect(rootChildren(state, active).map(x => x.id)).toEqual(['g1', 'g2', 'v']);
  });

  it('shows only active sessions in a group and counts them', () => {
    expect(groupChildren(state, 'g1', active).map(x => x.id)).toEqual(['b']);
    expect(groupCount(state, 'g1', active)).toBe(1);
    expect(groupCount(state, 'g2', active)).toBe(0);
  });

  it('shows everything without the filter', () => {
    expect(rootChildren(state).map(x => x.id)).toEqual(['g1', 'g2', 'u', 'v']);
  });
});

describe('searchItems', () => {
  const now = new Date(2026, 9, 30, 12, 0);
  const at = (d: number) => new Date(2026, 9, d, 9, 0).toISOString();
  const state: State = {
    version: 1,
    groups: [group('g2', 'beta'), group('g1', 'alpha'), group('g3', 'empty'), group('g4', 'archived only')],
    sessions: [session('a', 'g1', at(28)), session('u', '', at(30)), session('b', 'g1', at(29), true), session('o', 'gone', at(30)), session('c', 'g2', at(27)), session('d', 'g1', at(29)), session('x', 'g4', at(30), true)],
  };

  it('uses tree order and stored session order, omitting empty sections, archived sessions and orphans', () => {
    expect(searchItems(state, now, [CLAUDE])).toEqual([
      { label: 'beta', items: [{ id: 'c', label: 'c', description: '3 days' }] },
      { label: 'alpha', items: [{ id: 'a', label: 'a', description: '2 days' }, { id: 'd', label: 'd', description: '1 day' }] },
      { label: 'Ungrouped', items: [{ id: 'u', label: 'u', description: 'today' }] },
    ]);
  });

  it('uses configured agent names or unknown ids, omits Claude, and preserves blank session names', () => {
    const sessions = [
      { ...session('a', '', at(30)), name: '' },
      { ...session('b', '', at(29)), agentId: 'opencode' },
      { ...session('c', '', at(28)), agentId: 'unknown' },
    ];
    expect(searchItems({ version: 1, groups: [], sessions }, now, [{ ...CLAUDE, name: 'Custom Claude' }, { ...OPENCODE, name: 'Custom OpenCode' }])).toEqual([
      { label: 'Ungrouped', items: [{ id: 'a', label: '', description: 'today' }, { id: 'b', label: 'b', description: 'Custom OpenCode · 1 day' }, { id: 'c', label: 'c', description: 'unknown · 2 days' }] },
    ]);
  });

  it('omits Ungrouped without openable ungrouped sessions and returns no sections for an empty state', () => {
    expect(searchItems({ ...state, sessions: [session('a', 'g1', at(28)), session('u', '', at(30), true)] }, now, [CLAUDE])).toEqual([
      { label: 'alpha', items: [{ id: 'a', label: 'a', description: '2 days' }] },
    ]);
    expect(searchItems({ ...state, sessions: [] }, now, [CLAUDE])).toEqual([]);
  });

  it('shares agent and age formatting with tree rows while preserving the optional group description', () => {
    const s = { ...session('a', 'g1', at(28)), agentId: 'opencode' };
    expect(sessionDescription(state, s, now, true, [OPENCODE])).toBe('OpenCode · alpha · 2 days');
    expect(sessionDescription(state, s, now, false, [OPENCODE])).toBe('OpenCode · 2 days');
  });
});

describe('groupDescription', () => {
  const state: State = {
    version: 1,
    groups: [group('g1', 'alpha'), group('g2', 'empty')],
    sessions: [session('a', 'g1', '2026-10-01T00:00:00Z'), session('b', 'g1', '2026-10-01T00:00:00Z'), session('x', 'g1', '2026-10-01T00:00:00Z', true), session('u', '', '2026-10-01T00:00:00Z'), session('v', '', '2026-10-01T00:00:00Z', true)],
  };

  it('shows the full non-archived total with the positive active count', () => {
    expect(groupDescription(state, 'g1', id => id === 'b' || id === 'x')).toBe('2 · 1 active');
    expect(groupDescription(state, 'g1', () => true)).toBe('2 · 2 active');
    expect(groupDescription(state, '', () => true)).toBe('1 · 1 active');
  });

  it('shows only the total when no non-archived session is active, including zero', () => {
    expect(groupDescription(state, 'g1', id => id === 'x')).toBe('2');
    expect(groupDescription(state, '', id => id === 'v')).toBe('1');
    expect(groupDescription(state, 'g2', () => true)).toBe('0');
  });
});

describe('activeCount', () => {
  const state: State = {
    version: 1,
    groups: [group('g1', 'alpha')],
    sessions: [
      session('a', 'g1', '2026-10-01T00:00:00Z'),
      session('b', '', '2026-10-02T00:00:00Z'),
      session('c', 'g1', '2026-10-03T00:00:00Z', true),
      session('d', 'gone', '2026-10-04T00:00:00Z'),
      session('e', 'g1', '2026-10-05T00:00:00Z'),
    ],
  };

  it('counts active, non-archived sessions whose group exists or is empty', () => {
    expect(activeCount(state, id => ['a', 'b', 'c', 'd'].includes(id))).toBe(2);
  });

  it('is zero when nothing is active', () => {
    expect(activeCount(state, () => false)).toBe(0);
  });
});
