/**
 * FILE:      kit/tests/handlers.test.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Unit tests of the 2nd gen handlers through firebase-functions-test wrap().
 * WHY:       Proves the port keeps the extension behaviour: auth required, input validation,
 *            test mode by default (test=1), queue idempotency, no network, no real SMS.
 * USAGE:     npm test
 * DEPENDS:   firebase-functions-test, tests/helpers/fake-env.ts
 */

import assert from 'node:assert';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { FAKE_MOBILE, installFakes, type Fakes } from './helpers/fake-env';
import firebaseFunctionsTest from 'firebase-functions-test';

const t = firebaseFunctionsTest();
let fakes: Fakes;
let kit: typeof import('../src/index');
let config: typeof import('../src/config');

before(async () => {
  fakes = installFakes();
  kit = await import('../src/index');
  config = await import('../src/config');
});
after(() => {
  fakes.restore();
  t.cleanup();
});
beforeEach(() => {
  config.clearConfigCache();
  fakes.docs.clear();
  // coverage lets the fictional NANP number through the country-code prepend and coverage filter
  fakes.docs.set('sms_config/sync', { balance: 10, sender_ids: ['KWT-SMS'], coverage: [{ prefix: '965' }, { prefix: '1' }] });
  fakes.added.length = 0;
  fakes.apiCalls.length = 0;
});
afterEach(() => undefined);

const call = (fn: unknown, data: unknown, auth?: { uid: string }) =>
  (t.wrap as (f: unknown) => (req: unknown) => Promise<unknown>)(fn)({
    data,
    auth: auth ? { uid: auth.uid, token: {} } : undefined,
  });

describe('callable sendSms', () => {
  it('rejects unauthenticated callers', async () => {
    await assert.rejects(call(kit.sendSms, { to: FAKE_MOBILE, message: 'hi' }), { code: 'unauthenticated' });
  });
  it('requires "to"', async () => {
    await assert.rejects(call(kit.sendSms, { message: 'hi' }, { uid: 'u1' }), { code: 'invalid-argument' });
  });
  it('requires message or template', async () => {
    await assert.rejects(call(kit.sendSms, { to: FAKE_MOBILE }, { uid: 'u1' }), { code: 'invalid-argument' });
  });
  it('sends in test mode by default (test=1) and never touches the network', async () => {
    await call(kit.sendSms, { to: FAKE_MOBILE, message: 'Hello' }, { uid: 'u1' });
    const send = fakes.apiCalls.find((c) => c.path === '/API/send/');
    assert.ok(send, 'one send call captured');
    assert.strictEqual(send.payload.test, '1');
    assert.strictEqual(send.payload.username, 'fake-user');
  });
});

describe('callable handleOtp', () => {
  it('rejects unauthenticated callers', async () => {
    await assert.rejects(call(kit.handleOtp, { action: 'sendOtp', phone: FAKE_MOBILE }), { code: 'unauthenticated' });
  });
  it('requires a phone', async () => {
    await assert.rejects(call(kit.handleOtp, { action: 'sendOtp' }, { uid: 'u1' }), { code: 'invalid-argument' });
  });
  it('requires an action', async () => {
    await assert.rejects(call(kit.handleOtp, { phone: FAKE_MOBILE }, { uid: 'u1' }), { code: 'invalid-argument' });
  });
});

describe('processQueue', () => {
  const event = (data: Record<string, unknown>) => {
    const updates: Array<Record<string, unknown>> = [];
    return {
      updates,
      ev: {
        data: { data: () => data, ref: { update: async (u: Record<string, unknown>) => void updates.push(u) } },
        params: { docId: 'doc1' },
      },
    };
  };
  // firebase-functions-test 3.5.0 builds Firestore event mocks with admin.firestore(), which
  // firebase-admin 14 removed, so the trigger is invoked through its own .run() with a hand-made event
  const run = (ev: unknown) => (kit.processQueue as unknown as { run: (e: unknown) => Promise<unknown> }).run(ev);

  it('fails a document without "to"', async () => {
    const { ev, updates } = event({ message: 'hi' });
    await run(ev);
    assert.strictEqual(updates[0].status, 'failed');
  });
  it('fails a document without message or template', async () => {
    const { ev, updates } = event({ to: FAKE_MOBILE });
    await run(ev);
    assert.strictEqual(updates[0].status, 'failed');
  });
  it('skips callable audit documents and already processed ones', async () => {
    for (const data of [{ source: 'callable' }, { to: FAKE_MOBILE, message: 'x', status: 'sent' }]) {
      const { ev, updates } = event(data);
      await run(ev);
      assert.strictEqual(updates.length, 0);
    }
  });
  it('sends in test mode and records the result', async () => {
    const { ev, updates } = event({ to: FAKE_MOBILE, message: 'Hello' });
    await run(ev);
    assert.strictEqual(updates[0].status, 'processing');
    assert.strictEqual(updates[1].status, 'sent');
    assert.strictEqual(updates[1].test, true);
    assert.strictEqual(fakes.apiCalls.find((c) => c.path === '/API/send/')?.payload.test, '1');
  });
});

describe('onInstallHandler lifecycle task (idempotent)', () => {
  const runTask = () =>
    (t.wrap as (f: unknown) => (r: unknown) => Promise<unknown>)(kit.onInstallHandler)({ data: {} });

  it('seeds settings and templates once, never overwrites edits', async () => {
    await runTask();
    const settings = fakes.docs.get('sms_config/settings');
    assert.ok(settings);
    assert.strictEqual(settings.test_mode, true, 'test mode stays the default');
    const templates = [...fakes.docs.keys()].filter((k) => k.startsWith('sms_templates/'));
    assert.ok(templates.length >= 8);

    fakes.docs.set('sms_templates/welcome', { body_en: 'edited by the user' });
    fakes.docs.set('sms_config/settings', { ...settings, test_mode: false });
    config.clearConfigCache();
    await runTask();
    assert.strictEqual(fakes.docs.get('sms_templates/welcome')?.body_en, 'edited by the user');
    assert.strictEqual(fakes.docs.get('sms_config/settings')?.test_mode, false);
  });
});

describe('onUserCreate (v1 auth trigger)', () => {
  const runUser = (user: Record<string, unknown>) =>
    (t.wrap as (f: unknown) => (u: unknown) => Promise<unknown>)(kit.onUserCreate)(user);

  it('skips users without a phone number', async () => {
    await runUser({ uid: 'u1' });
    assert.strictEqual(fakes.apiCalls.length, 0);
  });
  it('sends a welcome SMS in test mode to phone users', async () => {
    fakes.docs.set('sms_templates/welcome', { body_en: 'Welcome to {{app_name}}', body_ar: 'x' });
    await runUser({ uid: 'u2', phoneNumber: `+${FAKE_MOBILE}` });
    assert.strictEqual(fakes.apiCalls.find((c) => c.path === '/API/send/')?.payload.test, '1');
  });
});
