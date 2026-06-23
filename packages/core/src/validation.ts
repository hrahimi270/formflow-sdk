/**
 * Client-side validation — a VERBATIM port of the plugin's server validation
 * service (`server/src/services/validation.ts`) as standalone pure functions.
 *
 * PARITY-CRITICAL: every default error-message string, per-rule branch, per-type
 * branch and skip/short-circuit decision must match the server exactly, so the
 * SDK rejects (and accepts) the same submissions the server would. The only
 * intentional deviations from the server source are:
 *   - it is a set of pure functions, not a Strapi service object (no `strapi`);
 *   - an invalid regex in a `pattern` rule is a silent no-op (the server logs a
 *     warning via `strapi.log.warn`; here there is no logger, so we drop it);
 *   - file values are read as browser `File | File[]` instead of formidable meta.
 */

import type {
  FormField,
  FormValues,
  ValidationResult,
  ValidationRule,
} from './types';
import { isEmptyValue, isFieldVisible } from './conditional';
import { isLayoutField } from './constants';
import { isFile, validateFile, type FileLike } from './file-rules';

/**
 * Re-export the shared "empty" predicate under the name the server validation
 * service exposed (`isEmpty`). Identical semantics: null/undefined,
 * whitespace-only string, or empty array are empty; `0`/`false` are NOT.
 */
export { isEmptyValue as isEmpty } from './conditional';

/**
 * Coerce a loosely-typed value to a boolean, for the required-`consent` check.
 * Mirrors the server's `coerceBoolean` (true/'true'/1 → true, false/'false'/0 →
 * false) and additionally treats the common form encodings `'yes'`/`'on'` as
 * true (a checked checkbox submits `'on'`). Everything else falls back to
 * `Boolean(value)`. The load-bearing guarantee is that an UNCHECKED consent
 * (`false` / `'false'` / `0`) never coerces to `true`.
 */
export function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === 'yes' || value === 'on') return true;
  if (value === 'false' || value === 0) return false;
  return Boolean(value);
}

/**
 * Resolve the "required" error message for a field: the field's optional
 * `requiredMessage` override, else `"<label> is required"`.
 *
 * `requiredMessage` is not part of the public schema (the server strips it), so
 * it is read permissively here — if an integrator hand-builds a schema with it,
 * the override is honored exactly as the server would.
 */
function requiredMessageFor(field: FormField): string {
  const override = (field as { requiredMessage?: string }).requiredMessage;
  return override ?? `${field.label} is required`;
}

/**
 * Execute a single validation rule against a value.
 *
 * @param rule  - Validation rule to execute
 * @param value - Value to validate
 * @param field - Field definition (used for the label in default messages)
 * @param data  - Full submission data (used by cross-field rules like `matches`)
 * @returns Error message if validation fails, `null` otherwise
 */
