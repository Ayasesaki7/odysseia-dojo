import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

function stableDocsId({ entry }: { entry: string }) {
	const segments = entry
		.replace(/\.(?:md|mdx)$/u, '')
		.split(/[\\/]/u)
		.map((segment) => segment.replace(/^\d+-/u, ''));

	if (segments.at(-1) === 'index') segments.pop();

	return ['docs', ...segments].join('/');
}

export const collections = {
	docs: defineCollection({
		loader: docsLoader({ generateId: stableDocsId }),
		schema: docsSchema({
			extend: z.object({
				title: z.string().trim().min(1),
				description: z.string().trim().min(1),
				category: z.enum(['tutorial', 'extension']),
				order: z.number().int().nonnegative(),
				updated: z.coerce.date(),
				isOutdated: z.boolean().default(false),
			}),
		}),
	}),
};
