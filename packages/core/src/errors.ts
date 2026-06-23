/**
 * Typed errors for the FormFlow SDK.
 *
 * The content-API returns TWO distinct JSON envelope shapes (see audit-06):
 *   - Shape A — controller hand-built, NO top-level `data` key: `{ error }`.
 *   - Shape B — core-formatted: `{ data: null, error }`.
 * `parseApiError` understands both and maps every documented status/name to a
 * stable {@link FormFlowErrorCode}, so callers can branch on `error.code`
 * instead of brittle status/string matching.
 */

import type { FormErrors } from './types';

/** Stable, machine-friendly classification of any failed SDK request. */
export type FormFlowErrorCode =
  | 'validation'
  | 'bad_request'
  | 'captcha'
  | 'payment_required'
  | 'forbidden'
  | 'not_found'
  | 'payload_too_large'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'aborted'
  | 'unknown';

/** Options used to construct a {@link FormFlowError}. */
export interface FormFlowErrorInit {
  code: FormFlowErrorCode;
  /** HTTP status; `0` for `network` / `aborted`. */
  status: number;
  /** Field-keyed messages — present for `code === 'validation'`. */
  fieldErrors?: FormErrors;
  /** The step id, for step-validation errors. */
  step?: string;
  /** Seconds to wait before retrying — present for `code === 'rate_limited'`. */
  retryAfter?: number;
  /** The raw parsed response body, for debugging/escape hatches. */
  body?: unknown;
  /** Underlying cause (e.g. the original network error). */
  cause?: unknown;
}

/**
 * The single error type every SDK request rejects with. Inspect `.code` to
 * branch; `.fieldErrors` carries server validation messages keyed by field name.
 */
export class FormFlowError extends Error {
  readonly code: FormFlowErrorCode;
  readonly status: number;
  readonly fieldErrors?: FormErrors;
  readonly step?: string;
  readonly retryAfter?: number;
  readonly body?: unknown;

  constructor(message: string, init: FormFlowErrorInit) {
    super(message);
    this.name = 'FormFlowError';
    // Attach `cause` manually (the `Error` constructor's `cause` option needs
    // lib ES2022; assigning it keeps the SDK buildable down to ES2021).
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
    this.code = init.code;
    this.status = init.status;
    this.fieldErrors = init.fieldErrors;
    this.step = init.step;
    this.retryAfter = init.retryAfter;
    this.body = init.body;

    // Restore the prototype chain for ES5 transpilation / `instanceof` safety.
    Object.setPrototypeOf(this, FormFlowError.prototype);
  }
}

/** Type guard: `true` when `e` is a {@link FormFlowError}. */
export function isFormFlowError(e: unknown): e is FormFlowError {
  return e instanceof FormFlowError || (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'FormFlowError');
}

/* ------------------------------------------------------------------ *
 * Envelope parsing
 * ------------------------------------------------------------------ */

/** The `error` object inside either envelope shape. */
interface ApiErrorPayload {
  status?: number;
  name?: string;
  message?: string;
  details?: {
    errors?: FormErrors;
    step?: string;
  } & Record<string, unknown>;
}

/** Both envelope shapes share a top-level `error` object. */
interface ApiErrorEnvelope {
  data?: null;
  error?: ApiErrorPayload;
}

/** Matches any captcha-provider mention in a BadRequest message. */
const CAPTCHA_MESSAGE_RE = /recaptcha|captcha|turnstile|hcaptcha/i;

/**
 * Read a header value case-insensitively from either a plain object or a
 * `Headers` instance (SSR/fetch interop).
 */
function readHeader(
  headers: Record<string, string> | Headers | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Map a non-2xx HTTP response to a {@link FormFlowError}, understanding BOTH
 * content-API envelope shapes exactly as documented in the audit.
 *
 * @param status  - HTTP status code
 * @param body    - The parsed JSON response body (either envelope shape, or anything)
 * @param headers - Response headers (used for `Retry-After` on 429)
 */
export function parseApiError(
  status: number,
  body: unknown,
  headers?: Record<string, string> | Headers
): FormFlowError {
  const envelope = (body && typeof body === 'object' ? (body as ApiErrorEnvelope) : {}) ?? {};
  const error = envelope.error ?? {};
  const name = typeof error.name === 'string' ? error.name : '';
  const message =
    typeof error.message === 'string' && error.message.length > 0
      ? error.message
      : `Request failed with status ${status}`;

  const base = { status, body } as const;

  switch (status) {
    case 400: {
      if (name === 'ValidationError') {
        return new FormFlowError(message, {
          ...base,
          code: 'validation',
          fieldErrors: error.details?.errors ?? {},
          step: error.details?.step,
        });
      }
      // A BadRequest whose message mentions a captcha provider is a captcha
      // verification/misconfiguration failure; otherwise a generic bad request.
      if (CAPTCHA_MESSAGE_RE.test(message)) {
        return new FormFlowError(message, { ...base, code: 'captcha' });
      }
      return new FormFlowError(message, { ...base, code: 'bad_request' });
    }

    case 402:
      return new FormFlowError(message, { ...base, code: 'payment_required' });

    case 403:
      return new FormFlowError(message, { ...base, code: 'forbidden' });

    case 404:
      return new FormFlowError(message, { ...base, code: 'not_found' });

    case 413:
      return new FormFlowError(message, { ...base, code: 'payload_too_large' });

    case 429: {
      const raw = readHeader(headers, 'retry-after');
      const retryAfter = raw !== undefined ? Number(raw) : undefined;
      return new FormFlowError(message, {
        ...base,
        code: 'rate_limited',
        retryAfter: retryAfter !== undefined && !Number.isNaN(retryAfter) ? retryAfter : undefined,
      });
    }

    case 500:
      return new FormFlowError(message, { ...base, code: 'server' });

    default:
      // 5xx (other than 500) are still server-side; everything else unknown.
      if (status >= 500) {
        return new FormFlowError(message, { ...base, code: 'server' });
      }
      return new FormFlowError(message, { ...base, code: 'unknown' });
  }
}
