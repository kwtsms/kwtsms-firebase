# kwtsms-firebase-kit

kwtSMS function kit for Firebase (Cloud Functions 2nd gen). Send SMS from a Firestore queue, a welcome SMS to new Auth users, SMS and OTP through HTTPS callables, and a daily balance, Sender ID and coverage sync, all through the [kwtSMS](https://www.kwtsms.com) gateway.

This kit replaces the **kwtSMS Firebase Extension**. Firebase Extensions shut down on 2027-03-31; function kits on npm are Google's replacement.

Test mode is the default: `test=1`. Test messages are not delivered; their credits are held until you delete them from the Sending Queue. Switch it off in the `sms_config/settings` Firestore document (`test_mode: false`) to deliver for real.

## Install

Needs firebase-tools >= 15.32.0, Node 22 and a Blaze (pay-as-you-go) project.

```
firebase functions:kits:install --package kwtsms-firebase-kit
firebase deploy --only functions:<instance-id>
```

The CLI asks for the values below and prints the exact deploy command. Or use it as a plain dependency and re-export it from your own codebase:

```
npm install kwtsms-firebase-kit
```

```ts
// functions/src/index.ts
export * from 'kwtsms-firebase-kit';
```

While the kit is a pre-release it is published under the `next` tag: `npm install kwtsms-firebase-kit@next`.

## Values (.env)

Same names as the extension params, so existing values carry over.

| Name | Default | Meaning |
|------|---------|---------|
| `SMS_COLLECTION` | `sms_queue` | Collection watched for outgoing SMS documents |
| `SMS_TEMPLATES_COLLECTION` | `sms_templates` | Message templates |
| `SMS_LOGS_COLLECTION` | `sms_logs` | Send logs |
| `OTP_COLLECTION` | `otp_codes` | OTP codes (stored hashed) |
| `APP_NAME` | `My App` | Used in welcome and OTP templates |
| `LOCATION` | `us-central1` | Functions region |

`LOCATION` must match your Firestore database location. 2nd gen Firestore triggers must be co-located with the database, so an extension installed in another region may need this changed. The multi-region values `nam5`, `nam7` and `eur3` are accepted and mapped to a region inside them (`us-central1`, `us-central1`, `europe-west1`).

## Secrets

| Name | Meaning |
|------|---------|
| `KWTSMS_USERNAME` | kwtSMS API username (not your mobile number) |
| `KWTSMS_PASSWORD` | kwtSMS API password |

Stored in Secret Manager and bound to every function. Set them with `firebase functions:secrets:set KWTSMS_USERNAME` (the install flow prompts for them). Migrating from the extension copies the existing secret values.

## IAM roles and APIs

Declared in code with `requiresRole` and `requiresAPI`; the CLI grants them to a managed runtime service account at deploy. All functions of the codebase run with it.

| Declared | Why |
|----------|-----|
| `roles/datastore.user` | Read and write the queue, templates, logs, OTP codes and settings |
| `firestore.googleapis.com` | Firestore access |

Scheduled and task queue functions also enable Cloud Scheduler and Cloud Tasks.

## Functions

| Function | Trigger |
|----------|---------|
| `processQueue` | Firestore create in `SMS_COLLECTION` |
| `onUserCreate` | Auth user created (1st gen trigger: 2nd gen has no non-blocking Auth create trigger) |
| `sendSms` | HTTPS callable, signed-in users, 10 per minute per user |
| `handleOtp` | HTTPS callable, send and verify OTP (60 s cooldown, 3 attempts, 5 min expiry) |
| `scheduledSync` | Every 24 hours |
| `onInstallHandler` | Task queue, run by the lifecycle hooks |

Usage is unchanged from the extension: add a document to the queue (`to: '965XXXXXXXX'`, `message` or `template`), or call `sendSms` and `handleOtp` from your client.

## Lifecycle hooks

`afterFirstDeploy` and `afterRedeploy` both run `onInstallHandler`, which creates the settings document, seeds the default templates and runs the first sync. It never overwrites existing settings or templates, so it is safe to repeat. Rerun manually:

```
firebase functions:lifecycle:run afterFirstDeploy <CODEBASE_NAME>
firebase functions:lifecycle:run afterRedeploy <CODEBASE_NAME>
```

## Billing

Blaze plan required (2nd gen functions, Secret Manager, Cloud Scheduler, Cloud Tasks, Firestore usage). SMS credits are billed by kwtSMS, not Google; test messages are not delivered, but their credits are held until you delete them from the Sending Queue.

## Instance ID and names

The CLI sets `FIREBASE_KIT_INSTANCE_ID` for each kit instance (the key in the `instances` map of `firebase.json`); it replaces `EXT_INSTANCE_ID`. Functions of an instance deploy with the prefix `kit-<instanceId>-`, for example `kit-kwtsms-sendSms`. Deployed from your own codebase they keep the plain names.

## What changed from the extension

| Concern | Extension | Kit |
|---------|-----------|-----|
| Config | Extension params | Cloud Functions params in `.env`, same names |
| Secrets | Extension secret params | `defineSecret`, same names |
| IAM | Granted by Extensions | `requiresRole`, applied at deploy |
| Provisioning | `lifecycleEvents` | `afterFirstDeploy` and `afterRedeploy` |
| Functions | 1st gen | 2nd gen (Auth create stays 1st gen) |
| Function names | `ext-kwtsms-firebase-sendSms` | `kit-<instanceId>-sendSms` (callable names change in your client) |
| Instance ID | `EXT_INSTANCE_ID` | `FIREBASE_KIT_INSTANCE_ID` |
| firebase-admin | 12 | 14 (modular Firestore imports) |
| Runtime | Node 20 | Node 22 |

Behaviour, collections, templates, rate limits and the Firestore documents are unchanged. The `web/` dashboard works with both.

## Migrate from the extension

```
firebase ext:migrate --package kwtsms-firebase-kit
```

This reads your installed extension instance, carries over the param and secret values (names are unchanged), and sets up the kit. Update the callable names in your client (`kit-<instanceId>-sendSms`), deploy, then uninstall the extension.

## Develop

```
npm install
npm run lint && npm test
npm pack --dry-run
```

Tests run offline: no network, no credentials, no emulator, nothing is sent.

## License

Apache-2.0
