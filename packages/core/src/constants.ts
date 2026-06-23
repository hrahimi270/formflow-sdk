/**
 * Load-bearing constants shared across the SDK. These names must match the
 * plugin's content-API exactly.
 */

import type { CaptchaProvider, FieldTypeName } from './types';

/** Default content-API mount prefix (plugin id `formflow` mounted under `/api`). */
export const DEFAULT_API_PREFIX = '/api/formflow';

/* ---- Control field names (stripped from data by the server) ---- */

/** Body field that switches the submit endpoint to per-step validate-only mode. */
export const STEP_INDICATOR_FIELD = '_step';

/** Body field that updates an existing save-and-resume draft. */
export const RESUME_TOKEN_FIELD = '_resumeToken';

/** Default honeypot field name when `settings.spam.honeypotFieldName` is unset. */
export const DEFAULT_HONEYPOT_FIELD = '_gotcha';

/* ---- Captcha token body field names (no headers are used) ---- */

/** The body field each captcha provider's token must be sent under. */
export const CAPTCHA_TOKEN_FIELD: Record<CaptchaProvider, string> = {
  recaptcha: 'recaptchaToken',
  turnstile: 'turnstileToken',
  hcaptcha: 'h-captcha-response',
};

/** Alternate field the server also accepts for reCAPTCHA tokens. */
export const RECAPTCHA_ALT_TOKEN_FIELD = 'g-recaptcha-response';

/* ---- Field-type groupings ---- */

export const LAYOUT_FIELD_TYPES = ['heading', 'paragraph', 'divider'] as const;
export const CHOICE_FIELD_TYPES = ['select', 'radio', 'checkbox'] as const;
export const MULTI_VALUE_FIELD_TYPES = ['checkbox'] as const;
export const DEFAULT_VALUE_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'number',
  'hidden',
  'url',
  'phone',
] as const;

/** Field types gated behind a Pro license (may be present in a schema regardless). */
export const PRO_FIELD_TYPES = [
  'signature',
  'rating',
  'address',
  'richtext',
  'calculated',
  'payment',
] as const;

/** Field types gated behind a Business license. */
export const BUSINESS_FIELD_TYPES = ['consent'] as const;

export const CONDITIONAL_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'is_empty',
  'is_not_empty',
] as const;

/** Operators that ignore `value`. */
export const VALUELESS_OPERATORS = ['is_empty', 'is_not_empty'] as const;

/** True when the field type renders layout/content only and carries no value. */
export function isLayoutField(type: string): boolean {
  return (LAYOUT_FIELD_TYPES as readonly string[]).includes(type);
}

/** True when the field type is a choice field (select / radio / checkbox). */
export function isChoiceField(type: string): boolean {
  return (CHOICE_FIELD_TYPES as readonly string[]).includes(type);
}

/** True when the field stores an array of values (checkbox group). */
export function isMultiValueField(type: string): boolean {
  return (MULTI_VALUE_FIELD_TYPES as readonly string[]).includes(type);
}

/** True when the field type is Pro-gated. */
export function isProFieldType(type: string): boolean {
  return (PRO_FIELD_TYPES as readonly string[]).includes(type);
}

/** Categorize a field type's tier (best-effort, based on the plugin registry). */
export function fieldTierForType(type: FieldTypeName | string): 'free' | 'pro' | 'business' {
  if ((PRO_FIELD_TYPES as readonly string[]).includes(type)) return 'pro';
  if ((BUSINESS_FIELD_TYPES as readonly string[]).includes(type)) return 'business';
  return 'free';
}
