import * as vscode from 'vscode';
import { buildLaunch } from './launch';
import type { Agent, Session } from './model';
import { matchTerminal, type Remembered } from './reattach';
import type { Memento } from './store';

export const TERMINALS_KEY = 'sessionGroups.terminals';

export class Terminals implements vscode.Disposable {
  private readonly bySession = new Map<string, vscode.Terminal>();
  private readonly live = new Map<string, Remembered>();
  // Terminals open before the last reload that have not been found again yet.
  private readonly remembered: Map<string, Remembered>;
  private readonly subscriptions: vscode.Disposable[];
  private readonly changed = new vscode.EventEmitter<void>();
  // Fires when a session's terminal opens or closes.
  readonly onDidChange = this.changed.event;

  // `memento` is the window's own storage, so each window finds only its own terminals again.
  constructor(private readonly memento: Memento, sessionExists: (id: string) => boolean) {
    const saved = memento.get<Record<string, Partial<Remembered>>>(TERMINALS_KEY) ?? {};
    this.remembered = new Map(Object.entries(saved)
      .filter((e): e is [string, Remembered] => sessionExists(e[0]) && typeof e[1]?.pid === 'number' && typeof e[1]?.name === 'string'));
    this.subscriptions = [
      vscode.window.onDidCloseTerminal(closed => {
        for (const [id, terminal] of this.bySession) {
          if (terminal === closed) { this.forget(id); this.changed.fire(); }
        }
      }),
      vscode.window.onDidOpenTerminal(terminal => { void this.adopt(terminal); }),
    ];
    vscode.window.terminals.forEach(terminal => { void this.adopt(terminal); });
  }

  isOpen(sessionId: string): boolean {
    return this.bySession.has(sessionId);
  }

  terminalOf(sessionId: string): vscode.Terminal | undefined {
    return this.bySession.get(sessionId);
  }

  sessionOf(terminal: vscode.Terminal): string | undefined {
    for (const [id, t] of this.bySession) { if (t === terminal) { return id; } }
    return undefined;
  }

  open(session: Session, agent: Agent, kind: 'start' | 'resume'): void {
    const existing = this.bySession.get(session.id);
    if (existing) { existing.show(); return; }
    const launch = buildLaunch(session, agent, kind);
    // No name: the tab shows the title Claude sets, as in a terminal opened by hand.
    const terminal = vscode.window.createTerminal({ shellPath: launch.shellPath, cwd: launch.cwd, env: launch.env });
    this.remembered.delete(session.id);
    this.bySession.set(session.id, terminal);
    void terminal.processId.then(pid => {
      if (pid === undefined || this.bySession.get(session.id) !== terminal) { return; }
      this.live.set(session.id, { pid, name: terminal.name });
      void this.save();
    });
    for (const line of launch.lines) { terminal.sendText(line, true); }
    terminal.show();
    this.changed.fire();
  }

  // Claude retitles its terminal; the latest title is what a restart revives the empty shell under, so it is remembered.
  refreshNames(): void {
    let changed = false;
    for (const [id, terminal] of this.bySession) {
      const known = this.live.get(id);
      if (known && known.name !== terminal.name) { this.live.set(id, { ...known, name: terminal.name }); changed = true; }
    }
    if (changed) { void this.save(); }
  }

  close(sessionId: string): void {
    const terminal = this.bySession.get(sessionId);
    if (!terminal) { return; }
    this.forget(sessionId);
    terminal.dispose();
    this.changed.fire();
  }

  dispose(): void {
    this.subscriptions.forEach(s => s.dispose());
    this.changed.dispose();
  }

  private async adopt(terminal: vscode.Terminal): Promise<void> {
    if (this.remembered.size === 0 || [...this.bySession.values()].includes(terminal)) { return; }
    const pid = await terminal.processId;
    const match = matchTerminal(this.remembered, pid, terminal.name);
    if (!match || pid === undefined || this.bySession.has(match.sessionId)) { return; }
    this.remembered.delete(match.sessionId);
    if (match.kind === 'dispose') { terminal.dispose(); void this.save(); return; }
    this.bySession.set(match.sessionId, terminal);
    this.live.set(match.sessionId, { pid, name: terminal.name });
    void this.save();
    this.changed.fire();
  }

  private forget(sessionId: string): void {
    this.bySession.delete(sessionId);
    this.live.delete(sessionId);
    void this.save();
  }

  private save(): PromiseLike<void> {
    return this.memento.update(TERMINALS_KEY, Object.fromEntries([...this.remembered, ...this.live]));
  }
}
