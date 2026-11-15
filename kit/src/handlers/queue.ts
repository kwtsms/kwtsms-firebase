/**
 * FILE:      kit/src/handlers/queue.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      2nd gen Firestore onCreate queue trigger of the kwtSMS function kit.
 * WHY:       Ported from functions/src/handlers/queue.ts of the Firebase Extension (Extensions shut down
 *            2027-03-31); behaviour is kept, changes are marked with dated comments.
 * USAGE:     imported by src/index.ts
 * DEPENDS:   see imports
 */

/**
 * Queue Handler
 *
 * Firestore onCreate trigger on the sms_queue collection. When a document
 * is created, it runs the SMS send pipeline and updates the document
 * with the result.
 *
 * Input document fields: to, message, template, templateData, language, sender
 * Output fields added: status, response, error, processedAt, createdAt
 *
 * Skips documents with source='callable' to prevent trigger loops.
 * Validates required fields before processing.
 * Idempotency guard: skips documents already in processing/sent state (retry safety).
 *
 * Related files:
 *   - services/sms.ts: buildSendPipeline()
 *   - config.ts: getSettings(), getSyncData()
 *   - services/logger.ts: debug logging
 */

import { onDocumentCreated } from 'firebase-functions/firestore';
// 2026-11-16 02:05 +03: firebase-admin 14 dropped the admin.firestore namespace, modular import, int-firebase-auth
import { FieldValue } from 'firebase-admin/firestore';
import { getSettings, getSyncData } from '../config';
import { expr } from 'firebase-functions/params';
import { region, SECRETS, smsCollection } from '../params';
import { buildSendPipeline } from '../services/sms';
import { debug, error as logError } from '../services/logger';

// 2026-11-16 02:05 +03: 2nd gen onDocumentCreated; the collection is the SMS_COLLECTION param used as a
// trigger-path placeholder via the expr tag (a plain template literal would freeze the text 'params.SMS_COLLECTION'), region comes from LOCATION, secrets bound explicitly (migration guide
// steps 3 and 4), int-firebase-auth
export const processQueue = onDocumentCreated(
  { document: expr`${smsCollection}/{docId}`, region, secrets: SECRETS },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const context = { params: event.params };
    const data = snap.data();
    const docRef = snap.ref;

    await debug('processQueue triggered', { docId: context.params.docId });

    // Skip documents created by callable handler (audit trail only)
    if (data.source === 'callable') {
      await debug('Skipping callable audit document', { docId: context.params.docId });
      return;
    }

    // Idempotency guard: skip if already processed (retry safety)
    if (data.status === 'processing' || data.status === 'sent') {
      await debug('Skipping already processed document', { docId: context.params.docId, status: data.status });
      return;
    }

    // Validate required fields
    if (!data.to || typeof data.to !== 'string') {
      await docRef.update({
        status: 'failed',
        error: 'Missing or invalid required field: "to"',
        processedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    if (!data.message && !data.template) {
      await docRef.update({
        status: 'failed',
        error: 'Either "message" or "template" is required',
        processedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    // Mark as processing
    await docRef.update({
      status: 'processing',
      createdAt: FieldValue.serverTimestamp(),
    });

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
        trigger: 'queue',
      });

      await docRef.update({
        status: result.status,
        response: result.response || null,
        error: result.error || null,
        test: settings.test_mode,
        processedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logError('processQueue error', { error: (err as Error).message });
      await docRef.update({
        status: 'failed',
        error: (err as Error).message,
        processedAt: FieldValue.serverTimestamp(),
      });
    }
    }
);