export function runValidationRule(
  rule: ValidationRule,
  value: unknown,
  field: FormField,
  data: FormValues = {}
): string | null {
  const ruleValue = rule.value;

  switch (rule.type) {
    case 'minLength': {
      const minLength = Number(ruleValue);
      if (typeof value === 'string' && value.length < minLength) {
        return rule.message || `${field.label} must be at least ${minLength} characters`;
      }
      break;
    }

    case 'maxLength': {
      const maxLength = Number(ruleValue);
      if (typeof value === 'string' && value.length > maxLength) {
        return rule.message || `${field.label} must be no more than ${maxLength} characters`;
      }
      break;
    }

    case 'min': {
      const minValue = Number(ruleValue);
      const numericValue = Number(value);
      if (!isNaN(numericValue) && numericValue < minValue) {
        return rule.message || `${field.label} must be at least ${minValue}`;
      }
      break;
    }

    case 'max': {
      const maxValue = Number(ruleValue);
      const numericValue = Number(value);
      if (!isNaN(numericValue) && numericValue > maxValue) {
        return rule.message || `${field.label} must be no more than ${maxValue}`;
      }
      break;
    }

    case 'pattern': {
      if (typeof ruleValue === 'string' && typeof value === 'string') {
        try {
          const regex = new RegExp(ruleValue);
          if (!regex.test(value)) {
            return rule.message || `${field.label} format is invalid`;
          }
        } catch {
          // Invalid regex pattern — silently skip (no-op). The server logs a
          // warning here; the SDK has no logger, so we simply do nothing.
        }
      }
      break;
    }

    case 'minSelected': {
      const minSelected = Number(ruleValue);
      if (Array.isArray(value) && value.length < minSelected) {
        return rule.message || `Select at least ${minSelected} option${minSelected !== 1 ? 's' : ''}`;
      }
      break;
    }

    case 'maxSelected': {
      const maxSelected = Number(ruleValue);
      if (Array.isArray(value) && value.length > maxSelected) {
        return (
          rule.message || `Select no more than ${maxSelected} option${maxSelected !== 1 ? 's' : ''}`
        );
      }
      break;
    }

    case 'minDate': {
      if (typeof ruleValue === 'string' && typeof value === 'string') {
        const minDate = new Date(ruleValue);
        const valueDate = new Date(value);
        if (!isNaN(minDate.getTime()) && !isNaN(valueDate.getTime()) && valueDate < minDate) {
          return rule.message || `${field.label} must be on or after ${ruleValue}`;
        }
      }
      break;
    }

    case 'maxDate': {
      if (typeof ruleValue === 'string' && typeof value === 'string') {
        const maxDate = new Date(ruleValue);
        const valueDate = new Date(value);
        if (!isNaN(maxDate.getTime()) && !isNaN(valueDate.getTime()) && valueDate > maxDate) {
          return rule.message || `${field.label} must be on or before ${ruleValue}`;
        }
      }
      break;
    }

    case 'minTime': {
      if (typeof ruleValue === 'string' && typeof value === 'string') {
        // Compare time strings in HH:MM format.
        if (value < ruleValue) {
          return rule.message || `${field.label} must be at or after ${ruleValue}`;
        }
      }
      break;
    }

    case 'maxTime': {
      if (typeof ruleValue === 'string' && typeof value === 'string') {
        // Compare time strings in HH:MM format.
        if (value > ruleValue) {
          return rule.message || `${field.label} must be at or before ${ruleValue}`;
        }
      }
      break;
    }

    case 'maxSize': {
      // File size validation — value is the file size in bytes, ruleValue in MB.
      const maxSizeBytes = Number(ruleValue) * 1024 * 1024;
      const fileSize = Number(value);
      if (!isNaN(fileSize) && fileSize > maxSizeBytes) {
        return rule.message || `File size must be no more than ${ruleValue}MB`;
      }
      break;
    }

    case 'allowedTypes': {
      // File type validation — check against allowed MIME types or extensions.
      if (typeof ruleValue === 'string' && typeof value === 'string') {
        const allowedTypes = ruleValue.split(',').map((t) => t.trim().toLowerCase());
        const fileType = value.toLowerCase();
        const matches = allowedTypes.some((allowed) => {
          if (allowed.endsWith('/*')) {
            // Wildcard type (e.g. image/*).
            const category = allowed.slice(0, -2);
            return fileType.startsWith(category);
          }
          return fileType === allowed || fileType.endsWith(allowed);
        });
        if (!matches) {
          return rule.message || `File type not allowed. Accepted types: ${ruleValue}`;
        }
      }
      break;
    }

    case 'matches': {
      // Cross-field equality (e.g. password confirmation). `rule.value` is the
      // NAME of the other field this value must equal.
      if (typeof ruleValue === 'string') {
        const otherValue = data[ruleValue];
        // Compare as strings so '1' (text input) matches 1, etc.
        if (String(value) !== String(otherValue)) {
          return rule.message || `${field.label} does not match`;
        }
      }
      break;
    }

    case 'custom': {
      // Safe no-op stub — matches the server, which does not evaluate
      // user-provided custom logic.
      break;
    }
  }

  return null;
}

/**
 * Validate a field value against built-in type-specific rules.
 *
 * @param type  - Field type
 * @param value - Value to validate
 * @returns Error message if validation fails, `null` otherwise
 */
