import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenClawCredentialValidator } from '../validator.js';

describe('OpenClawCredentialValidator', () => {
	let validator: OpenClawCredentialValidator;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		validator = new OpenClawCredentialValidator('http://localhost:18789');
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns valid on successful response', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
		});

		const result = await validator.validate('test-token');

		expect(result.valid).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:18789/hooks/agent',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer test-token',
				}),
			}),
		);
	});

	it('returns invalid on 401', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
		});

		const result = await validator.validate('bad-token');

		expect(result.valid).toBe(false);
		expect(result.error).toContain('401');
	});

	it('returns invalid on 403', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
		});

		const result = await validator.validate('bad-token');

		expect(result.valid).toBe(false);
		expect(result.error).toContain('403');
	});

	it('returns valid on other errors (token accepted but other issue)', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 400,
			statusText: 'Bad Request',
		});

		const result = await validator.validate('good-token');

		// Not a 401/403, so the token was accepted
		expect(result.valid).toBe(true);
	});

	it('fails open on network error', async () => {
		fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

		const result = await validator.validate('any-token');

		expect(result.valid).toBe(true);
		expect(result.error).toContain('Could not reach OpenClaw');
	});

	it('fails open on timeout', async () => {
		const abortError = new DOMException('The operation was aborted', 'AbortError');
		fetchMock.mockRejectedValueOnce(abortError);

		const result = await validator.validate('any-token');

		expect(result.valid).toBe(true);
		expect(result.error).toContain('timed out');
	});
});
