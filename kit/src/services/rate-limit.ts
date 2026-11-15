/**
 * FILE:      kit/src/services/rate-limit.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Send rate limit service of the kwtSMS function kit.
 * WHY:       Ported from functions/src/services/rate-limit.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Rate Limit Service
 *
 * Simple Firestore-based rate limiter using a sliding window per key.
 * Each key (e.g., user UID) gets a document tracking the count and
 * window start time. Uses a transaction for atomicity.
 *
 * Related files:
 *   - handlers/callable.ts: rate limits per-user SMS sends
 *   - services/otp.ts: OTP cooldown (handled separately via OTP doc)
 */

// 2026-11-16 02:05 +03: firebase-admin 14 dropped the admin.firestore namespace, modular import, int-firebase-auth
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const RATE_LIMIT_COLLECTION = 'sms_rate_limits';
const WINDOW_MS = 60_000; // 1 minute
const MAX_SENDS_PER_WINDOW = 10;

/**
 * Check and increment the rate limit counter for a key.
 * Returns true if the request should be rejected (rate limited).
 */
export async function checkSendRateLimit(key: string): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(key);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const now = Date.now();

    if (!doc.exists) {
      tx.set(ref, { count: 1, window_start: now });
      return false;
    }

    const data = doc.data()!;

    // Start a new window if the old one expired
    if (now - data.window_start > WINDOW_MS) {
      tx.set(ref, { count: 1, window_start: now });
      return false;
    }

    if (data.count >= MAX_SENDS_PER_WINDOW) {
      return true; // rate limited
    }

    tx.update(ref, { count: FieldValue.increment(1) });
    return false;
  });
}
