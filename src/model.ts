// `idPrefix`: the agent only takes ids in its own format, so a new id is the prefix plus a UUID without dashes.
// `idPattern`: a regular expression an id typed by hand must match; without one, any id without spaces is taken.
export interface Agent { id: string; name: string; start: string; resume: string; idPrefix?: string; idPattern?: string }
export interface Group { id: string; name: string; before: string; shellPath: string; color?: string; folder?: string; agentId?: string }
export interface Session { id: string; groupId: string; name: string; before: string; shellPath: string; cwd: string; agentId: string; createdAt: string; archived?: boolean; agentTitle?: string }

export const CLAUDE: Agent = { id: 'claude', name: 'Claude', start: 'claude --session-id {id}', resume: 'claude --resume {id}', idPattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' };
export const OPENCODE: Agent = { id: 'opencode', name: 'OpenCode', start: 'opencode --session {id}', resume: 'opencode --session {id}', idPrefix: 'ses_', idPattern: '^ses\\S+$' };
const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
export const COPILOT: Agent = { id: 'copilot', name: 'Copilot', start: 'copilot --session-id {id}', resume: 'copilot --resume {id}', idPattern: UUID };
export const GEMINI: Agent = { id: 'gemini', name: 'Gemini', start: 'gemini --session-id {id}', resume: 'gemini --resume {id}', idPattern: UUID };
export const QWEN: Agent = { id: 'qwen', name: 'Qwen Code', start: 'qwen --session-id {id}', resume: 'qwen --resume {id}', idPattern: UUID };
// Goose assigns its own ids, so the session is started and resumed by a name the extension chooses.
export const GOOSE: Agent = { id: 'goose', name: 'Goose', start: 'goose session -n {id}', resume: 'goose session --resume -n {id}' };
export const BUILTIN_AGENTS: readonly Agent[] = [CLAUDE, OPENCODE, COPILOT, GEMINI, QWEN, GOOSE];

// Why an id typed by hand cannot be used with this agent, or undefined when it can; whether the session exists is the agent's business.
export function idProblem(agent: Agent, id: string): string | undefined {
  if (id === '' || /\s/.test(id)) { return 'An id has no spaces'; }
  if (agent.idPattern && !new RegExp(agent.idPattern).test(id)) { return `Not a session id for ${agent.name}`; }
  return undefined;
}

export function newSessionId(agent: Agent, uuid: string): string {
  return agent.idPrefix ? `${agent.idPrefix}${uuid.split('-').join('')}` : uuid;
}

// The built-in agents, with the configured ones added or replacing a built-in of the same id; an invalid entry is skipped and reported.
export function resolveAgents(configured: unknown): { agents: Agent[]; errors: string[] } {
  const agents = [...BUILTIN_AGENTS];
  const errors: string[] = [];
  for (const [i, raw] of (Array.isArray(configured) ? configured : []).entries()) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const fields = ['id', 'name', 'start', 'resume'] as const;
    if (!fields.every(f => typeof e[f] === 'string' && (e[f] as string).trim() !== '') || (e.idPrefix !== undefined && typeof e.idPrefix !== 'string') || (e.idPattern !== undefined && !validPattern(e.idPattern))) {
      errors.push(`agent ${i + 1}: id, name, start and resume must be non-empty strings, idPattern a regular expression`);
      continue;
    }
    const agent: Agent = { id: e.id as string, name: e.name as string, start: e.start as string, resume: e.resume as string, ...(e.idPrefix ? { idPrefix: e.idPrefix as string } : {}), ...(e.idPattern ? { idPattern: e.idPattern as string } : {}) };
    if (!agent.start.includes('{id}') || !agent.resume.includes('{id}')) {
      errors.push(`agent "${agent.id}": start and resume must contain {id}, or its sessions cannot be resumed`);
      continue;
    }
    const at = agents.findIndex(a => a.id === agent.id);
    if (at >= 0) { agents[at] = agent; } else { agents.push(agent); }
  }
  return { agents, errors };
}

// Where a new session starts: the group's folder, else the configured default folder, else the workspace, else home.
export function startFolder(...candidates: (string | undefined)[]): string {
  return candidates.find(c => c !== undefined && c.trim() !== '') ?? '';
}

// The groups, in stored order, whose start folder is `folder`. A group without a folder whose "before" command is a lone `cd <path>` starts in that path.
// On Windows paths compare ignoring case and the kind of slash.
export function groupsForFolder(groups: readonly Group[], folder: string, windows: boolean): Group[] {
  const norm = (p: string) => {
    const t = (windows ? p.replace(/\\/g, '/').toLowerCase() : p).replace(/\/+$/, '');
    return t === '' ? '/' : t;
  };
  const startsIn = (g: Group): string | undefined => g.folder !== undefined && g.folder.trim() !== ''
    ? g.folder
    : /^\s*cd\s+(?:\/d\s+)?(["']?)(.+?)\1\s*$/i.exec(g.before)?.[2];
  return groups.filter(g => { const start = startsIn(g); return start !== undefined && norm(start) === norm(folder); });
}

function validPattern(p: unknown): boolean {
  if (typeof p !== 'string') { return false; }
  try { new RegExp(p); return true; } catch { return false; }
}

export function fillTemplate(template: string, id: string): string {
  return template.split('{id}').join(id);
}

// A new session's name until the agent or the user names it: its local start date and time, `YYYY-MM-DD HH:mm`.
export function dateName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function ageLabel(createdAt: string, now: Date): string {
  const at = new Date(createdAt);
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(at.getFullYear(), at.getMonth(), at.getDate())) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
}