export function validateFieldType(type: string, value: unknown): string | null {
  switch (type) {
    case 'email': {
      // RFC 5322 simplified email regex.
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof value === 'string' && !emailRegex.test(value)) {
        return 'Invalid email address';
      }
      break;
    }

    case 'url': {
      if (typeof value === 'string') {
        try {
          const url = new URL(value);
          // Ensure protocol is http or https.
          if (!['http:', 'https:'].includes(url.protocol)) {
            return 'URL must start with http:// or https://';
          }
        } catch {
          return 'Invalid URL format';
        }
      }
      break;
    }

    case 'number': {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return 'Must be a valid number';
      }
      break;
    }

    case 'phone': {
      // Allow digits, spaces, hyphens, plus sign, and parentheses.
      const phoneRegex = /^[\d\s\-+()]+$/;
      if (typeof value === 'string') {
        // Remove all formatting to check minimum digits.
        const digitsOnly = value.replace(/\D/g, '');
        if (!phoneRegex.test(value)) {
          return 'Invalid phone number format';
        }
        if (digitsOnly.length < 7) {
          return 'Phone number must have at least 7 digits';
        }
        if (digitsOnly.length > 15) {
          return 'Phone number is too long';
        }
      }
      break;
    }

    case 'date': {
      if (typeof value === 'string') {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return 'Invalid date format';
        }
      }
      break;
    }

    case 'time': {
      // Validate time format (HH:MM or HH:MM:SS).
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
      if (typeof value === 'string' && !timeRegex.test(value)) {
        return 'Invalid time format (use HH:MM)';
      }
      break;
    }

    case 'datetime': {
      if (typeof value === 'string') {
        const datetime = new Date(value);
        if (isNaN(datetime.getTime())) {
          return 'Invalid date and time format';
        }
      }
      break;
    }

    case 'boolean': {
      if (
        typeof value !== 'boolean' &&
        value !== 'true' &&
        value !== 'false' &&
        value !== 1 &&
        value !== 0
      ) {
        return 'Must be true or false';
      }
      break;
    }

    case 'signature': {
      // Base64 image data URL captured from the signature pad.
      if (typeof value !== 'string' || !value.startsWith('data:image/')) {
        return 'Signature must be a valid image data URL';
      }
      break;
    }

    case 'rating': {
      // Whole-number rating / NPS score on a 1–10 scale.
      const n = Number(value);
      if (!(!isNaN(n) && n >= 1 && n <= 10 && Number.isInteger(n))) {
        return 'Rating must be a whole number between 1 and 10';
      }
      break;
    }

    case 'address': {
      // Either a raw address string or an object with at least one truthy string
      // field (e.g. street). Reject empty string / empty object.
      if (typeof value === 'string') {
        if (value.trim() === '') {
          return 'Address must be a non-empty value';
        }
      } else if (value && typeof value === 'object') {
        const hasField = Object.values(value as Record<string, unknown>).some(
          (v) => typeof v === 'string' && v.trim() !== ''
        );
        if (!hasField) {
          return 'Address must be a non-empty value';
        }
      }
      break;
    }

    case 'richtext': {
      // HTML or Markdown string; no further validation (escaped on output).
      break;
    }

    case 'calculated': {
      // Read-only value computed server-side; accept any non-null value.
      break;
    }

    case 'payment': {
      // Capture-only: a Stripe PaymentIntent ID. No Stripe API call here.
      if (typeof value !== 'string' || !value.startsWith('pi_')) {
        return 'Payment reference must be a valid Stripe PaymentIntent ID';
      }
      break;
    }

    case 'consent': {
      // Any value is accepted at the type level — whether a *required* consent
      // must be checked is enforced in the per-field required check.
      break;
    }
  }

  return null;
}

/**
 * Validate that choice-field values fall within the field's allowed options.
 *
 * @param field - Field definition with options
 * @param value - Value(s) to validate
 * @returns Error message if validation fails, `null` otherwise
 */
export function validateFieldOptions(field: FormField, value: unknown): string | null {
  // Only validate choice fields with defined options.
  if (!['select', 'radio', 'checkbox'].includes(field.type) || !field.options?.length) {
    return null;
  }

  const allowedValues = field.options.map((opt) => opt.value);

  if (field.type === 'checkbox') {
    // Checkbox allows multiple values. Normalize a non-array value (e.g. a single
    // selected option submitted as a scalar) to an array so every element is
    // still checked against the allowed-options whitelist.
    const values = Array.isArray(value) ? value : [value];
    const invalidValues = values.filter((v) => !allowedValues.includes(String(v)));
    if (invalidValues.length > 0) {
      return `Invalid selection: ${invalidValues.join(', ')}`;
    }
  } else if (['select', 'radio'].includes(field.type)) {
    // Select and radio allow a single value.
    if (!allowedValues.includes(String(value))) {
      return 'Invalid selection';
    }
  }

  return null;
}

/**
 * Validate submission data against field definitions (port of the server's
 * `validate()`). Skips layout fields, `file` fields (handled by
 * {@link validateFiles}) and fields hidden by their conditional rule. Enforces
 * required (with the consent special case), runs custom rules, the per-type
 * check and the option whitelist.
 *
 * @param fields - Array of form field definitions
 * @param data   - Submission data keyed by field name
 */
