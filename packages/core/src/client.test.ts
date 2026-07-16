import { describe, expect, it, vi } from 'vitest';
import { createFormFlowClient } from './client';
import { isFormFlowError } from './errors';
import { freeFieldsForm } from './__fixtures__/forms';

/** Build a fetch stub returning the given status + JSON body (+ headers). */
function fetchStub(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    })
  );
}

describe('createFormFlowClient — getForm', () => {
  it('unwraps { data } and builds the URL with a lowercased locale', async () => {
    const fetch = fetchStub(200, { data: freeFieldsForm });
    const client = createFormFlowClient({ baseUrl: 'https://cms.test', fetch });
    const schema = await client.getForm('test-free-fields-form', { locale: 'EN-US' });
    expect(schema.slug).toBe('test-free-fields-form');
    expect(fetch).toHaveBeenCalledWith(
      'https://cms.test/api/formflow/forms/test-free-fields-form?locale=en-us',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('honors a custom apiPrefix and extra headers', async () => {
    const fetch = fetchStub(200, { data: freeFieldsForm });
    const client = createFormFlowClient({
      baseUrl: '',
      apiPrefix: '/api/custom',
      headers: { 'x-cdn': 'tok' },
      fetch,
    });
    await client.getForm('s');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/custom/forms/s');
    expect((init as RequestInit).headers).toMatchObject({ 'x-cdn': 'tok' });
  });
});

describe('createFormFlowClient — analytics', () => {
  it('posts a start event to the public analytics endpoint', async () => {
    const fetch = fetchStub(204, undefined);
    const client = createFormFlowClient({ baseUrl: 'https://cms.test', fetch });

    if (!client.trackStart) throw new Error('trackStart is not available');
    await client.trackStart('contact-form');

    expect(fetch).toHaveBeenCalledWith(
      'https://cms.test/api/formflow/forms/contact-form/analytics/start',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('createFormFlowClient — submit success + errors', () => {
  const okBody = { data: { success: true, message: 'Thanks', redirectUrl: null } };

  it('returns the unwrapped success body', async () => {
    const fetch = fetchStub(200, okBody);
    const client = createFormFlowClient({ baseUrl: '', fetch });
    const res = await client.submit('s', { schema: freeFieldsForm, values: { contact_email: 'a@b.com' } });
    expect(res).toEqual({ success: true, message: 'Thanks', redirectUrl: null });
  });

  it('maps a 400 validation error', async () => {
    const fetch = fetchStub(400, {
      error: { name: 'ValidationError', message: 'Validation failed', details: { errors: { contact_email: ['Invalid email address'] } } },
    });
    const client = createFormFlowClient({ baseUrl: '', fetch });
    await expect(
      client.submit('s', { schema: freeFieldsForm, values: {} })
    ).rejects.toMatchObject({ code: 'validation', fieldErrors: { contact_email: ['Invalid email address'] } });
  });

  it('maps a 429 with Retry-After', async () => {
    const fetch = fetchStub(
      429,
      { data: null, error: { name: 'RateLimitError', message: 'Too many submissions. Please try again later.' } },
      { 'Retry-After': '45' }
    );
    const client = createFormFlowClient({ baseUrl: '', fetch });
    await expect(client.submit('s', { schema: freeFieldsForm, values: {} })).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfter: 45,
    });
  });

  it('maps a network failure to code network (status 0)', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = createFormFlowClient({ baseUrl: '', fetch });
    try {
      await client.getForm('s');
      throw new Error('should have thrown');
    } catch (err) {
      expect(isFormFlowError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('network');
      expect((err as { status: number }).status).toBe(0);
    }
  });

  it('maps an AbortError to code aborted', async () => {
    const fetch = vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const client = createFormFlowClient({ baseUrl: '', fetch });
    await expect(client.getForm('s')).rejects.toMatchObject({ code: 'aborted', status: 0 });
  });
});

describe('createFormFlowClient — validateStep / partial', () => {
  it('validateStep posts _step and unwraps the result', async () => {
    const fetch = fetchStub(200, { data: { valid: true, step: 'step-1', errors: {} } });
    const client = createFormFlowClient({ baseUrl: '', fetch });
    const res = await client.validateStep('s', { first_name: 'Ada' }, 'step-1');
    expect(res).toEqual({ valid: true, step: 'step-1', errors: {} });
    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body._step).toBe('step-1');
    expect(body.first_name).toBe('Ada');
  });

  it('savePartial returns the token + expiry', async () => {
    const fetch = fetchStub(200, { data: { resumeToken: 'abc', expiresAt: '2030-01-01T00:00:00.000Z' } });
    const client = createFormFlowClient({ baseUrl: '', fetch });
    const res = await client.savePartial('s', { a: 1 }, { resumeToken: 'prev' });
    expect(res.resumeToken).toBe('abc');
    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body._resumeToken).toBe('prev');
  });

  it('loadPartial GETs by token', async () => {
    const fetch = fetchStub(200, { data: { data: { a: 1 }, metadata: {} } });
    const client = createFormFlowClient({ baseUrl: 'https://cms.test', fetch });
    const res = await client.loadPartial('s', 'tok');
    expect(res.data).toEqual({ a: 1 });
    expect(fetch.mock.calls[0]![0]).toBe('https://cms.test/api/formflow/forms/s/partial/tok');
  });
});
