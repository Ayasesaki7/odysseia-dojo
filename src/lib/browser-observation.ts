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

const SUCCESS_TOAST_DURATION_MS = 4_000;

export function startBrowserObservation(documentRoot: Document = document) {
	const toast = documentRoot.querySelector<HTMLElement>('[data-observation-toast]');
	const message = toast?.querySelector<HTMLElement>('[data-observation-message]');
	const actions = toast?.querySelector<HTMLElement>('[data-observation-actions]');
	let dismissTimer: ReturnType<typeof setTimeout> | undefined;

	function hideToast(): void {
		clearTimeout(dismissTimer);
		dismissTimer = undefined;
		if (toast) toast.hidden = true;
	}

	function showToast(tone: 'success' | 'notice', text: string): void {
		if (!toast) return;
		clearTimeout(dismissTimer);
		dismissTimer = undefined;
		toast.dataset.observationTone = tone;
		if (message) message.textContent = text;
		if (actions) actions.hidden = tone === 'success';
		toast.hidden = false;
		if (tone === 'success') dismissTimer = setTimeout(hideToast, SUCCESS_TOAST_DURATION_MS);
	}

	const controller = createObservationController({
		collect: collectBrowserObservation,
		post: postBrowserObservation,
		storage: browserStorage(),
		sessionMarker: toast?.dataset.observationSession,
		onState: (state: string) => {
			if (state === 'recorded') showToast('success', '反作弊数据已记录');
			else if (state === 'retry') showToast('notice', '反作弊数据未记录');
		},
	});

	toast?.querySelector<HTMLButtonElement>('[data-observation-retry]')?.addEventListener('click', () => {
		void controller.retry();
	});
	toast?.querySelector<HTMLButtonElement>('[data-observation-dismiss]')?.addEventListener('click', hideToast);
	void controller.start();
	return controller;
}
