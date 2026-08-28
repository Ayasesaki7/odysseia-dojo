import { getThumbmark } from '@thumbmarkjs/thumbmarkjs';

import { createObservationController } from './observation-client.js';
import { THUMBMARK_OPTIONS } from './thumbmark-options.js';

type BrowserSignalValue = Record<string, unknown>;

function componentString(components: BrowserSignalValue, component: string, property: string): string | undefined {
	const source = components[component];
	if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;
	const value = (source as BrowserSignalValue)[property];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function currentScreenResolution(): string | undefined {
	const width = window.screen?.width;
	const height = window.screen?.height;
	if (
		typeof width !== 'number' ||
		typeof height !== 'number' ||
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		return undefined;
	}

	return `${Math.max(width, height)}x${Math.min(width, height)}`;
}

export async function collectBrowserObservation() {
	const result = await getThumbmark(THUMBMARK_OPTIONS);
	if (result.error?.length || !result.thumbmark) throw new Error('Unable to collect browser observation signals.');

	const components = result.components as BrowserSignalValue;
	return {
		browserFingerprint: result.thumbmark,
		canvasHash: componentString(components, 'canvas', 'commonPixelsHash'),
		webglHash: componentString(components, 'webgl', 'commonPixelsHash'),
		platform: componentString(components, 'system', 'platform'),
		timezone: componentString(components, 'locales', 'timezone'),
		screenResolution: currentScreenResolution() ?? componentString(components, 'screen', 'screenResolution'),
		language: componentString(components, 'locales', 'languages'),
	};
}

async function postBrowserObservation(payload: unknown): Promise<void> {
	const response = await fetch('/api/fingerprint', {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	});
	if (!response.ok) throw new Error('Unable to record browser observation.');
}

function browserStorage(): Storage | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function renderObservationState(status: HTMLElement | null, retry: HTMLButtonElement | null, state: string): void {
	if (state === 'recorded') {
		if (status) {
			status.hidden = false;
			status.textContent = '防代打观测已记录。';
		}
		if (retry) retry.hidden = true;
		return;
	}

	if (state === 'available') {
		if (status) status.hidden = true;
		if (retry) retry.hidden = false;
		return;
	}

	if (status) {
		status.hidden = false;
		status.textContent = '防代打观测未记录，请重试';
	}
	if (retry) retry.hidden = false;
}

export function startBrowserObservation(documentRoot: Document = document) {
	const status = documentRoot.querySelector<HTMLElement>('[data-observation-status]');
	const retry = documentRoot.querySelector<HTMLButtonElement>('[data-observation-retry]');
	const controller = createObservationController({
		collect: collectBrowserObservation,
		post: postBrowserObservation,
		storage: browserStorage(),
		onState: (state: string) => renderObservationState(status, retry, state),
	});

	retry?.addEventListener('click', () => {
		void controller.retry();
	});
	void controller.start();
	return controller;
}
