import { describe, expect, it } from 'vitest';
import { FormFlowError, isFormFlowError, parseApiError } from './errors';

describe('parseApiError — both envelope shapes', () => {
  it('shape A: validation 400 → code validation with fieldErrors + step', () => {
    const body = {
      error: {
        status: 400,
        name: 'ValidationError',
        message: 'Validation failed',
        details: { errors: { email: ['Invalid email address'] }, step: 'step-1' },
      },
    };
    const err = parseApiError(400, body);
    expect(err.code).toBe('validation');
    expect(err.fieldErrors).toEqual({ email: ['Invalid email address'] });
    expect(err.step).toBe('step-1');
  });

  it('shape B: 404 { data:null, error } → not_found', () => {
    const body = {
      data: null,
      error: { status: 404, name: 'NotFoundError', message: 'Form not found', details: {} },
    };
    const err = parseApiError(404, body);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('Form not found');
  });

  it('400 captcha message → captcha', () => {
    const body = { data: null, error: { status: 400, name: 'BadRequestError', message: 'reCAPTCHA verification failed' } };
    expect(parseApiError(400, body).code).toBe('captcha');
  });

  it('400 non-captcha → bad_request', () => {
    const body = { error: { status: 400, name: 'BadRequestError', message: 'Form slug is required' } };
    expect(parseApiError(400, body).code).toBe('bad_request');
  });

  it('maps 402/403/413/500', () => {
    expect(parseApiError(402, { error: { name: 'PaymentRequiredError', message: 'x' } }).code).toBe(
      'payment_required'
    );
    expect(parseApiError(403, { data: null, error: { name: 'PolicyError', message: 'Policy Failed' } }).code).toBe(
      'forbidden'
    );
    expect(parseApiError(413, { data: null, error: { name: 'PayloadTooLargeError', message: 'FileTooBig' } }).code).toBe(
      'payload_too_large'
    );
    expect(parseApiError(500, { data: null, error: { name: 'InternalServerError', message: 'x' } }).code).toBe(
      'server'
    );
  });

  it('429 reads Retry-After from a Headers instance and a plain object', () => {
    const h = new Headers({ 'Retry-After': '30' });
    const err = parseApiError(429, { data: null, error: { name: 'RateLimitError', message: 'Too many' } }, h);
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfter).toBe(30);

    const err2 = parseApiError(429, {}, { 'retry-after': '12' });
    expect(err2.retryAfter).toBe(12);
  });

  it('unknown status → unknown', () => {
    expect(parseApiError(418, {}).code).toBe('unknown');
  });
});

describe('isFormFlowError', () => {
  it('identifies FormFlowError instances', () => {
    expect(isFormFlowError(new FormFlowError('x', { code: 'network', status: 0 }))).toBe(true);
    expect(isFormFlowError(new Error('x'))).toBe(false);
    expect(isFormFlowError(null)).toBe(false);
  });
});
