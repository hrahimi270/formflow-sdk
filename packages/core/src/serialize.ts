/**
 * Build the request payload for `POST /forms/:slug/submit` (and the per-step /
 * partial variants), matching the plugin's FLAT body contract exactly.
 *
 * Key rules (see audit-06):
 *   - Values are flat at the top level — NO `{ data: ... }` wrapper.
 *   - Only currently-VISIBLE, non-layout fields are included (conditional logic
 *     decides visibility, identically to the server).
 *   - Any visible `file` field carrying a `File`/`File[]` forces multipart.
 *   - Honeypot, captcha tokens and the `_step`/`_resumeToken` control fields are
 *     appended alongside the values.
 */

import type { CaptchaProvider, CaptchaTokens, FormSchema, FormValues } from './types';
import {
  CAPTCHA_TOKEN_FIELD,
  DEFAULT_HONEYPOT_FIELD,
  RESUME_TOKEN_FIELD,
  STEP_INDICATOR_FIELD,
} from './constants';
import { partitionFieldsByVisibility } from './conditional';
import { isLayoutField } from './constants';
import { isFile } from './file-rules';

/** Extra fields the caller can fold into the submit payload. */
export interface BuildSubmitDataExtras {
  /** Value to send for the honeypot field (default `''` when spam.honeypot). */
  honeypotValue?: string;
  /** Collected captcha tokens, keyed by provider. */
  captchaTokens?: CaptchaTokens;
  /** Step id/index → switches the endpoint to per-step validate-only mode. */
  stepIndicator?: string | number;
  /** Resume token → updates an existing save-and-resume draft. */
  resumeToken?: string;
}

/** The serialized payload, ready to hand to the client. */
export interface SubmitData {
  /** True when the body must be sent as `multipart/form-data`. */
  isMultipart: boolean;
  /** Present when `!isMultipart` — the flat JSON body. */
  json?: Record<string, unknown>;
  /** Present when `isMultipart` — the populated `FormData`. */
  formData?: FormData;
}

/**
 * Stringify a scalar value for a multipart text part. Arrays are handled by the
 * caller (repeated keys); booleans/numbers become their `String()` form.
 */
function toPart(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Build the submit payload for a form.
 *
 * @param schema - The form schema (drives field visibility + honeypot/spam config)
 * @param values - Current form values keyed by field name (file values are File|File[])
 * @param extras - Honeypot/captcha/step/resume control fields
 */
export function buildSubmitData(
  schema: FormSchema,
  values: FormValues,
  extras: BuildSubmitDataExtras = {}
): SubmitData {
  const { honeypotValue, captchaTokens, stepIndicator, resumeToken } = extras;

  // The set of fields whose values are eligible for the payload: visible,
  // non-layout. Visibility is evaluated against the full `values` object.
  const { visible } = partitionFieldsByVisibility(schema.fields, values);
  const includedFields = visible.filter((field) => !isLayoutField(field.type));

  // Multipart is required when any visible file field holds a real File.
  const isMultipart = includedFields.some((field) => {
    if (field.type !== 'file') return false;
    const v = values[field.name];
    return Array.isArray(v) ? v.some((f) => isFile(f)) : isFile(v);
  });

  // Control fields (honeypot/captcha/step/resume) appended after values.
  const honeypotEntry = resolveHoneypot(schema, honeypotValue);
  const captchaEntries = resolveCaptchaEntries(captchaTokens);

  if (!isMultipart) {
    const json: Record<string, unknown> = {};
    for (const field of includedFields) {
      const value = values[field.name];
      if (value === undefined) continue;
      // JSON keeps arrays as arrays; values pass through as-is.
      json[field.name] = value;
    }
    if (honeypotEntry) json[honeypotEntry.name] = honeypotEntry.value;
    for (const [key, token] of captchaEntries) json[key] = token;
    if (stepIndicator !== undefined) json[STEP_INDICATOR_FIELD] = stepIndicator;
    if (resumeToken !== undefined) json[RESUME_TOKEN_FIELD] = resumeToken;
    return { isMultipart: false, json };
  }

  const formData = new FormData();
  for (const field of includedFields) {
    const value = values[field.name];
    if (value === undefined) continue;

    if (field.type === 'file') {
      // Append File(s) under the field name; non-File entries are ignored.
      if (Array.isArray(value)) {
        for (const file of value) {
          if (isFile(file)) formData.append(field.name, file);
        }
      } else if (isFile(value)) {
        formData.append(field.name, value);
      }
      continue;
    }

    // Non-file values: arrays → repeated keys; scalars → String().
    if (Array.isArray(value)) {
      for (const item of value) formData.append(field.name, toPart(item));
    } else {
      formData.append(field.name, toPart(value));
    }
  }

  if (honeypotEntry) formData.append(honeypotEntry.name, honeypotEntry.value);
  for (const [key, token] of captchaEntries) formData.append(key, token);
  if (stepIndicator !== undefined) formData.append(STEP_INDICATOR_FIELD, String(stepIndicator));
  if (resumeToken !== undefined) formData.append(RESUME_TOKEN_FIELD, resumeToken);

  return { isMultipart: true, formData };
}

/**
 * Resolve the honeypot field name + value, or `null` when the honeypot is off.
 * Defaults the value to `''` (an empty honeypot is what a real user submits).
 */
function resolveHoneypot(
  schema: FormSchema,
  honeypotValue: string | undefined
): { name: string; value: string } | null {
  if (!schema.settings?.spam?.honeypot) return null;
  const name = schema.settings.spam.honeypotFieldName || DEFAULT_HONEYPOT_FIELD;
  return { name, value: honeypotValue ?? '' };
}

/**
 * Map collected captcha tokens to their request body field names. A provider is
 * only appended when a non-empty token is present.
 */
function resolveCaptchaEntries(tokens: CaptchaTokens | undefined): Array<[string, string]> {
  if (!tokens) return [];
  const entries: Array<[string, string]> = [];
  for (const provider of Object.keys(tokens) as CaptchaProvider[]) {
    const token = tokens[provider];
    if (typeof token === 'string' && token.length > 0) {
      entries.push([CAPTCHA_TOKEN_FIELD[provider], token]);
    }
  }
  return entries;
}
