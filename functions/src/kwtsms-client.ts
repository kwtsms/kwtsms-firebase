/**
 * KwtSMS Client Wrapper
 *
 * Creates a KwtSMS instance using credentials from extension params and
 * runtime settings from Firestore. A new instance is created per invocation
 * to pick up settings changes (test_mode, sender_id).
 *
 * Related files:
 *   - config.ts: provides credentials and settings
 *   - services/sms.ts: uses this to send messages
 *   - handlers/scheduled.ts: uses this for sync calls
 */

import { KwtSMS } from 'kwtsms';
import { getCredentials, getSettings } from './config';
import type { Settings } from './config';

// 2026-11-05 15:08 +03: app token passed to the kwtsms library as appName, so every API call names the
// integration and its version in the User-Agent (no personal data) and kwtSMS can count accounts
// per integration. Version read at runtime from functions/package.json (src/ and lib/ both sit
// one level below it; rootDir src rules out a JSON import), #939.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };
export const APP_NAME = `kwtsms-firebase/${version}`;

export async function createClient(settingsOverride?: Settings): Promise<KwtSMS> {
  const { username, password } = getCredentials();

  if (!username || !password) {
    throw new Error('kwtSMS credentials not configured. Reconfigure the extension with valid API credentials.');
  }

  const settings = settingsOverride || await getSettings();

  // 2026-11-05 15:08 +03: options built as a variable so appName passes the type check on kwtsms versions
  // before appName support; those ignore it and send their own User-Agent only, #939.
  const options = {
    senderId: settings.selected_sender_id,
    testMode: settings.test_mode,
    logFile: '',  // disable file logging, we use Firestore logging
    appName: APP_NAME,
  };
  return new KwtSMS(username, password, options);
}
