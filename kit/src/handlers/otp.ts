/**
 * FILE:      kit/src/handlers/otp.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      2nd gen callable handleOtp of the kwtSMS function kit.
 * WHY:       Ported from functions/src/handlers/otp.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * OTP Handler
 *
 * HTTPS callable function for OTP generation and verification.
 * Two actions: sendOtp and verifyOtp.
 *
 * sendOtp: generates code, stores in Firestore (hashed), sends via kwtSMS.
 * verifyOtp: checks code (timing-safe), enforces max attempts and expiry.
 *
 * Uses generic error messages to prevent phone number enumeration.
 * Requires Firebase Auth (caller must be authenticated).
 * Rate limited: 60-second cooldown between OTP sends to the same phone.
 *
 * Related files:
 *   - services/otp.ts: generateCode(), storeOtp(), verifyOtp(), checkCooldown()
 *   - services/sms.ts: buildSendPipeline()
 *   - services/logger.ts: logging
 */

import { HttpsError, onCall } from 'firebase-functions/https';
import { normalizePhone } from 'kwtsms';
import { getSettings, getSyncData } from '../config';
import { region, SECRETS } from '../params';
import { generateCode, storeOtp, verifyOtp as verifyOtpCode, checkCooldown } from '../services/otp';
import { buildSendPipeline } from '../services/sms';
import { writeLog, info, error as logError } from '../services/logger';

interface OtpRequest {
  action: 'sendOtp' | 'verifyOtp';
  phone: string;
  code?: string;
}

// 2026-11-16 02:05 +03: 2nd gen onCall, see sendSms, int-firebase-auth
export const handleOtp = onCall({ region, secrets: SECRETS }, async (request) => {
  const data = (request.data ?? {}) as OtpRequest;
  const context = { auth: request.auth };
  // Require authentication
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  if (!data.phone) {
    throw new HttpsError('invalid-argument', 'Field "phone" is required.');
  }

  if (!data.action || !['sendOtp', 'verifyOtp'].includes(data.action)) {
    throw new HttpsError(
      'invalid-argument',
      'Field "action" must be "sendOtp" or "verifyOtp".'
    );
  }

  // Normalize phone with error handling for malformed input
  let phone: string;
  try {
    phone = normalizePhone(data.phone);
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid phone number format.');
  }

  if (!phone) {
    throw new HttpsError('invalid-argument', 'Invalid phone number format.');
  }

  if (data.action === 'sendOtp') {
    return handleSendOtp(phone, context.auth.uid);
  }

  // data.action === 'verifyOtp' (guaranteed by validation above)
  if (!data.code) {
    throw new HttpsError('invalid-argument', 'Field "code" is required.');
  }
  return handleVerifyOtp(phone, data.code, context.auth.uid);
});

async function handleSendOtp(phone: string, callerUid: string) {
  try {
    // Enforce cooldown: 60 seconds between OTP sends to the same phone
    const onCooldown = await checkCooldown(phone);
    if (onCooldown) {
      throw new HttpsError('internal', 'Failed to send verification code');
    }

    const settings = await getSettings();
    const syncData = await getSyncData();
    const code = generateCode();

    await storeOtp(phone, code);

    const result = await buildSendPipeline({
      to: phone,
      template: 'otp',
      templateData: {
        code,
        app_name: settings.app_name,
        expiry_minutes: '5',
      },
      language: 'en',
      settings,
      syncData,
      trigger: 'otp',
      metadata: { callerUid },
    });

    await writeLog({
      type: 'otp',
      trigger: 'otp',
      to: phone,
      status: result.status,
      test: settings.test_mode,
      sender_id: settings.selected_sender_id,
      error: result.error,
      metadata: { action: 'sendOtp', callerUid },
    });

    if (result.status === 'failed') {
      throw new HttpsError('internal', 'Failed to send verification code');
    }

    info('OTP sent', { phone: phone.substring(0, 6) + '****' });

    return { success: true, expiresIn: 300 };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logError('sendOtp error', { error: (err as Error).message });
    throw new HttpsError('internal', 'Failed to send verification code');
  }
}

async function handleVerifyOtp(phone: string, code: string, callerUid: string) {
  try {
    const settings = await getSettings();
    const result = await verifyOtpCode(phone, code);

    await writeLog({
      type: 'otp',
      trigger: 'otp',
      to: phone,
      status: result.success ? 'verified' : 'failed',
      test: settings.test_mode,
      sender_id: settings.selected_sender_id,
      error: result.error || null,
      metadata: { action: 'verifyOtp', callerUid },
    });

    info('OTP verify', { success: result.success });

    // Return generic error to prevent phone enumeration
    if (!result.success) {
      return { success: false, error: 'Verification failed' };
    }
    return { success: true };
  } catch (err) {
    logError('verifyOtp error', { error: (err as Error).message });
    throw new HttpsError('internal', 'Verification failed');
  }
}
