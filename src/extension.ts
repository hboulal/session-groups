import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CLAUDE, OPENCODE, dateName, groupsForFolder, idProblem, newSessionId, resolveAgents, startFolder, type Agent, type Group, type Session } from './model';
import { markedName } from './icons';
import { Store } from './store';
import { activeCount, archivedChildren, GROUP_COLORS, groupColor, searchItems } from './view';
import { Terminals } from './terminals';
import { openCodeDb, openCodeTurn } from './opencode';
import { claudeConfigDir, findTranscript, lastCustomTitle, lastCwd, lastTurn, readTail, type Turn } from './title';
import { ArchivedTree, GroupsDragAndDrop, GroupsTree, type SessionTurn, type TreeEnv } from './tree';

function isGroup(x: unknown): x is Group {
  return !!x && typeof x === 'object' && 'shellPath' in x && !('groupId' in x);
}

function isSession(x: unknown): x is Session {
  return !!x && typeof x === 'object' && 'groupId' in x;
}

function showError(e: unknown): void {
  void vscode.window.showErrorMessage(`Session Groups: ${e instanceof Error ? e.message : String(e)}`);
}

export function activate(context: vscode.ExtensionContext): void {
  const store = new Store(context.globalState);
  const terminals = new Terminals(context.workspaceState, id => store.read().sessions.some(s => s.id === id));
  const config = () => vscode.workspace.getConfiguration('sessionGroups');
  const agents = (): Agent[] => resolveAgents(config().get('agents')).agents;
  const reportAgentErrors = (): void => {
    const { errors } = resolveAgents(config().get('agents'));
    if (errors.length > 0) { showError(new Error(`sessionGroups.agents: ${errors.join('; ')}`)); }
  };
  reportAgentErrors();
  // A group's own agent, else the configured default, else Claude.
  const agentFor = (group: Group | undefined): Agent | undefined => {
    const id = group?.agentId ?? config().get<string>('defaultAgent') ?? CLAUDE.id;
    return agents().find(a => a.id === id);
  };
  const pickAgent = async (placeHolder: string): Promise<Agent | undefined> =>
    (await vscode.window.showQuickPick(agents().map(a => ({ label: a.name, description: a.id, agent: a })), { placeHolder }))?.agent;

  const activeIcon = { light: vscode.Uri.joinPath(context.extensionUri, 'media', 'active-light.svg'), dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'active-dark.svg') };
  // Last activity is the transcript's modification time; only Claude's transcript is known.
  const unseenIcon = { light: vscode.Uri.joinPath(context.extensionUri, 'media', 'unseen-light.svg'), dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'unseen-dark.svg') };
  const markedDir = vscode.Uri.joinPath(context.extensionUri, 'media', 'marked');
  // Whose turn it is in each running Claude or OpenCode session, from the agent's own records; 'unseen' marks a finish not looked at yet.
  const turns = new Map<string, Turn>();
  const unseen = new Set<string>();
  const hover: TreeEnv = {
    activeIcon,
    unseenIcon,
    markedIcon: (kind, color) => ({ light: vscode.Uri.joinPath(markedDir, markedName(kind, color, 'light')), dark: vscode.Uri.joinPath(markedDir, markedName(kind, color, 'dark')) }),
    turn: (id): SessionTurn | undefined => unseen.has(id) ? 'unseen' : turns.get(id),
    defaultFolder: () => defaultFolder(),
    agentFor: group => agentFor(group),
    lastActivity: async s => {
      if (s.agentId !== CLAUDE.id) { return undefined; }
      const file = await findTranscript(claudeConfigDir(), s.id);
      return file ? (await fs.stat(file)).mtime : undefined;
    },
  };
  const tree = new GroupsTree(store, terminals, agents, hover);
  const archivedTree = new ArchivedTree(store, terminals, agents, hover);
  const archivedView = vscode.window.createTreeView('sessionGroups.archived', { treeDataProvider: archivedTree });
  const updateArchivedCount = (): void => {
    const n = archivedChildren(store.read()).length;
    archivedView.description = n > 0 ? String(n) : '';
  };
  updateArchivedCount();
  const ARCHIVED_BY_GROUP_KEY = 'sessionGroups.archivedByGroup';
  const setArchivedByGroup = async (on: boolean): Promise<void> => {
    archivedTree.setByGroup(on);
    void vscode.commands.executeCommand('setContext', ARCHIVED_BY_GROUP_KEY, on);
    await context.globalState.update(ARCHIVED_BY_GROUP_KEY, on);
  };
  void setArchivedByGroup(context.globalState.get<boolean>(ARCHIVED_BY_GROUP_KEY, false));

  // A new reading of whose turn it is; a finish while the terminal is not in front is marked unseen and notified.
  const applyTurn = (s: Session, turn: Turn | undefined): void => {
    const before = turns.get(s.id);
    if (turn === before) { return; }
    if (turn) { turns.set(s.id, turn); } else { turns.delete(s.id); }
    if (before === 'working' && turn === 'done' && !inFront(s.id)) { unseen.add(s.id); notifyFinished(s); }
    tree.refresh();
    archivedTree.refresh();
  };

  // While a Claude session's terminal is open, its transcript's latest /rename title becomes the session's name.
  const transcripts = new Map<string, { file: string; mtimeMs: number }>();
  let polling = false;
  const pollTitles = async (): Promise<void> => {
    if (polling) { return; }
    polling = true;
    terminals.refreshNames();
    try {
      for (const s of store.read().sessions) {
        if (s.agentId === OPENCODE.id && terminals.isOpen(s.id)) { applyTurn(s, openCodeTurn(openCodeDb(), s.id)); continue; }
        if (s.agentId !== CLAUDE.id || !terminals.isOpen(s.id)) { continue; }
        const known = transcripts.get(s.id);
        const file = known?.file ?? await findTranscript(claudeConfigDir(), s.id);
        if (!file) { continue; }
        const mtimeMs = (await fs.stat(file).catch(() => undefined))?.mtimeMs;
        if (mtimeMs === undefined || mtimeMs === known?.mtimeMs) { continue; }
        transcripts.set(s.id, { file, mtimeMs });
        const tail = await readTail(file, 256 * 1024);
        const title = lastCustomTitle(tail);
        if (title) { await store.applyAgentTitle(s.id, title); }
        applyTurn(s, lastTurn(tail));
      }
    } catch { /* a transcript that cannot be read keeps the current name */ }
    finally { polling = false; }
  };
  const titleTimer = setInterval(() => { void pollTitles(); }, 3000);

  // A session is looked at when its terminal is the active one in a focused window.
  const inFront = (id: string): boolean => vscode.window.state.focused && vscode.window.activeTerminal !== undefined && vscode.window.activeTerminal === terminals.terminalOf(id);
  const clearSeen = (): void => {
    let changed = false;
    for (const id of [...unseen]) { if (inFront(id) || !terminals.isOpen(id)) { unseen.delete(id); changed = true; } }
    for (const id of [...turns.keys()]) { if (!terminals.isOpen(id)) { turns.delete(id); transcripts.delete(id); } }
    if (changed) { tree.refresh(); archivedTree.refresh(); }
  };
  const notifyFinished = (s: Session): void => {
    if (!config().get<boolean>('notifyWhenFinished', true)) { return; }
    void vscode.window.showInformationMessage(`${s.name || 'A session'} finished.`, 'Open').then(choice => {
      if (choice !== 'Open') { return; }
      const current = store.read().sessions.find(x => x.id === s.id);
      if (current) { openSession(current); }
    });
  };

  // Runs a store write; a rejection is shown and reported as false.
  const attempt = async (work: () => Promise<unknown>): Promise<boolean> => {
    try { await work(); return true; }
    catch (e) { showError(e); return false; }
  };

  // Stores a new session, then opens its terminal.
  const defaultFolder = (): string | undefined => config().get<string>('defaultFolder');

  // Asks for a folder, opening at `current`; undefined when cancelled.
  const pickFolder = async (title: string, current: string | undefined): Promise<string | undefined> => {
    const at = startFolder(current, defaultFolder());
    const picked = await vscode.window.showOpenDialog({ title, canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Use Folder', ...(at ? { defaultUri: vscode.Uri.file(at) } : {}) });
    return picked?.[0]?.fsPath;
  };

  const startSession = async (from: { groupId: string; folder: string | undefined; before: string; shellPath: string }, agent: Agent | undefined): Promise<void> => {
    if (!agent) { showError(new Error('unknown agent: check sessionGroups.defaultAgent or the group\'s agent')); return; }
    const now = new Date();
    const session: Session = {
      id: newSessionId(agent, crypto.randomUUID()),
      groupId: from.groupId,
      // The start date until Claude names the session (/rename) or it is renamed in the panel.
      name: dateName(now),
      before: from.before,
      shellPath: from.shellPath,
      cwd: startFolder(from.folder, defaultFolder(), vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, os.homedir()),
      agentId: agent.id,
      createdAt: now.toISOString(),
    };
    if (await attempt(() => store.addSession(session))) { terminals.open(session, agent, 'start'); }
  };

  const openSession = (session: Session): void => {
    const agent = agents().find(a => a.id === session.agentId);
    if (!agent) { showError(new Error(`unknown agent "${session.agentId}"`)); return; }
    terminals.open(session, agent, 'resume');
  };

  const required = (value: string) => value.trim() === '' ? 'A name is required' : undefined;

  // From the Explorer's context menu: the folder clicked on.
  const explorerFolder = (arg: unknown): string | undefined => arg instanceof vscode.Uri && arg.scheme === 'file' ? arg.fsPath : undefined;
  // A group starting in `folder`, named after it unless renamed in the prompt, with the default shell.
  const addGroupAt = async (folder: string): Promise<Group | undefined> => {
    const name = await vscode.window.showInputBox({ prompt: 'Group name', value: path.basename(folder), validateInput: required });
    if (name === undefined) { return undefined; }
    const group: Group = { id: crypto.randomUUID(), name: name.trim(), before: '', shellPath: vscode.env.shell, color: GROUP_COLORS[store.read().groups.length % GROUP_COLORS.length], folder };
    return await attempt(() => store.addGroup(group)) ? group : undefined;
  };

  const register = (id: string, handler: (arg?: unknown) => unknown) =>
    vscode.commands.registerCommand(`sessionGroups.${id}`, handler);

  const setActiveOnly = (on: boolean): void => {
    tree.setActiveOnly(on);
    void vscode.commands.executeCommand('setContext', 'sessionGroups.activeOnly', on);
  };
  setActiveOnly(false);

  const FLAT_KEY = 'sessionGroups.flat';
  const isFlat = (): boolean => context.globalState.get<boolean>(FLAT_KEY, false);
  const setFlat = async (on: boolean): Promise<void> => {
    tree.setFlat(on);
    void vscode.commands.executeCommand('setContext', FLAT_KEY, on);
    await context.globalState.update(FLAT_KEY, on);
    buildTreeView();
  };
  tree.setFlat(isFlat());
  void vscode.commands.executeCommand('setContext', FLAT_KEY, isFlat());

  const COLORS_KEY = 'sessionGroups.colors';
  const setColors = async (on: boolean): Promise<void> => {
    await context.globalState.update(COLORS_KEY, on);
    void vscode.commands.executeCommand('setContext', COLORS_KEY, on);
    tree.setColors(on);
    archivedTree.setColors(on);
  };
  void setColors(context.globalState.get<boolean>(COLORS_KEY, true));

  const dragAndDrop = new GroupsDragAndDrop(store, showError);
  let treeView: vscode.TreeView<unknown> | undefined;
  let treeViewSubscription: vscode.Disposable | undefined;

  // Shows the number of active sessions next to the view title and as a badge on the activity-bar icon.
  const updateCount = (): void => {
    if (!treeView) { return; }
    const n = activeCount(store.read(), id => terminals.isOpen(id));
    treeView.description = n > 0 ? `${n} active` : '';
    treeView.badge = n > 0 ? { value: n, tooltip: `${n} active sessions` } : undefined;
  };

  // The one place that builds the view: drag and drop is attached only while groups are shown,
  // since without group rows a drop would still move sessions between the hidden groups.
  function buildTreeView(): void {
    treeViewSubscription?.dispose();
    treeView?.dispose();
    treeView = vscode.window.createTreeView('sessionGroups.groups', {
      treeDataProvider: tree,
      canSelectMany: false,
      ...(isFlat() ? {} : { dragAndDropController: dragAndDrop }),
    });
    treeViewSubscription = tree.onDidChangeTreeData(updateCount);
    updateCount();
  }

  buildTreeView();

  context.subscriptions.push(
    archivedTree,
    archivedView,
    store.onDidChange(updateArchivedCount),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('sessionGroups.agents')) { reportAgentErrors(); tree.refresh(); archivedTree.refresh(); } }),
    terminals,
    tree,
    { dispose: () => { clearInterval(titleTimer); } },
    vscode.window.onDidChangeActiveTerminal(clearSeen),
    // Picking a session's terminal selects its row, but only while the panel is visible: revealing would open it.
    vscode.window.onDidChangeActiveTerminal(terminal => {
      const id = terminal && terminals.sessionOf(terminal);
      const session = id ? store.read().sessions.find(s => s.id === id && s.archived !== true) : undefined;
      if (session && treeView?.visible) { void treeView.reveal(session, { select: true, focus: false }); }
    }),
    vscode.window.onDidChangeWindowState(clearSeen),
    terminals.onDidChange(clearSeen),
    { dispose: () => { treeViewSubscription?.dispose(); treeView?.dispose(); } },

    register('hideColors', () => setColors(false)),

    register('showColors', () => setColors(true)),

    register('addGroup', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Group name', validateInput: required });
      if (name === undefined) { return; }
      const folder = await pickFolder('Folder the sessions of this group start in', undefined);
      if (folder === undefined) { return; }
      const shellPath = await vscode.window.showInputBox({ prompt: 'Shell path', value: vscode.env.shell, validateInput: value => value.trim() === '' ? 'A shell path is required' : undefined });
      if (shellPath === undefined) { return; }
      const color = GROUP_COLORS[store.read().groups.length % GROUP_COLORS.length];
      await attempt(() => store.addGroup({ id: crypto.randomUUID(), name: name.trim(), before: '', shellPath, color, folder }));
    }),

    register('newSession', async arg => {
      if (!isGroup(arg)) { return; }
      await startSession({ groupId: arg.id, folder: arg.folder, before: arg.before, shellPath: arg.shellPath }, agentFor(arg));
    }),

    register('newUngroupedSession', async () => {
      await startSession({ groupId: '', folder: undefined, before: '', shellPath: vscode.env.shell }, agentFor(undefined));
    }),

    // Explorer: a session in the group starting in the clicked folder, picked when several do, added first when none does.
    register('newGroupedSessionHere', async arg => {
      const folder = explorerFolder(arg);
      if (!folder) { return; }
      const groups = groupsForFolder(store.read().groups, folder, process.platform === 'win32');
      const group = groups.length === 0 ? await addGroupAt(folder)
        : groups.length === 1 ? groups[0]
          : (await vscode.window.showQuickPick(groups.map(g => ({ label: g.name, group: g })), { placeHolder: 'Group to start the session in' }))?.group;
      if (group) { await startSession({ groupId: group.id, folder: group.folder, before: group.before, shellPath: group.shellPath }, agentFor(group)); }
    }),

    register('newUngroupedSessionHere', async arg => {
      const folder = explorerFolder(arg);
      if (folder) { await startSession({ groupId: '', folder, before: '', shellPath: vscode.env.shell }, agentFor(undefined)); }
    }),

    register('newSessionWith', async arg => {
      const group = isGroup(arg) ? arg : undefined;
      const agent = await pickAgent('Agent for the new session');
      if (!agent) { return; }
      await startSession(group ? { groupId: group.id, folder: group.folder, before: group.before, shellPath: group.shellPath } : { groupId: '', folder: undefined, before: '', shellPath: vscode.env.shell }, agent);
    }),

    register('openSession', arg => {
      if (isSession(arg) && arg.archived !== true) { openSession(arg); }
    }),

    register('closeTerminal', arg => {
      if (isSession(arg)) { terminals.close(arg.id); }
    }),

    register('search', async () => {
      const state = store.read();
      const items = searchItems(state, new Date(), agents()).flatMap<(vscode.QuickPickItem & { id?: string })>(section => [
        { label: section.label, kind: vscode.QuickPickItemKind.Separator },
        ...section.items.map(item => ({ ...item, iconPath: terminals.isOpen(item.id) ? activeIcon : new vscode.ThemeIcon('history') })),
      ]);
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Search sessions', matchOnDescription: true });
      const session = picked && state.sessions.find(s => s.id === picked.id);
      if (session) { openSession(session); }
    }),

    register('showActiveOnly', () => { setActiveOnly(true); }),

    register('showAllSessions', () => { setActiveOnly(false); }),

    register('showArchivedByGroup', () => setArchivedByGroup(true)),

    register('showArchivedFlat', () => setArchivedByGroup(false)),

    register('showFlat', () => setFlat(true)),

    register('showGroups', () => setFlat(false)),

    // An archived session cannot be opened, so archiving one whose terminal is open asks whether to close it.
    register('archiveSession', async arg => {
      if (!isSession(arg)) { return; }
      let close = false;
      if (terminals.isOpen(arg.id)) {
        const choice = await vscode.window.showWarningMessage('This session\'s terminal is open. Close it?', { modal: true }, 'Archive and Close', 'Archive Only');
        if (choice === undefined) { return; }
        close = choice === 'Archive and Close';
      }
      if (await attempt(() => store.setArchived(arg.id, true)) && close) { terminals.close(arg.id); }
    }),

    register('clearArchived', async () => {
      const count = store.read().sessions.filter(s => s.archived === true).length;
      if (count === 0) { void vscode.window.showInformationMessage('Nothing is archived.'); return; }
      const choice = await vscode.window.showWarningMessage(`Remove ${count} archived session${count === 1 ? '' : 's'} from the list? The agents' own transcripts are kept.`, { modal: true }, 'Remove');
      if (choice !== 'Remove') { return; }
      try {
        const removed = await store.deleteArchived();
        removed.forEach(s => terminals.close(s.id));
      } catch (e) { showError(e); }
    }),

    register('unarchiveSession', async arg => {
      if (isSession(arg)) { await attempt(() => store.setArchived(arg.id, false)); }
    }),

    // One menu; only the picked setting is asked for.
    register('editGroup', async arg => {
      if (!isGroup(arg)) { return; }
      const color = groupColor(store.read(), arg);
      const choice = await vscode.window.showQuickPick([
        { label: '$(edit) Rename', description: arg.name, action: 'name' },
        { label: '$(symbol-color) Change Color', description: color.replace('charts.', ''), action: 'color' },
        { label: '$(folder) Change Folder', description: arg.folder ?? '', action: 'folder' },
        { label: '$(hubot) Change Agent', description: agentFor(arg)?.name ?? arg.agentId ?? '', action: 'agent' },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(trash) Delete Group', description: 'sessions move to Ungrouped', action: 'delete' },
        { label: '$(trash) Delete Group and Sessions', action: 'deleteAll' },
      ], { title: `Group: ${arg.name}` });
      if (choice?.action === 'name') {
        const name = await vscode.window.showInputBox({ prompt: 'Group name', value: arg.name, validateInput: required });
        if (name !== undefined) { await attempt(() => store.updateGroup(arg.id, { name: name.trim() })); }
      } else if (choice?.action === 'color') {
        const picked = await vscode.window.showQuickPick(GROUP_COLORS.map(c => ({ label: c.replace('charts.', ''), description: c === color ? 'current' : undefined, color: c })), { placeHolder: 'Group colour' });
        if (picked) { await attempt(() => store.updateGroup(arg.id, { color: picked.color })); }
      } else if (choice?.action === 'folder') {
        const folder = await pickFolder('Folder new sessions start in', arg.folder);
        // A picked folder replaces an older group's "before" command.
        if (folder !== undefined) { await attempt(() => store.updateGroup(arg.id, { folder, before: '' })); }
      } else if (choice?.action === 'agent') {
        const agent = await pickAgent('Agent the group\'s new sessions start');
        if (agent) { await attempt(() => store.updateGroup(arg.id, { agentId: agent.id })); }
      } else if (choice?.action === 'delete') {
        await vscode.commands.executeCommand('sessionGroups.deleteGroup', arg);
      } else if (choice?.action === 'deleteAll') {
        await vscode.commands.executeCommand('sessionGroups.deleteGroupAndSessions', arg);
      }
    }),

    register('deleteGroup', async arg => {
      if (!isGroup(arg)) { return; }
      await attempt(() => store.deleteGroup(arg.id, false));
    }),

    register('deleteGroupAndSessions', async arg => {
      if (!isGroup(arg)) { return; }
      const n = store.read().sessions.filter(s => s.groupId === arg.id).length;
      const choice = await vscode.window.showWarningMessage(`Delete group "${arg.name}" and its ${n} sessions, archived ones included? Open terminals are closed; the agents' own transcripts are kept.`, { modal: true }, 'Delete All');
      if (choice !== 'Delete All') { return; }
      try {
        const removed = await store.deleteGroup(arg.id, true);
        removed.forEach(s => terminals.close(s.id));
      } catch (e) { showError(e); }
    }),

    register('renameSession', async arg => {
      if (!isSession(arg)) { return; }
      const name = await vscode.window.showInputBox({ prompt: 'Session name', value: arg.name, validateInput: required });
      if (name === undefined) { return; }
      await attempt(() => store.renameSession(arg.id, name.trim()));
    }),

    // Lists a session started elsewhere under a group (or Ungrouped); it is opened by a click like any other.
    register('addExistingSession', async arg => {
      const group = isGroup(arg) ? arg : undefined;
      const agent = agentFor(group);
      if (!agent) { showError(new Error('unknown agent: check sessionGroups.defaultAgent or the group\'s agent')); return; }
      const value = await vscode.window.showInputBox({
        prompt: `${agent.name} session id to add${group ? ` to ${group.name}` : ''}`,
        validateInput: v => {
          const other = store.read().sessions.find(s => s.id === v.trim());
          return idProblem(agent, v.trim()) ?? (other ? `Already listed as "${other.name || 'unnamed'}"` : undefined);
        },
      });
      if (value === undefined) { return; }
      const id = value.trim();
      // A Claude session resumes in the folder it ran in, which its transcript records.
      const transcript = agent.id === CLAUDE.id ? await findTranscript(claudeConfigDir(), id) : undefined;
      const ranIn = transcript ? lastCwd(await readTail(transcript, 256 * 1024).catch(() => '')) : undefined;
      const session: Session = {
        id,
        groupId: group?.id ?? '',
        name: dateName(new Date()),
        before: '',
        shellPath: group?.shellPath ?? vscode.env.shell,
        cwd: startFolder(ranIn, group?.folder, defaultFolder(), vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, os.homedir()),
        agentId: agent.id,
        createdAt: new Date().toISOString(),
      };
      await attempt(() => store.addSession(session));
    }),

    register('editSessionId', async arg => {
      if (!isSession(arg)) { return; }
      if (terminals.isOpen(arg.id)) { showError(new Error('close the session\'s terminal first: it runs the current id')); return; }
      const agent = agents().find(a => a.id === arg.agentId);
      if (!agent) { showError(new Error(`unknown agent "${arg.agentId}"`)); return; }
      const newId = await vscode.window.showInputBox({
        prompt: `${agent.name} session id to resume`,
        value: arg.id,
        validateInput: value => {
          const id = value.trim();
          const other = id !== arg.id ? store.read().sessions.find(s => s.id === id) : undefined;
          return idProblem(agent, id) ?? (other ? `Already listed as "${other.name || 'unnamed'}"` : undefined);
        },
      });
      if (newId === undefined || newId.trim() === arg.id) { return; }
      await attempt(() => store.changeSessionId(arg.id, newId.trim()));
    }),

    // F2 and Delete act on the row selected in the focused view.
    register('renameSelected', async (view: unknown) => {
      const picked = (view === 'archived' ? archivedView : treeView)?.selection[0];
      if (isSession(picked)) { await vscode.commands.executeCommand('sessionGroups.renameSession', picked); }
      else if (isGroup(picked)) {
        const name = await vscode.window.showInputBox({ prompt: 'Group name', value: picked.name, validateInput: required });
        if (name !== undefined) { await attempt(() => store.updateGroup(picked.id, { name: name.trim() })); }
      }
    }),

    register('deleteSelected', async (view: unknown) => {
      // In Groups, Delete archives a session (or deletes a group); in Archived it deletes the session after a confirmation.
      if (view !== 'archived') {
        const picked = treeView?.selection[0];
        if (isGroup(picked)) { await vscode.commands.executeCommand('sessionGroups.deleteGroup', picked); }
        else if (isSession(picked)) { await vscode.commands.executeCommand('sessionGroups.archiveSession', picked); }
        return;
      }
      const picked = archivedView.selection[0];
      if (!isSession(picked)) { return; }
      const choice = await vscode.window.showWarningMessage(`Delete session "${picked.name || 'unnamed'}" from the list? The agent's own transcript is kept.`, { modal: true }, 'Delete');
      if (choice === 'Delete') { await vscode.commands.executeCommand('sessionGroups.deleteSession', picked); }
    }),

    register('deleteSession', async arg => {
      if (!isSession(arg)) { return; }
      if (await attempt(() => store.deleteSession(arg.id))) { terminals.close(arg.id); }
    }),
  );
}

export function deactivate(): void {}
