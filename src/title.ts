import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// Claude re-appends its custom-title entry often, so the last one in the file's tail is the current title.
export function lastCustomTitle(text: string): string | undefined {
  let title: string | undefined;
  for (const line of text.split('\n')) {
    if (!line.includes('"custom-title"')) { continue; }
    try {
      const entry = JSON.parse(line) as { type?: unknown; customTitle?: unknown };
      if (entry.type === 'custom-title' && typeof entry.customTitle === 'string' && entry.customTitle.trim() !== '') { title = entry.customTitle; }
    } catch { /* a line cut by the tail read */ }
  }
  return title;
}

// Whose turn it is in a Claude transcript: 'working' while Claude answers or runs tools, 'done' once its last answer ended
// the turn, the user interrupted it or the conversation was compacted; undefined before the first prompt. Subagent (sidechain) entries are skipped.
export type Turn = 'working' | 'done';
export function lastTurn(text: string): Turn | undefined {
  let turn: Turn | undefined;
  for (const line of text.split('\n')) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) { continue; }
    try {
      const entry = JSON.parse(line) as { type?: unknown; isSidechain?: unknown; isMeta?: unknown; isCompactSummary?: unknown; message?: { stop_reason?: unknown; content?: unknown } };
      if (entry.isSidechain === true || entry.isMeta === true) { continue; }
      // A compaction summary is written as a user entry; Claude then waits for you unless it carries on, which adds an assistant entry.
      if (entry.isCompactSummary === true) { turn = 'done'; continue; }
      if (entry.type === 'assistant') { turn = entry.message?.stop_reason === 'end_turn' ? 'done' : 'working'; }
      else if (entry.type === 'user') { turn = JSON.stringify(entry.message?.content ?? '').includes('[Request interrupted') ? 'done' : 'working'; }
    } catch { /* a line cut by the tail read */ }
  }
  return turn;
}

// The folder the session last ran in, from the `cwd` its transcript entries carry.
export function lastCwd(text: string): string | undefined {
  let cwd: string | undefined;
  for (const line of text.split('\n')) {
    if (!line.includes('"cwd"')) { continue; }
    try {
      const entry = JSON.parse(line) as { cwd?: unknown };
      if (typeof entry.cwd === 'string' && entry.cwd.trim() !== '') { cwd = entry.cwd; }
    } catch { /* a line cut by the tail read */ }
  }
  return cwd;
}

export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim() !== '' ? env.CLAUDE_CONFIG_DIR : path.join(os.homedir(), '.claude');
}

// The transcript sits in a folder named after the directory claude ran in, which the "before" command may change, so every project folder is tried.
export async function findTranscript(configDir: string, sessionId: string): Promise<string | undefined> {
  const projects = path.join(configDir, 'projects');
  const folders = await fs.readdir(projects, { withFileTypes: true }).catch(() => []);
  for (const folder of folders) {
    if (!folder.isDirectory()) { continue; }
    const file = path.join(projects, folder.name, `${sessionId}.jsonl`);
    if (await fs.stat(file).then(s => s.isFile(), () => false)) { return file; }
  }
  return undefined;
}

export async function readTail(file: string, bytes: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}
