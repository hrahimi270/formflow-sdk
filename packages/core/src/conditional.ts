/** Conditional-visibility logic shared with the FormFlow Strapi plugin. */

import type { ConditionalRule } from './types';
import { isLayoutField } from './constants';

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
 * - an unknown operator fails closed (field stays hidden).
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
      return false;
  }
}

/**
 * Evaluate one conditional rule without resolving its source field's own
 * visibility. This flat helper is retained for backward compatibility; use
 * {@link partitionFieldsByVisibility} for authoritative form-level decisions.
 * A field with no conditional rule (or a rule with no source field) is visible.
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

/**
 * Partition fields in their original order while resolving conditional
 * dependencies as a graph. A conditional field is visible only when its named
 * source resolves to exactly one visible value-bearing field and its own rule
 * passes. Missing, ambiguous, layout-only, and cyclic sources fail closed.
 */
export function partitionFieldsByVisibility<
  T extends {
    name: string;
    type?: string;
    conditional?: ConditionalRule;
  },
>(fields: T[], data: Record<string, unknown>): { visible: T[]; hidden: T[] } {
  const visible: T[] = [];
  const hidden: T[] = [];
  const fieldIndexesByName = new Map<string, number[]>();
  const visibility = new Array<'visiting' | 'visible' | 'hidden' | undefined>(fields.length);

  for (const [index, field] of fields.entries()) {
    const matchingIndexes = fieldIndexesByName.get(field.name) ?? [];
    matchingIndexes.push(index);
    fieldIndexesByName.set(field.name, matchingIndexes);
  }

  const resolveVisibility = (index: number): boolean => {
    const resolved = visibility[index];
    if (resolved === 'visible') return true;
    if (resolved === 'hidden') return false;
    if (resolved === 'visiting') {
      visibility[index] = 'hidden';
      return false;
    }

    const field = fields[index];
    const conditional = field.conditional;

    if (!conditional) {
      visibility[index] = 'visible';
      return true;
    }

    visibility[index] = 'visiting';
    const sourceIndexes = conditional.field
      ? fieldIndexesByName.get(conditional.field)
      : undefined;
    const sourceIndex = sourceIndexes?.length === 1 ? sourceIndexes[0] : undefined;
    const isVisible =
      sourceIndex !== undefined &&
      !isLayoutField(fields[sourceIndex].type ?? '') &&
      resolveVisibility(sourceIndex) &&
      evaluateConditional(conditional, data);
    visibility[index] = isVisible ? 'visible' : 'hidden';
    return isVisible;
  };

  for (const [index, field] of fields.entries()) {
    (resolveVisibility(index) ? visible : hidden).push(field);
  }

  return { visible, hidden };
}
