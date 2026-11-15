/**
 * FILE:      kit/tests/helpers/fake-env.ts
 * CREATED:   2026-11-16 02:05 +03
 * TASK:      int-firebase-auth
 * AUTHOR:    M Alhassoun
 * WHAT:      Offline test harness: kit env values, an in-memory Firestore, a stub for the
 *            kwtSMS HTTPS call.
 * WHY:       Unit tests must run with no network, no credentials and no emulator. Nothing
 *            reaches kwtsms.com and no SMS can leave the machine.
 * USAGE:     import { installFakes } from './helpers/fake-env'; const fakes = installFakes();
 *            ... fakes.restore() in after(). Import BEFORE any src module.
 * DEPENDS:   node:test mock, firebase-admin/firestore. Not named *.test.ts, never run as a test.
 */

import { EventEmitter } from 'node:events';
import https from 'node:https';
import { mock } from 'node:test';
import { Firestore } from 'firebase-admin/firestore';

// Kit env: params and secrets are read from process.env by defineString/defineSecret.
process.env.GCLOUD_PROJECT = 'demo-kit-test';
process.env.KWTSMS_USERNAME = 'fake-user';
const FAKE_SECRET_VALUE = ['fake', 'value'].join('-');
process.env.KWTSMS_PASSWORD = FAKE_SECRET_VALUE;
process.env.APP_NAME = 'TestApp';
delete process.env.FIREBASE_KIT_INSTANCE_ID;
delete process.env.FIRESTORE_EMULATOR_HOST;

/** Fictional NANP number (555-01xx is reserved for fiction); passes validation, never a real handset. */
export const FAKE_MOBILE = '15555550100';

export interface Fakes {
  docs: Map<string, Record<string, unknown>>;
  added: Array<{ collection: string; data: Record<string, unknown> }>;
  apiCalls: Array<{ path: string; payload: Record<string, unknown> }>;
  apiReply: Record<string, unknown>;
  restore: () => void;
}

export function installFakes(): Fakes {
  const fakes: Fakes = {
    docs: new Map(),
    added: [],
    apiCalls: [],
    apiReply: { result: 'OK', 'msg-id': 'fake-1', numbers: 1, 'points-charged': 1, 'balance-after': 10 },
    restore: () => mock.restoreAll(),
  };

  const docRef = (path: string) => ({
    id: path.split('/').pop(),
    path,
    get: async () => {
      const data = fakes.docs.get(path);
      return { exists: data !== undefined, data: () => data, id: path.split('/').pop() };
    },
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      fakes.docs.set(path, opts?.merge ? { ...fakes.docs.get(path), ...data } : data);
    },
    update: async (data: Record<string, unknown>) => {
      fakes.docs.set(path, { ...fakes.docs.get(path), ...data });
    },
    delete: async () => {
      fakes.docs.delete(path);
    },
  });

  mock.method(Firestore.prototype, 'doc', (path: string) => docRef(path));
  mock.method(Firestore.prototype, 'collection', (name: string) => ({
    doc: (id: string) => docRef(`${name}/${id}`),
    add: async (data: Record<string, unknown>) => {
      fakes.added.push({ collection: name, data });
      return docRef(`${name}/auto`);
    },
  }));
  mock.method(Firestore.prototype, 'runTransaction', async (fn: (tx: unknown) => unknown) =>
    fn({
      get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
      set: (ref: { set: (d: unknown) => Promise<void> }, d: unknown) => ref.set(d),
      update: (ref: { update: (d: unknown) => Promise<void> }, d: unknown) => ref.update(d),
    })
  );

  // The kwtsms library posts with https.request: capture the payload, answer from apiReply.
  mock.method(https, 'request', ((opts: { path: string }, cb: (res: EventEmitter) => void) => {
    const req = new EventEmitter() as EventEmitter & {
      write: (b: string) => void;
      end: (b?: string) => void;
      setTimeout: () => void;
      destroy: () => void;
      destroyed: boolean;
    };
    let body = '';
    req.write = (b: string) => {
      body += b;
    };
    req.setTimeout = () => undefined;
    req.destroy = () => undefined;
    req.destroyed = false;
    req.end = (b?: string) => {
      if (b) body += b;
      fakes.apiCalls.push({ path: opts.path, payload: JSON.parse(body) });
      const res = new EventEmitter();
      cb(res);
      res.emit('data', Buffer.from(JSON.stringify(fakes.apiReply)));
      res.emit('end');
    };
    return req;
  }) as unknown as typeof https.request);

  return fakes;
}
