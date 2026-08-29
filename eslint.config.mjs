import js from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: [
			'.astro/**',
			'.tmp/**',
			'.wrangler/**',
			'dist/**',
			'node_modules/**',
			'public/protected/**',
			'src/content/docs/**',
		],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...eslintPluginAstro.configs.recommended,
	{
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
	},
	{
		files: ['src/env.d.ts'],
		rules: {
			'@typescript-eslint/no-empty-object-type': 'off',
		},
	},
];
