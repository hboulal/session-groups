import { describe, expect, it } from 'vitest';
import { CLAUDE, type Session } from './model';
import { SESSION_ENV, buildLaunch } from './launch';

const session = (before: string): Session => ({
  id: 'abc-123', groupId: 'g1', name: 'My session', before,
  shellPath: 'pwsh.exe', cwd: 'C:\\work\\proj', agentId: 'claude', createdAt: '2026-10-30T10:00:00.000Z',
});

describe('buildLaunch', () => {
  it('start sends the before line verbatim then the filled start template', () => {
    const before = 'cd C:\\projects\\api; $env:FOO="a b"';
    const l = buildLaunch(session(before), CLAUDE, 'start');
    expect(l.lines).toEqual([before, 'claude --session-id abc-123']);
  });

  it('resume with a blank before sends only the filled resume template', () => {
    const l = buildLaunch(session('  '), CLAUDE, 'resume');
    expect(l.lines).toEqual(['claude --resume abc-123']);
  });

  it('carries the id in env and copies shell and cwd', () => {
    const l = buildLaunch(session(''), CLAUDE, 'start');
    expect(SESSION_ENV).toBe('SESSION_GROUPS_ID');
    expect(l.env).toEqual({ [SESSION_ENV]: 'abc-123' });
    expect(l.shellPath).toBe('pwsh.exe');
    expect(l.cwd).toBe('C:\\work\\proj');
  });
});
