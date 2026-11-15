/**
 * FILE:      kit/src/params.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Cloud Functions params and secrets of the kwtSMS function kit.
 * WHY:       Each param of extension.yaml becomes a defineString/defineSecret with the
 *            SAME name, so values of an existing extension instance carry over on
 *            `firebase ext:migrate --package` (Google migration guide, step 4).
 * USAGE:     import { smsCollection, kwtsmsUsername, ... } from './params'; read with .value()
 *            inside a handler; pass the Param itself where a placeholder is expected.
 * DEPENDS:   firebase-functions/params
 */

import { defineSecret, defineString, select } from 'firebase-functions/params';
import type { Expression } from 'firebase-functions/params';

// 2026-11-16 02:05 +03: secrets, same names as extension.yaml (type: secret), int-firebase-auth
export const kwtsmsUsername = defineSecret('KWTSMS_USERNAME', {
  label: 'kwtSMS API Username',
  description: 'Your kwtSMS API username (not your account mobile number).',
});
export const kwtsmsPassword = defineSecret('KWTSMS_PASSWORD', {
  label: 'kwtSMS API Password',
  description: 'Your kwtSMS API password.',
});

/** Every function that talks to the kwtSMS API or sends SMS binds both secrets. */
export const SECRETS = [kwtsmsUsername, kwtsmsPassword];

// 2026-11-16 02:05 +03: collection params with the extension.yaml defaults, int-firebase-auth
export const smsCollection = defineString('SMS_COLLECTION', {
  label: 'SMS Queue Collection',
  description: 'The Firestore collection to watch for outgoing SMS documents.',
  default: 'sms_queue',
});
export const smsTemplatesCollection = defineString('SMS_TEMPLATES_COLLECTION', {
  label: 'Templates Collection',
  description: 'The Firestore collection for SMS message templates.',
  default: 'sms_templates',
});
export const smsLogsCollection = defineString('SMS_LOGS_COLLECTION', {
  label: 'Logs Collection',
  description: 'The Firestore collection for SMS send logs.',
  default: 'sms_logs',
});
export const otpCollection = defineString('OTP_COLLECTION', {
  label: 'OTP Codes Collection',
  description: 'The Firestore collection for OTP verification codes.',
  default: 'otp_codes',
});
export const appName = defineString('APP_NAME', {
  label: 'Application Name',
  description: 'Your application name, used in SMS templates (welcome messages, OTP codes). For example: "MyStore".',
  default: 'My App',
});

// 2026-11-16 02:05 +03: LOCATION keeps the extension name. 2nd gen triggers must be co-located
// with Firestore, so the Firestore multi-region values (nam5, nam7, eur3) are offered too and
// mapped to a Cloud Run region by the `region` expression at the end of this file, int-firebase-auth
export const location = defineString('LOCATION', {
  label: 'Cloud Functions Location',
  description:
    'Where to deploy the functions. Must match your Firestore database location (multi-region values are mapped to a region inside it).',
  default: 'us-central1',
  input: select({
    'us-central1 (Iowa)': 'us-central1',
    'us-east1 (South Carolina)': 'us-east1',
    'europe-west1 (Belgium)': 'europe-west1',
    'europe-west2 (London)': 'europe-west2',
    'asia-east1 (Taiwan)': 'asia-east1',
    'asia-southeast1 (Singapore)': 'asia-southeast1',
    'me-west1 (Tel Aviv)': 'me-west1',
    'Multi-region (Europe: eur3)': 'eur3',
    'Multi-region (United States: nam5)': 'nam5',
    'Multi-region (Iowa, N. Virginia, Oklahoma: nam7)': 'nam7',
  }),
});

// 2026-11-16 02:05 +03: Firestore multi-regions are not Cloud Run regions (deploy hard-fails), so
// map them to a region inside the multi-region as a deploy-time expression, int-firebase-auth
export const region: Expression<string> = location
  .equals('nam5')
  .thenElse(
    'us-central1',
    location
      .equals('nam7')
      .thenElse('us-central1', location.equals('eur3').thenElse('europe-west1', location))
  );
