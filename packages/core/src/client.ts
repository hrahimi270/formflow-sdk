/**
 * Content-API client for the FormFlow Strapi plugin.
 *
 * Talks to the public, unauthenticated endpoints under
 * `${baseUrl}${apiPrefix}/forms/...`. Success bodies are unwrapped from their
 * `{ data }` envelope; non-2xx responses are turned into a {@link FormFlowError}
 * via {@link parseApiError}. Multipart submits with an `onUploadProgress`
 * callback use `XMLHttpRequest` (the only way to observe upload progress in the
 * browser); everything else uses `fetch` (injectable for SSR/testing).
 *
 * SSR/RSC-safe: no browser globals are touched at module load — `XMLHttpRequest`
 * is only referenced inside the submit path, guarded by a `typeof` check.
 */

import type {
  FormSchema,
  FormValues,
  PartialResumeResult,
  PartialSaveResult,
  StepValidationSuccess,
  SubmitSuccess,
} from './types';
import { DEFAULT_API_PREFIX } from './constants';
import { FormFlowError, parseApiError } from './errors';
import { buildSubmitData, type BuildSubmitDataExtras, type SubmitData } from './serialize';

/** Options for {@link createFormFlowClient}. */
export interface FormFlowClientOptions {
  /** Origin, e.g. `'https://cms.example.com'`, or `''` for same-origin. */
  baseUrl: string;
  /** Content-API mount prefix. Default `'/api/formflow'`. */
  apiPrefix?: string;
  /** Injectable `fetch` implementation (for SSR / testing). */
  fetch?: typeof fetch;
  /** Extra headers merged into every request (e.g. CDN tokens). */
  headers?: Record<string, string>;
}

/** Per-call options for `getForm`. */
export interface GetFormOptions {
  /** Locale code; lowercased and sent as `?locale=`. */
  locale?: string;
  signal?: AbortSignal;
}

/**
 * The payload accepted by `submit`: the form schema (so the body is serialized
 * with the right visibility/honeypot rules), the current values, and the
 * honeypot/captcha/step/resume control fields ({@link BuildSubmitDataExtras}).
 */
export interface SubmitPayload extends BuildSubmitDataExtras {
  /** The form schema — drives visibility filtering + honeypot/spam config. */
  schema: FormSchema;
  /** Form values keyed by field name (file values are File|File[]). */
  values: FormValues;
}

/** Per-call options for `submit`. */
export interface SubmitOptions {
  signal?: AbortSignal;
  /** Receives 0..100 during a multipart upload (XHR path only). */
  onUploadProgress?: (pct: number) => void;
}

/** Per-call options for save-and-resume. */
export interface PartialOptions {
  resumeToken?: string;
  signal?: AbortSignal;
}

/** The FormFlow content-API client surface. */
export interface FormFlowClient {
  /** Fetch a public form schema by slug. */
  getForm(slug: string, opts?: GetFormOptions): Promise<FormSchema>;
  /** Best-effort notification that a visitor started interacting with a form. */
  trackStart?(slug: string, opts?: { signal?: AbortSignal }): Promise<void>;
  /** Submit a form. Returns the success body (honeypot fake-success included). */
  submit(slug: string, payload: SubmitPayload, opts?: SubmitOptions): Promise<SubmitSuccess>;
  /** Validate a single step (POSTs the submit endpoint with `_step`). */
  validateStep(
    slug: string,
    values: FormValues,
    stepIndicator: string | number,
    opts?: SubmitOptions
  ): Promise<StepValidationSuccess>;
  /** Save a partial submission (Pro). Returns a resume token + expiry. */
  savePartial(slug: string, values: FormValues, opts?: PartialOptions): Promise<PartialSaveResult>;
  /** Load a previously-saved partial submission by resume token (Pro). */
  loadPartial(slug: string, resumeToken: string, opts?: { signal?: AbortSignal }): Promise<PartialResumeResult>;
}

/* ------------------------------------------------------------------ *
 * Internal helpers
 * ------------------------------------------------------------------ */

/** Unwrap `{ data }`; tolerate a bare body if the envelope is missing. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** Best-effort JSON parse of a response body (returns `undefined` on failure). */
async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Convert a thrown fetch/abort error into a FormFlowError (network/aborted). */
function toTransportError(err: unknown): FormFlowError {
  const name = (err as { name?: string } | undefined)?.name;
  if (name === 'AbortError') {
    return new FormFlowError('The request was aborted', { code: 'aborted', status: 0, cause: err });
  }
  const message = err instanceof Error ? err.message : 'Network request failed';
  return new FormFlowError(message, { code: 'network', status: 0, cause: err });
}

/**
 * Create a content-API client.
 *
 * @param opts - Base URL, optional API prefix, injectable fetch, extra headers
 */
