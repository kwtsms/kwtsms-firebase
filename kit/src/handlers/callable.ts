/**
 * FILE:      kit/src/handlers/callable.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      2nd gen callable sendSms of the kwtSMS function kit.
 * WHY:       Ported from functions/src/handlers/callable.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Callable Handler
 *
 * HTTPS callable function for on-demand SMS sending from client apps.
 * Logs the send to sms_logs via the pipeline (no separate queue write).
 *
 * Requires Firebase Auth (caller must be authenticated).
 * Rate limited to 10 sends per minute per user.
 *
 * Related files:
 *   - services/sms.ts: buildSendPipeline()
 *   - services/rate-limit.ts: per-user send throttle
 *   - config.ts: getSettings(), getSyncData()
 *   - services/logger.ts: logging
 */

import { HttpsError, onCall } from 'firebase-functions/https';
import { getSettings, getSyncData } from '../config';
import { region, SECRETS } from '../params';
import { buildSendPipeline } from '../services/sms';
import { checkSendRateLimit } from '../services/rate-limit';
import { info, error as logError } from '../services/logger';

interface SendSmsRequest {
  action: 'send';
  to: string;
  message?: string;
  template?: string;
  templateData?: Record<string, string>;
  language?: string;
  sender?: string;
}

// 2026-11-16 02:05 +03: 2nd gen onCall; request.data and request.auth replace (data, context), int-firebase-auth
export const sendSms = onCall({ region, secrets: SECRETS }, async (request) => {
  const data = (request.data ?? {}) as SendSmsRequest;
  const context = { auth: request.auth };
  // Require authentication
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  if (!data.to) {
    throw new HttpsError('invalid-argument', 'Field "to" is required.');
  }

  if (!data.message && !data.template) {
    throw new HttpsError(
      'invalid-argument',
      'Either "message" or "template" is required.'
    );
  }

  // Rate limit: 10 sends per minute per user
  const rateLimited = await checkSendRateLimit(context.auth.uid);
  if (rateLimited) {
    throw new HttpsError(
      'resource-exhausted',
      'Too many requests. Please wait before sending again.'
    );
  }

  try {
    const settings = await getSettings();
    const syncData = await getSyncData();

    const result = await buildSendPipeline({
      to: data.to,
      message: data.message,
      template: data.template,
      templateData: data.templateData,
      language: data.language,
      sender: data.sender,
      settings,
      syncData,
      trigger: 'callable',
      metadata: { callerUid: context.auth.uid },
    });

    if (result.status === 'failed') {
      throw new HttpsError('internal', 'Failed to send SMS');
    }

    info('Callable sendSms', { status: result.status, callerUid: context.auth.uid });

    return {
      success: true,
      msgId: (result.response as Record<string, unknown>)?.['msg-id'] || null,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logError('Callable sendSms error', { error: (err as Error).message });
    throw new HttpsError('internal', 'Failed to send SMS');
  }
});
