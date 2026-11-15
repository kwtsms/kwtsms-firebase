/**
 * FILE:      kit/src/index.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Entry point of the kwtSMS function kit: exports the six Cloud Functions,
 *            declares IAM roles, required APIs and lifecycle hooks.
 * WHY:       Replaces the Firebase Extension entry point (Extensions shut down 2027-03-31).
 *            Users re-export these from their own functions codebase, or install with
 *            `firebase functions:kits:install --package kwtsms-firebase-kit`.
 * USAGE:     export * from 'kwtsms-firebase-kit';
 * DEPENDS:   firebase-functions ^7.4.0, firebase-admin ^14.2.0, kwtsms
 *
 * Functions:
 *   processQueue     - Firestore onCreate: sends SMS from queue documents
 *   onUserCreate     - Auth onCreate (v1): welcome SMS to new users
 *   sendSms          - HTTPS callable: send SMS on demand
 *   handleOtp        - HTTPS callable: OTP generation and verification
 *   scheduledSync    - Scheduled: daily balance/senderID/coverage sync
 *   onInstallHandler - Task queue: seeds templates, settings and first sync (lifecycle)
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { requiresAPI, requiresRole, setGlobalOptions } from 'firebase-functions';
import { afterFirstDeploy, afterRedeploy } from 'firebase-functions/lifecycle';

// 2026-11-16 02:05 +03: initialise Admin once, same as the extension entry point, int-firebase-auth
if (getApps().length === 0) {
  initializeApp();
}

// 2026-11-16 02:05 +03: global options only when deployed standalone. As a kit, the user's wrapping
// code owns them and a second call would warn (migration guide step 9), int-firebase-auth
if (!process.env.FIREBASE_KIT_INSTANCE_ID) {
  setGlobalOptions({ maxInstances: 10 });
}

// 2026-11-16 02:05 +03: extension.yaml `roles: datastore.user` becomes a declarative role; every
// function of the codebase runs with it (migration guide step 6), int-firebase-auth
requiresRole('roles/datastore.user');
requiresAPI('firestore.googleapis.com', 'Reads and writes the SMS queue, templates, logs, OTP codes and settings.');

// 2026-11-16 02:05 +03: extension.yaml lifecycleEvents onInstall/onUpdate become code hooks, both
// run the same idempotent task, int-firebase-auth
afterFirstDeploy({ task: { function: 'onInstallHandler', body: { data: {} } } });
afterRedeploy({ task: { function: 'onInstallHandler', body: { data: {} } } });

export { processQueue } from './handlers/queue';
export { onUserCreate } from './handlers/auth';
export { sendSms } from './handlers/callable';
export { handleOtp } from './handlers/otp';
export { scheduledSync } from './handlers/scheduled';
export { onInstallHandler } from './lifecycle/on-install';
