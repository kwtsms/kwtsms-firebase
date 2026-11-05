import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { db, seedSettings, seedSync, cleanUp } from './setup';
import { buildSendPipeline } from '../src/services/sms';
import { runSync } from '../src/handlers/scheduled';
import { getSettings, getSyncData, clearConfigCache } from '../src/config';
// 2026-11-05 10:03 +03: live sends (test=1) go only to KWTSMS_TEST_NUMBER and skip when it is
// unset; sample mobiles here belonged to real people, int-testnumber
import { PLACEHOLDER, requireNumber, variants } from './helpers/test-number';

describe('Integration Tests (real kwtSMS API, test=1)', () => {
  before(async () => {
    // Verify credentials are set
    if (!process.env.KWTSMS_USERNAME || !process.env.KWTSMS_PASSWORD) {
      throw new Error(
        'Set KWTSMS_USERNAME and KWTSMS_PASSWORD env vars to run integration tests'
      );
    }
    await cleanUp();
    await seedSettings();
    await seedSync();
  });

  after(async () => {
    await cleanUp();
  });

  describe('Scheduled Sync (real API)', () => {
    it('syncs balance, sender IDs, and coverage from kwtSMS', async () => {
      await runSync();

      const sync = await getSyncData();
      assert.ok(sync, 'Sync data should exist');
      assert.ok(typeof sync.balance === 'number', 'Balance should be a number');
      assert.ok(Array.isArray(sync.sender_ids), 'Sender IDs should be an array');
      assert.ok(sync.sender_ids.length > 0, 'Should have at least one sender ID');
      assert.ok(sync.last_synced_at, 'Should have last_synced_at');
    });
  });

  describe('SMS Send Pipeline (real API, test=1)', () => {
    it('sends SMS with inline message in test mode', async (t) => {
      // 2026-11-05 10:03 +03: env test number instead of a hard-coded mobile, int-testnumber
      const to = requireNumber(t);
      if (!to) return;
      const settings = await getSettings();
      const syncData = await getSyncData();

      const result = await buildSendPipeline({
        to,
        message: 'Integration test message from kwtsms-firebase',
        settings,
        syncData,
        trigger: 'callable',
      });

      assert.strictEqual(result.status, 'sent');
      assert.ok(result.response, 'Should have API response');
    });

    it('sends SMS with template', async (t) => {
      // 2026-11-05 10:03 +03: env test number instead of a hard-coded mobile, int-testnumber
      const to = requireNumber(t);
      if (!to) return;
      // Seed a template first
      await db.collection('sms_templates').doc('order_confirmed').set({
        name: 'order_confirmed',
        body_en: 'Hi {{customer_name}}, your order {{order_id}} is confirmed.',
        body_ar: 'مرحبا {{customer_name}}، تم تأكيد طلبك {{order_id}}.',
        body_default_en: 'Hi {{customer_name}}, your order {{order_id}} is confirmed.',
        body_default_ar: 'مرحبا {{customer_name}}، تم تأكيد طلبك {{order_id}}.',
        placeholders: ['customer_name', 'order_id'],
        is_system: true,
        editable: true,
        deletable: false,
      });

      const settings = await getSettings();
      const syncData = await getSyncData();

      const result = await buildSendPipeline({
        to,
        template: 'order_confirmed',
        templateData: { customer_name: 'Test User', order_id: 'ORD-TEST-001' },
        language: 'en',
        settings,
        syncData,
        trigger: 'callable',
      });

      assert.strictEqual(result.status, 'sent');
      assert.ok(result.message?.includes('Test User'));
      assert.ok(result.message?.includes('ORD-TEST-001'));
    });

    it('skips when gateway is disabled', async () => {
      const settings = await getSettings();
      settings.gateway_enabled = false;

      const result = await buildSendPipeline({
        // 2026-11-05 10:03 +03: pass-through only (gateway off, never sent), placeholder, int-testnumber
        to: PLACEHOLDER,
        message: 'Should not send',
        settings,
        syncData: null,
        trigger: 'callable',
      });

      assert.strictEqual(result.status, 'skipped');
      assert.strictEqual(result.error, 'Gateway is disabled');
    });

    it('prepends country code to local number', async (t) => {
      // 2026-11-05 10:03 +03: this test sent live to a hard-coded Saudi mobile; it now sends the
      // local part of KWTSMS_TEST_NUMBER with default code 965, the only allowed live target, int-testnumber
      const n = requireNumber(t);
      if (!n) return;
      clearConfigCache();
      const settings = await getSettings();
      settings.default_country_code = '965';
      const syncData = await getSyncData();

      const result = await buildSendPipeline({
        to: variants(n).local,
        message: 'Test prepend country code',
        settings,
        syncData,
        trigger: 'callable',
      });

      // Pipeline should process (not skip); send may succeed or fail depending on API
      assert.notStrictEqual(result.status, 'skipped', 'should not be skipped (gateway is enabled)');
    });

    it('writes log entry to sms_logs', async () => {
      const logs = await db.collection('sms_logs').get();
      assert.ok(logs.size > 0, 'Should have log entries');

      const logDoc = logs.docs[0].data();
      assert.ok(logDoc.type, 'Log should have type');
      assert.ok(logDoc.status, 'Log should have status');
      assert.ok(logDoc.createdAt, 'Log should have createdAt');
    });
  });
});