export function validateFields(fields: FormField[], data: FormValues): ValidationResult {
  const errors: Record<string, string[]> = {};

  for (const field of fields) {
    // Skip layout fields (heading, paragraph, divider).
    if (isLayoutField(field.type)) {
      continue;
    }

    // File fields are validated separately by validateFiles().
    if (field.type === 'file') {
      continue;
    }

    // Skip fields hidden by their conditional rule.
    if (!isFieldVisible(field.conditional, data)) {
      continue;
    }

    const value = data[field.name];
    const fieldErrors: string[] = [];

    // Required check. A required `consent` field is special: an unchecked
    // consent arrives as a non-empty falsy value (false / 'false' / 0), which
    // `isEmpty` does not catch — acceptance is required only when the consent
    // coerces to `true`.
    if (field.required) {
      const consentNotAccepted = field.type === 'consent' && coerceBoolean(value) !== true;
      if (isEmptyValue(value) || consentNotAccepted) {
        fieldErrors.push(requiredMessageFor(field));
      }
    }

    // Skip other validations if value is empty and field is not required.
    if (isEmptyValue(value) && !field.required) {
      continue;
    }

    // Only run further validation if we have a non-empty value.
    if (!isEmptyValue(value)) {
      // Custom validation rules.
      for (const rule of field.validation || []) {
        const error = runValidationRule(rule, value, field, data);
        if (error) {
          fieldErrors.push(error);
        }
      }

      // Built-in type-specific validation.
      const typeError = validateFieldType(field.type, value);
      if (typeError) {
        fieldErrors.push(typeError);
      }

      // Choice-field option whitelist.
      const optionError = validateFieldOptions(field, value);
      if (optionError) {
        fieldErrors.push(optionError);
      }
    }

    if (fieldErrors.length > 0) {
      errors[field.name] = fieldErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate uploaded files against the form's `file` field definitions (port of
 * the server's `validateFiles()`). Reads `data[name]` as a browser `File` or
 * `File[]`. Hidden file fields are skipped. A required file field with no file
 * errors; each present file is checked against the field's `maxSize`/
 * `allowedTypes` rules via {@link validateFile}.
 *
 * @param fields - Array of form field definitions
 * @param data   - Submission data keyed by field name (file values are File|File[])
 */
export function validateFiles(fields: FormField[], data: FormValues): ValidationResult {
  const errors: Record<string, string[]> = {};

  for (const field of fields) {
    if (field.type !== 'file') {
      continue;
    }

    // A file field hidden by its conditional rule enforces nothing.
    if (!isFieldVisible(field.conditional, data)) {
      continue;
    }

    const raw = data[field.name];
    const fileList: FileLike[] = Array.isArray(raw)
      ? (raw.filter((f) => isFile(f)) as FileLike[])
      : isFile(raw)
        ? [raw]
        : [];

    const fieldErrors: string[] = [];

    if (fileList.length === 0) {
      if (field.required) {
        fieldErrors.push(requiredMessageFor(field));
      }
      if (fieldErrors.length > 0) {
        errors[field.name] = fieldErrors;
      }
      continue;
    }

    // Validate each file against the field's size/type rules.
    for (const file of fileList) {
      fieldErrors.push(...validateFile(file, field.validation || []));
    }

    if (fieldErrors.length > 0) {
      errors[field.name] = fieldErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate only a SUBSET of a form's fields, identified by field `id` or `name`
 * (port of the server's `validateSubset()`). Used for per-step validation: a
 * field is included when its `id` OR its `name` is in `fieldKeys`. Conditional
 * visibility is still evaluated against the FULL `data` object, so a step field
 * depending on an earlier step's value resolves correctly.
 *
 * @param fields    - Full array of form field definitions
 * @param fieldKeys - Field ids and/or names that belong to the subset
 * @param data      - Full submission data keyed by field name
 */
export function validateSubset(
  fields: FormField[],
  fieldKeys: string[] | Set<string>,
  data: FormValues
): ValidationResult {
  const keySet = fieldKeys instanceof Set ? fieldKeys : new Set(fieldKeys);

  const subset = fields.filter(
    (field) => (field.id !== undefined && keySet.has(field.id)) || keySet.has(field.name)
  );

  // Reuse the exact full-form per-field logic on the filtered subset.
  return validateFields(subset, data);
}

/**
 * Validate the whole form: merge the value-field result ({@link validateFields})
 * with the file-field result ({@link validateFiles}). Errors for a field that
 * appears in both are concatenated.
 *
 * @param fields - Array of form field definitions
 * @param data   - Submission data keyed by field name
 */
export function validateForm(fields: FormField[], data: FormValues): ValidationResult {
  const fieldResult = validateFields(fields, data);
  const fileResult = validateFiles(fields, data);

  const errors: Record<string, string[]> = { ...fieldResult.errors };
  for (const [name, messages] of Object.entries(fileResult.errors)) {
    errors[name] = errors[name] ? [...errors[name], ...messages] : messages;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
