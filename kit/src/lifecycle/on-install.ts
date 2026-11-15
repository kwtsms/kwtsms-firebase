/**
 * FILE:      kit/src/lifecycle/on-install.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      2nd gen task function run by the lifecycle hooks of the kwtSMS function kit.
 * WHY:       Ported from functions/src/lifecycle/on-install.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Install Lifecycle Handler
 *
 * Runs on extension install and update. Seeds default templates,
 * creates the settings document with defaults, and runs the first sync.
 *
 * Templates that already exist are not overwritten (preserves user edits).
 * Settings that already exist are not overwritten (preserves user changes).
 *
 * Related files:
 *   - templates/defaults.ts: default template definitions
 *   - config.ts: DEFAULTS, getCollectionNames()
 *   - handlers/scheduled.ts: runSync()
 *   - services/logger.ts: logging
 */

import { onTaskDispatched } from 'firebase-functions/tasks';
// 2026-11-16 02:05 +03: firebase-admin 14 dropped the admin.firestore namespace, modular import, int-firebase-auth
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_TEMPLATES } from '../templates/defaults';
import { DEFAULTS, getCollectionNames } from '../config';
import { runSync } from '../handlers/scheduled';
import { region, SECRETS } from '../params';
import { writeLog, info, error as logError } from '../services/logger';

// 2026-11-16 02:05 +03: 2nd gen task queue function, run by afterFirstDeploy and afterRedeploy (index.ts).
// Idempotent: existing settings and templates are never overwritten and the sync only refreshes
// cached data, so `firebase functions:lifecycle:run afterFirstDeploy <codebase>` is safe to repeat.
// int-firebase-auth
export const onInstallHandler = onTaskDispatched(
  { region, secrets: SECRETS, retryConfig: { maxAttempts: 5, minBackoffSeconds: 60 } },
  async () => {
  info('Running install/update lifecycle');
  const db = getFirestore();
  const collections = getCollectionNames();

  // 1. Create settings document with defaults (if not exists)
  const settingsRef = db.doc('sms_config/settings');
  const settingsDoc = await settingsRef.get();

  if (!settingsDoc.exists) {
    await settingsRef.set({
      ...DEFAULTS,
      createdAt: FieldValue.serverTimestamp(),
    });
    info('Created default settings');
  }

  // 2. Seed default templates (skip existing)
  let seeded = 0;
  for (const template of DEFAULT_TEMPLATES) {
    const templateRef = db.collection(collections.smsTemplates).doc(template.name);
    const existing = await templateRef.get();

    if (!existing.exists) {
      await templateRef.set({
        name: template.name,
        description: template.description,
        body_en: template.body_en,
        body_ar: template.body_ar,
        body_default_en: template.body_en,
        body_default_ar: template.body_ar,
        placeholders: template.placeholders,
        is_system: true,
        editable: true,
        deletable: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      seeded++;
    }
  }
  info('Templates seeded', { seeded, total: DEFAULT_TEMPLATES.length });

  // 3. Run initial sync (balance, sender IDs, coverage)
  try {
    await runSync();
    info('Initial sync complete');
  } catch (err) {
    logError('Initial sync failed', { error: (err as Error).message });
  }

  await writeLog({
    type: 'install',
    trigger: 'lifecycle',
    status: 'success',
    test: false,
    metadata: { templates_seeded: seeded },
  });
  }
);
