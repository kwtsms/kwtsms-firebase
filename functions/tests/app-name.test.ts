/**
 * FILE:      functions/tests/app-name.test.ts
 * CREATED:   2026-11-05 15:08 +03
 * TASK:      #939
 * AUTHOR:    M Alhassoun
 * WHAT:      Offline test: the kwtsms client is built with appName kwtsms-firebase/<package.json version>.
 * WHY:       kwtSMS counts accounts per integration from the User-Agent this token goes into.
 * USAGE:     npx tsx --test tests/app-name.test.ts (no emulator needed; also runs in npm test)
 * DEPENDS:   node:test, tsx; dummy credentials, settings passed in, no Firestore and no API call.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { APP_NAME, createClient } from '../src/kwtsms-client';
import { DEFAULTS } from '../src/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

describe('kwtSMS app token', () => {
  it('is kwtsms-firebase/<package.json version>', () => {
    assert.strictEqual(APP_NAME, `kwtsms-firebase/${version}`);
    assert.match(APP_NAME, /^kwtsms-[a-z0-9-]+\/[0-9][0-9A-Za-z.+-]*$/);
  });

  it('goes into the client User-Agent (kwtsms versions with appName support)', async () => {
    process.env.KWTSMS_USERNAME = 'dummy-user';
    process.env.KWTSMS_PASSWORD = 'dummy-pass';
    const client = await createClient(DEFAULTS);
    const ua = (client as unknown as { userAgent?: string }).userAgent;
    if (ua !== undefined) assert.ok(ua.startsWith(APP_NAME + ' '), `User-Agent: ${ua}`);
  });
});
