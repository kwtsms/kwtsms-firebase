/**
 * FILE:      functions/tests/helpers/test-number.ts
 * CREATED:   2026-11-05 10:02 +03
 * TASK:      int-testnumber
 * AUTHOR:    M Alhassoun
 * WHAT:      The one shared source of the Kuwait test phone number for every test file.
 *            Reads KWTSMS_TEST_NUMBER (digits only, 965 + 8 digits) and builds the
 *            format variants (+, 00, spaces, dashes, Arabic-Indic, Persian) at runtime.
 * WHY:       Hard-coded sample numbers belong to real people. Tests that need valid
 *            Kuwait digits or send through the real API (test=1) read the number from
 *            the environment and skip when it is unset or malformed. Tests that only
 *            pass a number through use PLACEHOLDER or UNASSIGNED_CC instead.
 * USAGE:     import { requireNumber, variants } from './helpers/test-number';
 *            it('x', (t) => { const n = requireNumber(t); if (!n) return; ... });
 *            node:test t.skip() returns instead of throwing, hence the `if (!n) return`.
 * DEPENDS:   nothing (stdlib only); env KWTSMS_TEST_NUMBER for the tests that need it.
 *            Not named *.test.ts, so the node:test glob never runs it as a test file.
 */

/** Placeholder for numbers that are only passed through (hashed, stored, echoed), never validated. */
export const PLACEHOLDER = '965XXXXXXXX';

/** Placeholder local part (no country code), for prepend tests. */
export const PLACEHOLDER_LOCAL = 'XXXXXXXX';

/**
 * Digits-only number nobody can hold: country code 999 is unassigned in E.164.
 * For mocked tests that need digits but never reach the network.
 */
export const UNASSIGNED_CC = '99912345678';

export const SKIP_REASON = 'KWTSMS_TEST_NUMBER is unset or not 965 + 8 digits';

/** The env test number, or null when unset or malformed. Never logged. */
export function getNumber(): string | null {
  const raw = process.env.KWTSMS_TEST_NUMBER;
  return raw && /^965\d{8}$/.test(raw) ? raw : null;
}

/** Return the number, or skip the current node:test test and return null. */
export function requireNumber(t: { skip: (message?: string) => void }): string | null {
  const n = getNumber();
  if (!n) t.skip(SKIP_REASON);
  return n;
}

/** Format variants of a 965 + 8 digit number, built at runtime. */
export function variants(n: string): Record<string, string> {
  const local = n.slice(3);
  const a = local.slice(0, 4);
  const b = local.slice(4);
  const toDigits = (s: string, zero: number): string =>
    s.replace(/\d/g, (d) => String.fromCharCode(zero + Number(d)));
  return {
    plain: n,
    local,
    plus: '+' + n,
    intl00: '00' + n,
    spaced: '965 ' + a + ' ' + b,
    dashed: '965-' + a + '-' + b,
    paren: '(965) ' + local,
    arabic: toDigits(n, 0x0660),
    persian: toDigits(n, 0x06f0),
  };
}
