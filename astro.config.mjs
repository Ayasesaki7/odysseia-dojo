import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import starlight from '@astrojs/starlight';

import { publicSourceRevisionUrl } from './src/lib/public-build-config.mjs';

const sourceRevisionUrl = publicSourceRevisionUrl();

export default defineConfig({
	output: 'server',
	session: false,
	adapter: cloudflare({
		configPath: './wrangler.jsonc',
	}),
	integrations: [
		starlight({
			title: '类脑 Odysseia - 道馆挑战',
			description: '面向类脑 Odysseia 社区的教程站。',
			pagination: false,
			customCss: ['./src/styles/reading.css'],
			social: sourceRevisionUrl ? [{ icon: 'github', label: '网站源码（GitHub）', href: sourceRevisionUrl }] : [],
			locales: {
				root: {
					label: '简体中文',
					lang: 'zh-CN',
				},
			},
			components: {
				PageTitle: './src/components/ProtectedPageTitle.astro',
			},
			sidebar: [
				{
					label: '基础教程',
					items: [{ autogenerate: { directory: 'tutorials' } }],
				},
				{
					label: '扩展阅读',
					items: [{ autogenerate: { directory: 'extensions' } }],
				},
			],
		}),
	],
});
