import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenClawServiceDetector } from '../detector.js';

describe('OpenClawServiceDetector', () => {
	let detector: OpenClawServiceDetector;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		detector = new OpenClawServiceDetector('http://localhost:18789');
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns running when service responds', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			headers: new Headers({ server: 'openclaw/1.2.3' }),
		});

		const result = await detector.detect();

		expect(result.running).toBe(true);
		expect(result.endpoint).toBe('http://localhost:18789');
		expect(result.details?.status).toBe(200);
		expect(result.details?.server).toBe('openclaw/1.2.3');
	});

	it('returns running even on 404 (service is there)', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 404,
			headers: new Headers({}),
		});

		const result = await detector.detect();

		expect(result.running).toBe(true);
		expect(result.details?.status).toBe(404);
	});

	it('returns not running on connection refused', async () => {
		fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:18789'));

		const result = await detector.detect();

		expect(result.running).toBe(false);
		expect(result.endpoint).toBe('http://localhost:18789');
		expect(result.details?.error).toContain('ECONNREFUSED');
	});

	it('returns not running on timeout', async () => {
		const abortError = new DOMException('The operation was aborted', 'AbortError');
		fetchMock.mockRejectedValueOnce(abortError);

		const result = await detector.detect();

		expect(result.running).toBe(false);
		expect(result.details?.error).toContain('timed out');
	});

	it('uses default base URL', () => {
		const defaultDetector = new OpenClawServiceDetector();
		// The constructor sets the URL; we verify by calling detect
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			headers: new Headers({}),
		});

		defaultDetector.detect();

		expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:18789', expect.anything());
	});
});
