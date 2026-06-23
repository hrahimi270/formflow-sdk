/**
 * Type definitions mirroring the FormFlow Strapi plugin's PUBLIC content-API
 * contract (the only surface a frontend SDK ever sees).
 *
 * Source of truth: the plugin's `getPublicSchema` projection and the
 * `validation` / conditional-logic services. These types describe exactly what
 * `GET /api/formflow/forms/:slug` returns and what the submit/partial endpoints
 * accept and return.
 */

/* ------------------------------------------------------------------ *
 * Field types
 * ------------------------------------------------------------------ */

/** The 26 field-type ids supported by the plugin (server registry order). */
export type FieldTypeName =
  // basic
  | 'text'
  | 'textarea'
  | 'email'
  | 'number'
  | 'phone'
  | 'url'
  | 'password'
  // choice
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'boolean'
  // datetime
  | 'date'
  | 'time'
  | 'datetime'
  // advanced (free)
  | 'file'
  | 'hidden'
  // advanced (pro)
  | 'signature'
  | 'rating'
  | 'address'
  | 'richtext'
  | 'calculated'
  | 'payment'
  // advanced (business)
  | 'consent'
  // layout (no submission value)
  | 'heading'
  | 'paragraph'
  | 'divider';

export type FieldTypeCategory = 'basic' | 'choice' | 'datetime' | 'advanced' | 'layout';
export type FieldTier = 'free' | 'pro' | 'business';
export type FieldWidth = 'full' | 'half';

/** Entry returned by the (admin) `GET /formflow/field-types` registry endpoint. */
export interface FieldTypeDefinition {
  type: FieldTypeName | (string & {});
  label: string;
  icon: string;
  category: FieldTypeCategory;
  tier?: FieldTier;
}

/** Option for choice fields (select / radio / checkbox). */
export interface FieldOption {
  label: string;
  value: string;
}

/* ------------------------------------------------------------------ *
 * Validation rules
 * ------------------------------------------------------------------ */

/**
 * A validation-rule entry stored on a field. Per-field constraints
 * (min/max/length/pattern/file size & type) live here — NOT as top-level field
 * props. `value` is a number for numeric rules, a string for pattern/date/time/
 * allowedTypes, and (for `matches`) the NAME of another field. `maxSize` is in
 * MEGABYTES.
 */
export interface ValidationRule {
  type: ValidationRuleType | (string & {});
  value?: unknown;
  /** Optional custom override message (the builder seeds `''`). */
  message?: string;
}

export type ValidationRuleType =
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'min'
  | 'max'
  | 'minDate'
  | 'maxDate'
  | 'minTime'
  | 'maxTime'
  | 'minSelected'
  | 'maxSelected'
  | 'maxSize'
  | 'allowedTypes'
  | 'email'
  | 'url'
  | 'matches'
  | 'custom';

/* ------------------------------------------------------------------ *
 * Conditional logic
 * ------------------------------------------------------------------ */

/** The complete, exhaustive conditional-operator set. No others exist. */
export type ConditionalOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty';

/** A single, flat conditional-visibility rule (no combinator, no groups). */
export interface ConditionalRule {
  /** Name (NOT id) of the source field whose value is inspected. */
  field: string;
  operator: ConditionalOperator;
  /** Compare value; absent for is_empty / is_not_empty. */
  value?: unknown;
}

/* ------------------------------------------------------------------ *
 * Form field (public schema shape)
 * ------------------------------------------------------------------ */

/**
 * A field as returned by `GET /api/formflow/forms/:slug`. This is the permissive
 * shape the public schema actually serializes. Narrow on `field.type` to drive
 * per-type rendering.
 */
export interface FormField {
  id: string;
  type: FieldTypeName | (string & {});
  /** Submission-data key. */
  name: string;
  label: string;
  placeholder?: string;
  /** Shown as "Help Text" in the builder. */
  description?: string;
  required: boolean;
  /** Present for choice fields (select / radio / checkbox). */
  options?: FieldOption[];
  defaultValue?: unknown;
  order: number;
  width?: FieldWidth;
  conditional?: ConditionalRule;
  validation: ValidationRule[];
  /**
   * Free-form per-type extras. Only `heading` ({ level }) and `paragraph`
   * ({ content }) are currently produced by the builder, and they are not
   * always exposed by the public schema — treat as forward-compatible.
   */
  attributes?: Record<string, unknown> & {
    level?: 'h1' | 'h2' | 'h3' | 'h4';
    content?: string;
  };
}

