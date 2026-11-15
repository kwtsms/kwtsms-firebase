/**
 * FILE:      kit/src/handlers/scheduled.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      2nd gen daily sync schedule of the kwtSMS function kit.
 * WHY:       Ported from functions/src/handlers/scheduled.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Scheduled Sync Handler
 *
 * Runs once daily. Syncs balance, sender IDs, and coverage from the
 * kwtSMS API and caches results in Firestore sms_config/sync.
 *
 * Each API call is independent: if one fails, the others still run.
 *
 * Related files:
 *   - kwtsms-client.ts: creates KwtSMS client
 *   - config.ts: getCredentials()
 *   - services/logger.ts: logging
 */

import { onSchedule } from 'firebase-functions/scheduler';
// 2026-11-16 02:05 +03: firebase-admin 14 dropped the admin.firestore namespace, modular import, int-firebase-auth
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createClient } from '../kwtsms-client';
import { region, SECRETS } from '../params';
import { writeLog, info, error as logError, debug } from '../services/logger';

// 2026-11-16 02:05 +03: 2nd gen onSchedule, same 24 hour cadence, int-firebase-auth
export const scheduledSync = onSchedule(
  { schedule: 'every 24 hours', region, secrets: SECRETS },
  async () => {
    await runSync();
  }
);

/** Run sync. Called by scheduled trigger and on-install lifecycle. */
export async function runSync(): Promise<void> {
  info('Starting scheduled sync');
  const startTime = Date.now();

  const db = getFirestore();
  const syncRef = db.doc('sms_config/sync');
  const updates: Record<string, unknown> = {};
  const errors: string[] = [];

  let client;
  try {
    client = await createClient();
  } catch (err) {
    logError('Sync failed: cannot create client', { error: (err as Error).message });
    await writeLog({
      type: 'sync',
      trigger: 'scheduled',
      status: 'failed',
      test: false,
      error: (err as Error).message,
    });
    return;
  }

  // Sync balance
  try {
    const balance = await client.balance();
    if (balance !== null) {
      updates.balance = balance;
      await debug('Synced balance', { balance });
    }
  } catch (err) {
    errors.push(`balance: ${(err as Error).message}`);
  }

  // Sync sender IDs
  try {
    const response = await client.senderids();
    if (response.result === 'OK' && response.senderids) {
      updates.sender_ids = response.senderids;
      await debug('Synced sender IDs', { count: response.senderids.length });
    } else if (response.code) {
      errors.push(`senderids: ${response.code} ${response.description}`);
    }
  } catch (err) {
    errors.push(`senderids: ${(err as Error).message}`);
  }

  // Sync coverage
  try {
    const response = await client.coverage();
    if (response.result === 'OK' && (response as Record<string, unknown>).coverage) {
      updates.coverage = (response as Record<string, unknown>).coverage;
      await debug('Synced coverage', { count: ((response as Record<string, unknown>).coverage as unknown[]).length });
    } else if (response.code) {
      errors.push(`coverage: ${response.code} ${response.description}`);
    }
  } catch (err) {
    errors.push(`coverage: ${(err as Error).message}`);
  }

  // Save whatever succeeded
  if (Object.keys(updates).length > 0) {
    updates.last_synced_at = FieldValue.serverTimestamp();
    await syncRef.set(updates, { merge: true });
  }

  const duration = Date.now() - startTime;
  const status = errors.length === 0 ? 'success' : 'partial';

  info('Sync complete', { status, duration_ms: duration, errors });

  await writeLog({
    type: 'sync',
    trigger: 'scheduled',
    status,
    test: false,
    error: errors.length > 0 ? errors.join('; ') : null,
    duration_ms: duration,
    metadata: updates,
  });
}
