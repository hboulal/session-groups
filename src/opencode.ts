import * as os from 'node:os';
import * as path from 'node:path';
import type { Turn } from './title';

// OpenCode keeps sessions in a SQLite database; a session's last message is `idle` once its turn ended.
export function openCodeDb(env: NodeJS.ProcessEnv = process.env): string {
  const data = env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim() !== '' ? env.XDG_DATA_HOME : path.join(os.homedir(), '.local', 'share');
  return path.join(data, 'opencode', 'opencode.db');
}

export function turnFromMessageType(type: string | undefined): Turn | undefined {
  if (type === undefined) { return undefined; }
  return type === 'idle' ? 'done' : 'working';
}

interface Db { prepare(sql: string): { get(...params: unknown[]): unknown }; close(): void }

// Undefined when the database or node:sqlite (Node 22.13+ in the extension host) is not there.
export function openCodeTurn(dbFile: string, sessionId: string): Turn | undefined {
  let db: Db | undefined;
  try {
    const sqlite = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.('node:sqlite') as { DatabaseSync: new (file: string, options: { readOnly: boolean }) => Db } | undefined;
    if (!sqlite) { return undefined; }
    db = new sqlite.DatabaseSync(dbFile, { readOnly: true });
    const row = db.prepare("select type from session_message where session_id = ? and type in ('user', 'assistant', 'idle') order by seq desc limit 1").get(sessionId) as { type?: string } | undefined;
    return turnFromMessageType(row?.type);
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}
