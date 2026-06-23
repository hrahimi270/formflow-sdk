/**
 * Conditional-visibility logic, ported VERBATIM from the plugin's
 * `server/src/utils/validation-rules.ts` so the SDK hides/shows (and therefore
 * validates) fields identically to the server.
 */

import type { ConditionalRule } from './types';

/**
 * Determine whether a value counts as "empty" for conditional/required checks.
 * Matches the server's `isEmptyValue`: null/undefined, whitespace-only string,
 * or empty array are empty; everything else (incl. `0`, `false`) is not.
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * Evaluate a field's conditional rule against the full submission data.
 * Returns true when the field should be shown.
 *
 * Comparison semantics match the server exactly:
 * - equality is string-based (`String(x ?? '')`), so `1` equals `'1'`;
 * - `contains` on an array is exact-element membership (after String coercion),
 *   on a string is substring, and against anything else is `false`;
 * - an unknown operator fails OPEN (field stays visible).
 */
export function evaluateConditional(
  conditional: ConditionalRule,
  data: Record<string, unknown>
): boolean {
  const target = data[conditional.field];

  switch (conditional.operator) {
    case 'equals':
      return String(target ?? '') === String(conditional.value ?? '');

    case 'not_equals':
      return String(target ?? '') !== String(conditional.value ?? '');

    case 'contains': {
      const needle = String(conditional.value ?? '');
      if (Array.isArray(target)) {
        return target.map((v) => String(v)).includes(needle);
      }
      if (typeof target === 'string') {
        return target.includes(needle);
      }
      return false;
    }

    case 'is_empty':
      return isEmptyValue(target);

    case 'is_not_empty':
      return !isEmptyValue(target);

    default:
      // Unknown operator: default to visible so we never silently hide a field.
      return true;
  }
}

/**
 * Decide whether a field is currently visible given the submission data.
 * A field with no conditional rule (or a rule with no source field) is always
 * visible. Hidden fields must be skipped entirely during validation.
 */
export function isFieldVisible(
  conditional: ConditionalRule | undefined,
  data: Record<string, unknown>
): boolean {
  if (!conditional || !conditional.field) {
    return true;
  }
  return evaluateConditional(conditional, data);
}
