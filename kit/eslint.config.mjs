// 2026-11-16 02:05 +03: lint config for the kit (flat config, typescript-eslint recommended), int-firebase-auth
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['lib/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-require-imports': 'off' } }
);
