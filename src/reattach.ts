// What the extension remembers of a session terminal open in this window, to find it again after a reload.
export interface Remembered { pid: number; name: string }

export type Match = { kind: 'adopt' | 'dispose'; sessionId: string };

// A reload reconnects the same process: adopt it. A restart revives a new, empty shell under the same name: dispose it. Without a process id nothing is decided.
export function matchTerminal(remembered: ReadonlyMap<string, Remembered>, pid: number | undefined, name: string): Match | undefined {
  if (pid === undefined) { return undefined; }
  for (const [sessionId, r] of remembered) {
    if (r.pid === pid) { return { kind: 'adopt', sessionId }; }
  }
  for (const [sessionId, r] of remembered) {
    if (r.name === name) { return { kind: 'dispose', sessionId }; }
  }
  return undefined;
}
