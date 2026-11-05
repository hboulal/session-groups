import * as vscode from 'vscode';
import type { Agent, Group, Session } from './model';
import type { State, Store } from './store';
import type { Terminals } from './terminals';
import { archivedChildren, archivedOf, archivedRoot, flatChildren, flatLabel, groupChildren, groupColor, groupDescription, groupedRoot, sessionDescription, UNGROUPED, ungroupedChildren, type IsActive, type UngroupedNode } from './view';

type TreeNode = Group | Session | UngroupedNode;

export class GroupsTree implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly subscriptions: { dispose(): void }[];
  private activeOnly = false;
  private flat = false;
  private colors = true;

  constructor(private readonly store: Store, private readonly terminals: Terminals, private readonly agents: () => readonly Agent[], private readonly env: TreeEnv) {
    this.subscriptions = [store.onDidChange(() => this.changed.fire()), terminals.onDidChange(() => this.changed.fire())];
  }

  setActiveOnly(on: boolean): void {
    this.activeOnly = on;
    this.changed.fire();
  }

  setColors(on: boolean): void {
    this.colors = on;
    this.changed.fire();
  }

  refresh(): void {
    this.changed.fire();
  }

  setFlat(on: boolean): void {
    this.flat = on;
    this.changed.fire();
  }

  private filter(): IsActive | undefined {
    return this.activeOnly ? id => this.terminals.isOpen(id) : undefined;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    const state = this.store.read();
    if (!element) { return this.flat ? flatChildren(state, this.filter()) : groupedRoot(state); }
    if (isUngroupedNode(element)) { return ungroupedChildren(state, this.filter()); }
    if (isSession(element)) { return []; }
    return groupChildren(state, element.id, this.filter());
  }

  // Lets the view reveal a session: its parent is its group, or Ungrouped; in the flat view sessions are roots.
  getParent(element: TreeNode): TreeNode | undefined {
    if (!isSession(element) || this.flat) { return undefined; }
    return element.groupId === '' ? UNGROUPED : this.store.read().groups.find(g => g.id === element.groupId);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const state = this.store.read();
    if (isUngroupedNode(element)) {
      const item = new vscode.TreeItem('Ungrouped', vscode.TreeItemCollapsibleState.Expanded);
      item.id = 'ungrouped';
      item.contextValue = 'ungrouped';
      item.iconPath = groupIcon(state, undefined, this.colors);
      item.description = groupDescription(state, '', id => this.terminals.isOpen(id));
      item.tooltip = groupTooltip(state, undefined, this.terminals, this.env);
      return item;
    }
    if (!isSession(element)) {
      const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Expanded);
      item.tooltip = groupTooltip(state, element, this.terminals, this.env);
      item.iconPath = groupIcon(state, element, this.colors);
      item.id = element.id;
      item.contextValue = 'group';
      item.description = groupDescription(state, element.id, id => this.terminals.isOpen(id));
      return item;
    }
    return sessionItem(state, element, this.flat ? flatLabel(state, element) : element.name, this.terminals, this.agents(), this.env, false);
  }

  // Session tooltips are built on hover, since the last activity is read from the agent's files.
  async resolveTreeItem(item: vscode.TreeItem, element: TreeNode): Promise<vscode.TreeItem> {
    if (isSession(element)) { item.tooltip = await sessionTooltip(this.store.read(), element, this.terminals, this.agents(), this.env, false); }
    return item;
  }

  dispose(): void {
    this.subscriptions.forEach(s => s.dispose());
    this.changed.dispose();
  }
}

// The Archived view: archived sessions in stored order, each with its group and age, or under their groups; they cannot be opened.
type ArchivedNode = Session | Group | UngroupedNode;

