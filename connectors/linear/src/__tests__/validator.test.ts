import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinearCredentialValidator } from '../validator.js';

describe('LinearCredentialValidator', () => {
	let validator: LinearCredentialValidator;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		validator = new LinearCredentialValidator();
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns valid with identity on success', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ data: { viewer: { id: 'u1', name: 'Alice' } } }),
		});

		const result = await validator.validate('lin_api_testkey');

		expect(result.valid).toBe(true);
		expect(result.identity).toBe('user: Alice');
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.linear.app/graphql',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'lin_api_testkey',
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

		const result = await validator.validate('bad-key');

		expect(result.valid).toBe(false);
		expect(result.error).toContain('401');
	});

	it('returns invalid on 403', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
		});

		const result = await validator.validate('bad-key');

		expect(result.valid).toBe(false);
		expect(result.error).toContain('403');
	});

	it('returns invalid on GraphQL errors', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({
				errors: [{ message: 'Authentication required' }],
			}),
		});

		const result = await validator.validate('expired-key');

		expect(result.valid).toBe(false);
		expect(result.error).toContain('Authentication required');
	});

	it('fails open on network error', async () => {
		fetchMock.mockRejectedValueOnce(new Error('fetch failed'));

		const result = await validator.validate('any-key');

		expect(result.valid).toBe(true);
		expect(result.error).toContain('Could not reach Linear API');
	});

	it('fails open on timeout', async () => {
		const abortError = new DOMException('The operation was aborted', 'AbortError');
		fetchMock.mockRejectedValueOnce(abortError);

		const result = await validator.validate('any-key');

		expect(result.valid).toBe(true);
		expect(result.error).toContain('timed out');
	});
});