/* ------------------------------------------------------------------ *
 * Form settings (public schema shape)
 * ------------------------------------------------------------------ */

export type FormLayout = 'single' | 'multi-step';

/** A single step of a multi-step (wizard) form. `fields` are FormField IDs. */
export interface FormStep {
  id: string;
  title?: string;
  description?: string;
  /** FormField.id values that belong to this step (NOT field names). */
  fields: string[];
}

/** Public-safe reCAPTCHA info; present only when reCAPTCHA is enabled. */
export interface PublicRecaptchaConfig {
  siteKey: string;
  version: 'v2' | 'v3';
}

/** Spam config as exposed in the public schema. */
export interface PublicSpamConfig {
  honeypot: boolean;
  /** May be undefined in the response — fall back to `_gotcha`. */
  honeypotFieldName?: string;
  /** Present only when reCAPTCHA is enabled. Turnstile/hCaptcha are never exposed. */
  recaptcha?: PublicRecaptchaConfig;
}

/** The curated `settings` subset returned by the public schema endpoint. */
export interface FormSettings {
  submitButtonText: string;
  showResetButton: boolean;
  resetButtonText: string;
  layout: FormLayout;
  /** Present only when `layout === 'multi-step'`. */
  steps?: FormStep[];
  /** Present only when non-empty. */
  customCss?: string;
  spam: PublicSpamConfig;
}

/* ------------------------------------------------------------------ *
 * Form schema (public)
 * ------------------------------------------------------------------ */

/** The object returned (under `data`) by `GET /api/formflow/forms/:slug`. */
export interface FormSchema {
  title: string;
  description?: string;
  slug: string;
  /** Present only when a requested locale supplies a successMessage override. */
  successMessage?: string;
  fields: FormField[];
  settings: FormSettings;
}

/* ------------------------------------------------------------------ *
 * Values, errors, results
 * ------------------------------------------------------------------ */

/** Submission values keyed by field `name`. */
export type FormValues = Record<string, unknown>;

/** Validation errors keyed by field `name`; each value is a list of messages. */
export type FormErrors = Record<string, string[]>;

export interface ValidationResult {
  valid: boolean;
  errors: FormErrors;
}

/** Body of a successful full submit (`{ data: ... }` unwrapped). */
export interface SubmitSuccess {
  success: true;
  message: string;
  redirectUrl: string | null;
}

/** Body of a successful per-step validate-only call (`{ data: ... }` unwrapped). */
export interface StepValidationSuccess {
  valid: true;
  step: string;
  errors: Record<string, never>;
}

/** Body of a successful save-and-resume save (Pro). */
export interface PartialSaveResult {
  resumeToken: string;
  /** ISO-8601 timestamp ~7 days out. */
  expiresAt: string;
}

/** Body of a successful save-and-resume load (Pro). */
export interface PartialResumeResult {
  data: FormValues;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Captcha
 * ------------------------------------------------------------------ */

export type CaptchaProvider = 'recaptcha' | 'turnstile' | 'hcaptcha';

/**
 * Captcha configuration the integrator supplies to the SDK. The public schema
 * exposes the reCAPTCHA site key + version, but NOT Turnstile/hCaptcha site keys
 * — pass those here if the form uses them.
 */
export interface CaptchaConfig {
  /** Override/provide the reCAPTCHA site key (schema usually provides it). */
  recaptchaSiteKey?: string;
  /** Required to render Turnstile (never in the schema). */
  turnstileSiteKey?: string;
  /** Required to render hCaptcha (never in the schema). */
  hcaptchaSiteKey?: string;
}

/** Captcha tokens collected from widgets, keyed by provider. */
export type CaptchaTokens = Partial<Record<CaptchaProvider, string>>;

/* ------------------------------------------------------------------ *
 * Uploaded file metadata (server-side shape; accepted for cross-checks)
 * ------------------------------------------------------------------ */

export interface UploadedFileMeta {
  originalFilename?: string | null;
  name?: string | null;
  mimetype?: string | null;
  type?: string | null;
  size?: number;
}
