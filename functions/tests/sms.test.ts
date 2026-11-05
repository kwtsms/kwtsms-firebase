import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { prependCountryCode } from '../src/services/sms';
// 2026-11-05 10:02 +03: placeholders replace a real-looking sample mobile, int-testnumber.
// prependCountryCode works on string prefixes only, so X placeholders keep every case running.
import { PLACEHOLDER, PLACEHOLDER_LOCAL } from './helpers/test-number';

describe('SMS Service', () => {
  describe('prependCountryCode', () => {
    it('prepends default country code to short number', () => {
      // 2026-11-05 10:02 +03: local part starts with 98 (Iran code) to keep the false-match regression, int-testnumber
      const result = prependCountryCode('98XXXXXX', '965', []);
      assert.strictEqual(result, '96598XXXXXX');
    });

    it('does not prepend if number already has a known prefix', () => {
      const coverage = [{ prefix: '965' }, { prefix: '966' }];
      const result = prependCountryCode(PLACEHOLDER, '965', coverage);
      assert.strictEqual(result, PLACEHOLDER);
    });

    it('prepends when number has unknown prefix', () => {
      const coverage = [{ prefix: '965' }];
      const result = prependCountryCode(PLACEHOLDER_LOCAL, '965', coverage);
      assert.strictEqual(result, PLACEHOLDER);
    });

    it('prepends default for KSA local number after zero strip', () => {
      const result = prependCountryCode('587469874', '966', []);
      assert.strictEqual(result, '966587469874');
    });

    it('does not prepend if findCountryCode finds a match (empty coverage)', () => {
      const result = prependCountryCode(PLACEHOLDER, '965', []);
      assert.strictEqual(result, PLACEHOLDER);
    });

    it('prepends for UAE local number', () => {
      const result = prependCountryCode('501234567', '971', []);
      assert.strictEqual(result, '971501234567');
    });
  });
});
