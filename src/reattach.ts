// What the extension remembers of a session terminal open in this window, to find it again after a reload.
export interface Remembered { pid: number; name: string }

export type Match = { kind: 'adopt' | 'dispose'; sessionId: string };

// A reload reconnects the same process: adopt it. A terminal with a remembered name but another process is a new, empty shell revived by a restart only when the remembered process is gone: dispose it. While that process still runs, the session's own terminal is still to come, so the same-named one is left alone. Without a process id nothing is decided.
export function matchTerminal(remembered: ReadonlyMap<string, Remembered>, pid: number | undefined, name: string, alive: (pid: number) => boolean): Match | undefined {
  if (pid === undefined) { return undefined; }
  for (const [sessionId, r] of remembered) {
    if (r.pid === pid) { return { kind: 'adopt', sessionId }; }
  }
  for (const [sessionId, r] of remembered) {
    if (r.name === name) { return alive(r.pid) ? undefined : { kind: 'dispose', sessionId }; }
  }
  return undefined;
}
