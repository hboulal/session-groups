import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openCodeDb, openCodeTurn, turnFromMessageType } from './opencode';

describe('OpenCode turn', () => {
  it('is done after an idle message, working after a user or assistant one', () => {
    expect(turnFromMessageType('idle')).toBe('done');
    expect(turnFromMessageType('assistant')).toBe('working');
    expect(turnFromMessageType('user')).toBe('working');
    expect(turnFromMessageType(undefined)).toBeUndefined();
  });

  it('finds the database under XDG_DATA_HOME or ~/.local/share', () => {
    expect(openCodeDb({ XDG_DATA_HOME: 'X:\\data' })).toBe(path.join('X:\\data', 'opencode', 'opencode.db'));
    expect(openCodeDb({})).toBe(path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'));
  });

  it('is undefined when the database is missing', () => {
    expect(openCodeTurn(path.join(os.tmpdir(), 'no-such-opencode.db'), 'ses_x')).toBeUndefined();
  });
});