export class ArchivedTree implements vscode.TreeDataProvider<ArchivedNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly subscription: { dispose(): void };
  private colors = true;
  private byGroup = false;

  constructor(private readonly store: Store, private readonly terminals: Terminals, private readonly agents: () => readonly Agent[], private readonly env: TreeEnv) {
    this.subscription = store.onDidChange(() => this.changed.fire());
  }

  setColors(on: boolean): void {
    this.colors = on;
    this.changed.fire();
  }

  refresh(): void {
    this.changed.fire();
  }

  setByGroup(on: boolean): void {
    this.byGroup = on;
    this.changed.fire();
  }

  getChildren(element?: ArchivedNode): ArchivedNode[] {
    const state = this.store.read();
    if (!element) { return this.byGroup ? archivedRoot(state) : archivedChildren(state); }
    if (isUngroupedNode(element)) { return archivedOf(state, ''); }
    if (isSession(element)) { return []; }
    return archivedOf(state, element.id);
  }

  getTreeItem(element: ArchivedNode): vscode.TreeItem {
    const state = this.store.read();
    if (isSession(element)) { return sessionItem(state, element, element.name, this.terminals, this.agents(), this.env, true, !this.byGroup); }
    const ungrouped = isUngroupedNode(element);
    const item = new vscode.TreeItem(ungrouped ? 'Ungrouped' : element.name, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `archived:${ungrouped ? 'ungrouped' : element.id}`;
    item.contextValue = 'archivedGroup';
    item.iconPath = groupIcon(state, ungrouped ? undefined : element, this.colors);
    item.description = String(archivedOf(state, ungrouped ? '' : element.id).length);
    return item;
  }

  async resolveTreeItem(item: vscode.TreeItem, element: ArchivedNode): Promise<vscode.TreeItem> {
    if (isSession(element)) { item.tooltip = await sessionTooltip(this.store.read(), element, this.terminals, this.agents(), this.env, true); }
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}

// What rows need from outside the store: icons, the configured default folder and agent, when a session last changed, and
// whose turn it is in a running session ('unseen': it finished while its terminal was not in front).
export type SessionTurn = 'working' | 'done' | 'unseen';
export interface TreeEnv {
  activeIcon: ActiveIcon;
  unseenIcon: ActiveIcon;
  turn(sessionId: string): SessionTurn | undefined;
  defaultFolder(): string | undefined;
  agentFor(group: Group | undefined): Agent | undefined;
  lastActivity(session: Session): Promise<Date | undefined>;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateTime = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;

// The folder a group's new sessions start in; '' when neither the group nor the settings give one.
function groupFolder(group: Group | undefined, hover: TreeEnv): { folder: string; isDefault: boolean } {
  return group?.folder ? { folder: group.folder, isDefault: false } : { folder: hover.defaultFolder() ?? '', isDefault: true };
}

function groupTooltip(state: State, group: Group | undefined, terminals: Terminals, hover: TreeEnv): vscode.MarkdownString {
  const tip = new vscode.MarkdownString();
  tip.appendMarkdown('**').appendText(group?.name ?? 'Ungrouped').appendMarkdown('**\n\n');
  const { folder, isDefault } = groupFolder(group, hover);
  if (folder !== '') { tip.appendText(folder).appendMarkdown(isDefault ? ' (default folder)\n\n' : '\n\n'); }
  const agent = hover.agentFor(group);
  if (agent) { tip.appendText(agent.name).appendMarkdown(group?.agentId ? '\n\n' : ' (default agent)\n\n'); }
  tip.appendText(groupDescription(state, group?.id ?? '', id => terminals.isOpen(id)).replace(/^(\d+)/, n => `${n} session${n === '1' ? '' : 's'}`));
  return tip;
}

// Agent and state, creation and last activity; the folder only when it is not the one its group starts in.
async function sessionTooltip(state: State, s: Session, terminals: Terminals, agents: readonly Agent[], hover: TreeEnv, archived: boolean): Promise<vscode.MarkdownString> {
  const tip = new vscode.MarkdownString();
  tip.appendMarkdown('**').appendText(s.name || 'unnamed').appendMarkdown('**\n\n');
  tip.appendText(agents.find(a => a.id === s.agentId)?.name ?? s.agentId).appendMarkdown(` · ${archived ? 'archived' : stateText(terminals.isOpen(s.id), hover.turn(s.id))}\n\n`);
  tip.appendMarkdown(`Created ${dateTime(new Date(s.createdAt))}\n\n`);
  const last = await hover.lastActivity(s).catch(() => undefined);
  if (last) { tip.appendMarkdown(`Last active ${dateTime(last)}\n\n`); }
  const group = state.groups.find(g => g.id === s.groupId);
  if (s.cwd !== groupFolder(group, hover).folder) { tip.appendText(s.cwd).appendMarkdown('\n\n'); }
  if (s.before.trim() !== '') { tip.appendText(s.before).appendMarkdown('\n\n'); }
  tip.appendText(s.id);
  if (archived) { tip.appendMarkdown('\n\nUnarchive to open'); }
  return tip;
}

function stateText(open: boolean, turn: SessionTurn | undefined): string {
  if (!open) { return 'not running'; }
  return turn === 'working' ? 'working' : turn === 'unseen' ? 'finished, not seen yet' : turn === 'done' ? 'running, your turn' : 'running';
}

// A group's coloured dot (Ungrouped: an outline), or none while colours are hidden.
function groupIcon(state: State, group: Group | undefined, colors: boolean): vscode.ThemeIcon | undefined {
  if (!colors) { return undefined; }
  return group ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(groupColor(state, group))) : new vscode.ThemeIcon('circle-outline');
}

// The active icon is an image, not a coloured codicon: a selected row repaints codicons in the selection colour, an image keeps its green.
export type ActiveIcon = { light: vscode.Uri; dark: vscode.Uri };

function sessionItem(state: State, element: Session, label: string, terminals: Terminals, agents: readonly Agent[], env: TreeEnv, archived: boolean, withGroup = archived): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.id = element.id;
  const active = terminals.isOpen(element.id);
  const turn = active ? env.turn(element.id) : undefined;
  item.iconPath = turn === 'working' ? new vscode.ThemeIcon('loading~spin') : turn === 'unseen' ? env.unseenIcon : active ? env.activeIcon : new vscode.ThemeIcon(archived ? 'archive' : 'history');
  item.contextValue = archived ? 'archivedSession' : active ? 'activeSession' : 'session';
  item.description = sessionDescription(state, element, new Date(), withGroup, agents);
  if (!archived) { item.command = { command: 'sessionGroups.openSession', title: 'Open Session', arguments: [element] }; }
  return item;
}

