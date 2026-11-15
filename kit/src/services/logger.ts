/**
 * FILE:      kit/src/services/logger.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Dual logging service of the kwtSMS function kit.
 * WHY:       Ported from functions/src/services/logger.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Logger Service
 *
 * Dual logging: writes structured entries to Firestore sms_logs collection
 * (always on) and to Cloud Functions logger (debug level controlled by config).
 *
 * Credentials are never logged.
 *
 * Related files:
 *   - config.ts: provides collection names and debug_logging setting
 *   - services/sms.ts: logs every send attempt
 *   - services/otp.ts: logs OTP operations
 *   - handlers/*: log trigger-level events
 */

// 2026-11-16 02:05 +03: firebase-admin 14 dropped the admin.firestore namespace, modular import, int-firebase-auth
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { getCollectionNames, getInstanceId, getSettings } from '../config';

export type LogType = 'send' | 'otp' | 'welcome' | 'sync' | 'install' | 'error';
export type LogTrigger = 'queue' | 'auth' | 'callable' | 'otp' | 'scheduled' | 'lifecycle';

export interface LogEntry {
  type: LogType;
  trigger: LogTrigger;
  to?: string;
  message_preview?: string;
  template?: string | null;
  status: string;
  test: boolean;
  sender_id?: string;
  response?: Record<string, unknown> | null;
  error?: string | null;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

export async function writeLog(entry: LogEntry): Promise<void> {
  const collections = getCollectionNames();
  const db = getFirestore();

  const logEntry = {
    ...entry,
    message_preview: entry.message_preview ? entry.message_preview.substring(0, 50) : undefined,
    createdAt: FieldValue.serverTimestamp(),
  };

  // Strip undefined fields
  const cleanEntry = Object.fromEntries(
    Object.entries(logEntry).filter(([, v]) => v !== undefined)
  );

  await db.collection(collections.smsLogs).add(cleanEntry);
}

// 2026-11-16 02:05 +03: tag Cloud Logging entries with the kit instance id (FIREBASE_KIT_INSTANCE_ID,
// replaces EXT_INSTANCE_ID); nothing is added when deployed standalone, int-firebase-auth
function withInstance(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  const instance = getInstanceId();
  return instance ? { ...data, kit_instance: instance } : data;
}

export async function debug(message: string, data?: Record<string, unknown>): Promise<void> {
  const settings = await getSettings();
  if (settings.debug_logging) {
    logger.debug(message, withInstance(data));
  }
}

export function info(message: string, data?: Record<string, unknown>): void {
  logger.info(message, withInstance(data));
}

export function error(message: string, data?: Record<string, unknown>): void {
  logger.error(message, withInstance(data));
}
