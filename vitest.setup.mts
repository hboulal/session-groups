import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Windows hands out the 8.3 short form of the profile folder (C:\Users\NAME~1) as TEMP, while git and realpath report the long form; tests compare the two.
if (process.platform === 'win32') {
  const long = realpathSync.native(tmpdir());
  process.env.TEMP = long;
  process.env.TMP = long;
}
