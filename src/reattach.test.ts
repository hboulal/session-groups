import { describe, expect, it } from 'vitest';
import { matchTerminal, type Remembered } from './reattach';

const remembered = new Map<string, Remembered>([['s1', { pid: 10, name: 'One' }], ['s2', { pid: 20, name: 'Two' }]]);

describe('matchTerminal', () => {
  it('adopts the terminal whose process id is remembered, whatever its name', () => {
    expect(matchTerminal(remembered, 20, 'renamed')).toEqual({ kind: 'adopt', sessionId: 's2' });
  });

  it('disposes a terminal with a remembered name but a new process', () => {
    expect(matchTerminal(remembered, 99, 'One')).toEqual({ kind: 'dispose', sessionId: 's1' });
  });

  it('leaves any other terminal alone, and one without a process id', () => {
    expect(matchTerminal(remembered, 99, 'pwsh')).toBeUndefined();
    expect(matchTerminal(remembered, undefined, 'Two')).toBeUndefined();
  });
});
