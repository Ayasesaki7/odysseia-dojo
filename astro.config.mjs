import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	integrations: [
		starlight({
			title: '类脑 Odysseia - 道馆挑战',
			description: '面向类脑 Odysseia 社区的教程站。',
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
