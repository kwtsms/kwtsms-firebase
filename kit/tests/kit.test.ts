/**
 * FILE:      kit/tests/kit.test.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Structure tests of the kit: params match extension.yaml names, deploy discovery
 *            manifest (functions, gen, roles, APIs, lifecycle hooks), region mapping.
 * WHY:       Migration keeps end-user values only when param names are unchanged (guide step 4);
 *            a wrong trigger path or role would only show at deploy time otherwise.
 * USAGE:     npm test (builds first, discovery runs the compiled lib/)
 * DEPENDS:   built lib/, firebase-functions CLI binary (no network, no project)
 */

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import './helpers/fake-env';

const root = path.resolve(__dirname, '..');
const yaml = readFileSync(path.join(root, '..', 'extension.yaml'), 'utf8');

const cache = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
// discovery takes about 8 seconds, so each distinct env runs once
function discover(env: Record<string, string> = {}) {
  const key = JSON.stringify(env);
  if (!cache.has(key)) cache.set(key, discoverUncached(env));
  return cache.get(key);
}

function discoverUncached(env: Record<string, string>) {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'kit-')), 'manifest.json');
  execFileSync(process.execPath, [path.join(root, 'node_modules/firebase-functions/lib/bin/firebase-functions.js'), root], {
    env: { PATH: process.env.PATH ?? '', GCLOUD_PROJECT: 'demo-kit-test', FUNCTIONS_MANIFEST_OUTPUT_PATH: out, ...env },
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(out, 'utf8'));
}

describe('params vs extension.yaml', () => {
  it('declares every extension param with the SAME name, secrets as secrets', () => {
    const extParams = [...yaml.matchAll(/^\s+- param: (\w+)/gm)].map((m) => m[1]);
    const manifest = discover();
    const kitParams: Array<{ name: string; type: string }> = manifest.params;
    for (const name of extParams) {
      assert.ok(kitParams.some((p) => p.name === name), `param ${name} missing in kit`);
    }
    assert.strictEqual(kitParams.find((p) => p.name === 'KWTSMS_USERNAME')?.type, 'secret');
    assert.strictEqual(kitParams.find((p) => p.name === 'KWTSMS_PASSWORD')?.type, 'secret');
  });
  it('keeps the extension defaults', () => {
    const manifest = discover();
    const def = (n: string) => manifest.params.find((p: { name: string }) => p.name === n)?.default;
    assert.strictEqual(def('SMS_COLLECTION'), 'sms_queue');
    assert.strictEqual(def('SMS_TEMPLATES_COLLECTION'), 'sms_templates');
    assert.strictEqual(def('SMS_LOGS_COLLECTION'), 'sms_logs');
    assert.strictEqual(def('OTP_COLLECTION'), 'otp_codes');
    assert.strictEqual(def('APP_NAME'), 'My App');
    assert.strictEqual(def('LOCATION'), 'us-central1');
  });
});

describe('deploy discovery manifest', () => {
  const manifest = discover();
  it('exports the six functions of the extension', () => {
    assert.deepStrictEqual(
      Object.keys(manifest.endpoints).sort(),
      ['handleOtp', 'onInstallHandler', 'onUserCreate', 'processQueue', 'scheduledSync', 'sendSms']
    );
  });
  it('is 2nd gen except the Auth onCreate trigger', () => {
    for (const [name, ep] of Object.entries<{ platform: string }>(manifest.endpoints)) {
      assert.strictEqual(ep.platform, name === 'onUserCreate' ? 'gcfv1' : 'gcfv2', name);
    }
  });
  it('binds both secrets on every function', () => {
    for (const ep of Object.values<{ secretEnvironmentVariables: Array<{ key: string }> }>(manifest.endpoints)) {
      assert.deepStrictEqual(ep.secretEnvironmentVariables.map((s) => s.key), ['KWTSMS_USERNAME', 'KWTSMS_PASSWORD']);
    }
  });
  it('triggers on the SMS_COLLECTION param, not on frozen text', () => {
    assert.strictEqual(
      manifest.endpoints.processQueue.eventTrigger.eventFilterPathPatterns.document,
      '{{ params.SMS_COLLECTION }}/{docId}'
    );
  });
  it('declares the datastore.user role (extension.yaml roles)', () => {
    assert.ok(manifest.requiredRoles.includes('roles/datastore.user'));
    assert.ok(manifest.requiredAPIs.some((a: { api: string }) => a.api === 'firestore.googleapis.com'));
  });
  it('declares idempotent lifecycle hooks on onInstallHandler', () => {
    assert.strictEqual(manifest.lifecycleHooks.afterFirstDeploy.task.function, 'onInstallHandler');
    assert.strictEqual(manifest.lifecycleHooks.afterRedeploy.task.function, 'onInstallHandler');
  });
  it('keeps the daily schedule', () => {
    assert.strictEqual(manifest.endpoints.scheduledSync.scheduleTrigger.schedule, 'every 24 hours');
  });
  it('sets global options only when standalone, not as a kit instance', () => {
    assert.strictEqual(manifest.endpoints.sendSms.maxInstances, 10);
    const asKit = discover({ FIREBASE_KIT_INSTANCE_ID: 'kwtsms' });
    assert.notStrictEqual(asKit.endpoints.sendSms.maxInstances, 10);
  });
});

describe('region mapping', () => {
  it('maps Firestore multi-regions to a Cloud Run region', async () => {
    const { region } = await import('../src/params');
    const cases: Record<string, string> = {
      nam5: 'us-central1',
      nam7: 'us-central1',
      eur3: 'europe-west1',
      'me-west1': 'me-west1',
    };
    for (const [input, expected] of Object.entries(cases)) {
      process.env.LOCATION = input;
      assert.strictEqual(region.value(), expected, input);
    }
    delete process.env.LOCATION;
  });
});
