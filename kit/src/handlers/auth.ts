/**
 * FILE:      kit/src/handlers/auth.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      v1 Auth onCreate welcome SMS trigger of the kwtSMS function kit.
 * WHY:       Ported from functions/src/handlers/auth.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Auth Handler
 *
 * Firebase Auth onCreate trigger. Sends a welcome SMS to new users
 * who have a phone number on their Auth record.
 *
 * Respects gateway_enabled and test_mode settings. Skips silently
 * if no phone number is present. Uses configurable app_name from settings.
 *
 * Related files:
 *   - services/sms.ts: buildSendPipeline()
 *   - config.ts: getSettings()
 *   - services/logger.ts: logging
 */

import * as functions from 'firebase-functions/v1';
import { getSettings, getSyncData } from '../config';
import { region, SECRETS } from '../params';
import { buildSendPipeline } from '../services/sms';
import { debug, info, error as logError } from '../services/logger';

// 2026-11-16 02:05 +03: stays on the v1 auth trigger: 2nd gen has no non-blocking Auth onCreate
// (only beforeUserCreated, which would delay sign-up). v1 and 2nd gen functions share one codebase
// (migration guide step 3), int-firebase-auth
export const onUserCreate = functions
  .region(region)
  .runWith({ secrets: SECRETS })
  .auth.user()
  .onCreate(async (user) => {
  await debug('onUserCreate triggered', { uid: user.uid });

  if (!user.phoneNumber) {
    await debug('No phone number on auth record, skipping welcome SMS', { uid: user.uid });
    return;
  }

  try {
    const settings = await getSettings();
    const syncData = await getSyncData();

    // Strip the + prefix that Firebase Auth includes on phone numbers
    const phone = user.phoneNumber.replace(/^\+/, '');

    const result = await buildSendPipeline({
      to: phone,
      template: 'welcome',
      templateData: {
        app_name: settings.app_name,
      },
      language: 'en',
      settings,
      syncData,
      trigger: 'auth',
    });

    info('Welcome SMS result', { uid: user.uid, status: result.status });
  } catch (err) {
    logError('onUserCreate error', { uid: user.uid, error: (err as Error).message });
  }
});
