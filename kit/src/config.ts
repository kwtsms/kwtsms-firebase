/**
 * FILE:      kit/src/config.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Kit params plus Firestore runtime settings and cache of the kwtSMS function kit.
 * WHY:       Ported from functions/src/config.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Config Service
 *
 * Reads kit params (defineString/defineSecret, values from .env) and runtime
 * settings from Firestore. Params require a redeploy to change.
 * Firestore settings can be changed at any time.
 *
 * Settings and sync data are cached with a short TTL to avoid redundant
 * Firestore reads within a single function invocation.
 *
 * Related files:
 *   - kwtsms-client.ts: uses config to create KwtSMS instances
 *   - handlers/*: all handlers read config before processing
 */

// 2026-11-16 02:05 +03: firebase-admin 14 dropped the admin.firestore namespace, modular import, int-firebase-auth
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { appName, kwtsmsPassword, kwtsmsUsername, otpCollection, smsCollection, smsLogsCollection, smsTemplatesCollection } from './params';

// --- Types ---

export interface Settings {
  gateway_enabled: boolean;
  test_mode: boolean;
  debug_logging: boolean;
  default_country_code: string;
  selected_sender_id: string;
  app_name: string;
}

export interface SyncData {
  balance: number;
  sender_ids: string[];
  coverage: Array<{ prefix: string; country: string }>;
  last_synced_at: Timestamp | null;
}

export interface CollectionNames {
  smsQueue: string;
  smsTemplates: string;
  smsLogs: string;
  otpCodes: string;
}

// --- Defaults ---

export const DEFAULTS: Settings = {
  gateway_enabled: true,
  test_mode: true,
  debug_logging: false,
  default_country_code: '965',
  selected_sender_id: 'KWT-SMS',
  // 2026-11-16 02:05 +03: getter so the APP_NAME param is read at call time, never at module load
  // (params must not resolve during deploy discovery), int-firebase-auth
  get app_name(): string {
    return appName.value() || 'My App';
  },
};

// --- In-memory cache (short TTL to cover a single invocation) ---

const CACHE_TTL_MS = 5000;

let settingsCache: { value: Settings; expires: number } | null = null;
let syncDataCache: { value: SyncData | null; expires: number } | null = null;

/** Clear in-memory caches. Used in tests. */
export function clearConfigCache(): void {
  settingsCache = null;
  syncDataCache = null;
}

// --- Kit params (Cloud Functions params and secrets, see params.ts) ---

export function getCredentials(): { username: string; password: string } {
  return {
    // 2026-11-16 02:05 +03: secrets via defineSecret, bound on every function, int-firebase-auth
    username: kwtsmsUsername.value() || '',
    password: kwtsmsPassword.value() || '',
  };
}

export function getCollectionNames(): CollectionNames {
  return {
    smsQueue: smsCollection.value() || 'sms_queue',
    smsTemplates: smsTemplatesCollection.value() || 'sms_templates',
    smsLogs: smsLogsCollection.value() || 'sms_logs',
    otpCodes: otpCollection.value() || 'otp_codes',
  };
}

// --- Firestore Runtime Settings ---

/**
 * 2026-11-16 02:05 +03: instance id the Firebase CLI sets for each kit instance (replaces
 * EXT_INSTANCE_ID). Not a param, read straight from the environment; undefined when the code
 * is deployed standalone, int-firebase-auth
 */
export function getInstanceId(): string | undefined {
  return process.env.FIREBASE_KIT_INSTANCE_ID || undefined;
}

export async function getSettings(): Promise<Settings> {
  if (settingsCache && Date.now() < settingsCache.expires) {
    return settingsCache.value;
  }

  const db = getFirestore();
  const doc = await db.doc('sms_config/settings').get();

  let settings: Settings;
  if (!doc.exists) {
    settings = { ...DEFAULTS };
  } else {
    const data = doc.data()!;
    settings = {
      gateway_enabled: data.gateway_enabled ?? DEFAULTS.gateway_enabled,
      test_mode: data.test_mode ?? DEFAULTS.test_mode,
      debug_logging: data.debug_logging ?? DEFAULTS.debug_logging,
      default_country_code: data.default_country_code ?? DEFAULTS.default_country_code,
      selected_sender_id: data.selected_sender_id ?? DEFAULTS.selected_sender_id,
      app_name: data.app_name ?? DEFAULTS.app_name,
    };
  }

  settingsCache = { value: settings, expires: Date.now() + CACHE_TTL_MS };
  return { ...settings };
}

export async function getSyncData(): Promise<SyncData | null> {
  if (syncDataCache && Date.now() < syncDataCache.expires) {
    return syncDataCache.value;
  }

  const db = getFirestore();
  const doc = await db.doc('sms_config/sync').get();

  let syncData: SyncData | null;
  if (!doc.exists) {
    syncData = null;
  } else {
    const data = doc.data()!;
    syncData = {
      balance: data.balance ?? 0,
      sender_ids: data.sender_ids ?? [],
      coverage: data.coverage ?? [],
      last_synced_at: data.last_synced_at ?? null,
    };
  }

  syncDataCache = { value: syncData, expires: Date.now() + CACHE_TTL_MS };
  return syncData ? { ...syncData } : null;
}
