import { fillTemplate, type Agent, type Session } from './model';

export const SESSION_ENV = 'SESSION_GROUPS_ID';

export interface Launch { shellPath: string; cwd: string; env: Record<string, string>; lines: string[] }

export function buildLaunch(session: Session, agent: Agent, kind: 'start' | 'resume'): Launch {
  const lines = session.before.trim() !== '' ? [session.before] : [];
  lines.push(fillTemplate(agent[kind], session.id));
  return {
    shellPath: session.shellPath,
    cwd: session.cwd,
    env: { [SESSION_ENV]: session.id },
    lines,
  };
}