export const DND_MIME = 'application/vnd.code.tree.sessiongroups.groups';

// Drag a group or a session onto a group, a session, the Ungrouped node or empty space to reorder.
export class GroupsDragAndDrop implements vscode.TreeDragAndDropController<TreeNode> {
  readonly dragMimeTypes = [DND_MIME];
  readonly dropMimeTypes = [DND_MIME];

  constructor(private readonly store: Store, private readonly onError: (e: unknown) => void) {}

  handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer): void {
    const node = source[0];
    if (!node || source.length !== 1 || isUngroupedNode(node) || (isSession(node) && node.archived === true)) { return; }
    dataTransfer.set(DND_MIME, new vscode.DataTransferItem({ kind: isSession(node) ? 'session' : 'group', id: node.id }));
  }

  async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const value = dataTransfer.get(DND_MIME)?.value as { kind?: unknown; id?: unknown } | undefined;
    if (typeof value?.id !== 'string' || (value.kind !== 'group' && value.kind !== 'session')) { return; }
    const dragged: { kind: 'group' | 'session'; id: string } = { kind: value.kind, id: value.id };
    // Onto the Ungrouped node: the same as onto empty space.
    if (target && isUngroupedNode(target)) { target = undefined; }
    try {
      await this.store.move(dragged, target ? { kind: isSession(target) ? 'session' : 'group', id: target.id } : undefined);
    } catch (e) { this.onError(e); }
  }
}

function isSession(element: TreeNode): element is Session {
  return 'groupId' in element;
}

function isUngroupedNode(element: TreeNode): element is UngroupedNode {
  return 'kind' in element && element.kind === 'ungrouped';
}