export function createFormFlowClient(opts: FormFlowClientOptions): FormFlowClient {
  const baseUrl = opts.baseUrl ?? '';
  const apiPrefix = opts.apiPrefix ?? DEFAULT_API_PREFIX;
  const baseHeaders = opts.headers ?? {};
  // Resolve fetch lazily and SSR-safely: prefer the injected one, else the
  // global. Only referenced inside request methods, never at module top level.
  const resolveFetch = (): typeof fetch => {
    const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      throw new FormFlowError(
        'No fetch implementation available. Pass `fetch` in client options for this environment.',
        { code: 'network', status: 0 }
      );
    }
    return f;
  };

  const formUrl = (slug: string): string => `${baseUrl}${apiPrefix}/forms/${slug}`;

  /** Run a JSON request through fetch, unwrapping success and mapping errors. */
  async function jsonRequest<T>(
    url: string,
    init: { method: string; body?: BodyInit; signal?: AbortSignal; headers?: Record<string, string> }
  ): Promise<T> {
    const doFetch = resolveFetch();
    let res: Response;
    try {
      res = await doFetch(url, {
        method: init.method,
        body: init.body,
        signal: init.signal,
        headers: { ...baseHeaders, ...init.headers },
      });
    } catch (err) {
      throw toTransportError(err);
    }

    const body = await parseJson(res);
    if (!res.ok) {
      throw parseApiError(res.status, body, res.headers);
    }
    return unwrap<T>(body);
  }

  /** POST a serialized payload, choosing XHR (for progress) or fetch. */
  async function postSubmit<T>(
    url: string,
    data: SubmitData,
    opts2: SubmitOptions = {}
  ): Promise<T> {
    const wantsProgress = typeof opts2.onUploadProgress === 'function';
    const xhrAvailable = typeof XMLHttpRequest !== 'undefined';

    // XHR path: only when multipart AND progress is requested AND XHR exists.
    if (data.isMultipart && wantsProgress && xhrAvailable) {
      return xhrSubmit<T>(url, data.formData as FormData, baseHeaders, opts2);
    }

    if (data.isMultipart) {
      // Let the runtime set the multipart boundary — do NOT set Content-Type.
      return jsonRequest<T>(url, {
        method: 'POST',
        body: data.formData as FormData,
        signal: opts2.signal,
      });
    }

    return jsonRequest<T>(url, {
      method: 'POST',
      body: JSON.stringify(data.json ?? {}),
      signal: opts2.signal,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return {
    async getForm(slug, getOpts = {}) {
      let url = formUrl(slug);
      if (getOpts.locale) {
        url += `?locale=${encodeURIComponent(getOpts.locale.toLowerCase())}`;
      }
      return jsonRequest<FormSchema>(url, { method: 'GET', signal: getOpts.signal });
    },

    async trackStart(slug, startOpts = {}) {
      return jsonRequest<void>(`${formUrl(slug)}/analytics/start`, {
        method: 'POST',
        signal: startOpts.signal,
      });
    },

    async submit(slug, payload, submitOpts = {}) {
      const data = buildSubmitData(payload.schema, payload.values, payload);
      return postSubmit<SubmitSuccess>(`${formUrl(slug)}/submit`, data, submitOpts);
    },

    async validateStep(slug, values, stepIndicator, stepOpts = {}) {
      // Validate-only mode: POST the submit endpoint with `_step`. No schema is
      // required here because the server resolves the step's fields itself; we
      // build a minimal flat JSON body of the provided values + `_step`.
      const json: Record<string, unknown> = { ...values, _step: stepIndicator };
      return jsonRequest<StepValidationSuccess>(`${formUrl(slug)}/submit`, {
        method: 'POST',
        body: JSON.stringify(json),
        signal: stepOpts.signal,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async savePartial(slug, values, partialOpts = {}) {
      const json: Record<string, unknown> = { ...values };
      if (partialOpts.resumeToken !== undefined) json._resumeToken = partialOpts.resumeToken;
      return jsonRequest<PartialSaveResult>(`${formUrl(slug)}/partial`, {
        method: 'POST',
        body: JSON.stringify(json),
        signal: partialOpts.signal,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async loadPartial(slug, resumeToken, loadOpts = {}) {
      const url = `${formUrl(slug)}/partial/${encodeURIComponent(resumeToken)}`;
      return jsonRequest<PartialResumeResult>(url, { method: 'GET', signal: loadOpts.signal });
    },
  };
}

/**
 * Submit a multipart body via XMLHttpRequest so upload progress can be reported.
 * Resolves with the unwrapped success body; rejects with a {@link FormFlowError}
 * on non-2xx, abort, or network failure.
 */
function xhrSubmit<T>(
  url: string,
  formData: FormData,
  baseHeaders: Record<string, string>,
  opts: SubmitOptions
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    // Apply base headers (never Content-Type — the browser sets the multipart
    // boundary for a FormData body automatically).
    for (const [key, value] of Object.entries(baseHeaders)) {
      if (key.toLowerCase() === 'content-type') continue;
      xhr.setRequestHeader(key, value);
    }

    if (opts.onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          opts.onUploadProgress!(pct);
        }
      };
    }

    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        body = xhr.responseText;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(unwrap<T>(body));
      } else {
        reject(parseApiError(xhr.status, body, parseXhrHeaders(xhr)));
      }
    };

    xhr.onerror = () => {
      reject(new FormFlowError('Network request failed', { code: 'network', status: 0 }));
    };

    xhr.onabort = () => {
      reject(new FormFlowError('The request was aborted', { code: 'aborted', status: 0 }));
    };

    // Wire an AbortSignal to xhr.abort().
    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        return;
      }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}

/** Parse an XHR's raw response headers into a case-insensitive lookup object. */
function parseXhrHeaders(xhr: XMLHttpRequest): Record<string, string> {
  const raw = xhr.getAllResponseHeaders?.() ?? '';
  const out: Record<string, string> = {};
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return out;
}
