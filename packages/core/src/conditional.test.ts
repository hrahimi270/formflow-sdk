import { describe, expect, it } from 'vitest';
import { evaluateConditional, isEmptyValue, isFieldVisible } from './conditional';
import { partitionFieldsByVisibility } from './index';
import { field } from './__fixtures__/forms';
import type { FormField } from './types';

describe('isEmptyValue', () => {
  it('matches the server semantics', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('  ')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
  });
});

describe('evaluateConditional — all 5 operators', () => {
  it('equals / not_equals coerce to strings', () => {
    expect(evaluateConditional({ field: 'a', operator: 'equals', value: '1' }, { a: 1 })).toBe(true);
    expect(evaluateConditional({ field: 'a', operator: 'not_equals', value: '1' }, { a: 2 })).toBe(
      true
    );
  });
  it('contains works on arrays and strings', () => {
    expect(evaluateConditional({ field: 'a', operator: 'contains', value: 'x' }, { a: ['x'] })).toBe(
      true
    );
    expect(
      evaluateConditional({ field: 'a', operator: 'contains', value: 'ell' }, { a: 'hello' })
    ).toBe(true);
    expect(evaluateConditional({ field: 'a', operator: 'contains', value: 'x' }, { a: 5 })).toBe(
      false
    );
  });
  it('equals treats nullish target as empty string', () => {
    // String(undefined ?? '') === String('' ?? '') → '' === '' → true.
    expect(evaluateConditional({ field: 'a', operator: 'equals', value: '' }, {})).toBe(true);
    expect(evaluateConditional({ field: 'a', operator: 'not_equals', value: '1' }, { a: 1 })).toBe(
      false
    );
  });
  it('contains array membership is exact after String coercion', () => {
    expect(evaluateConditional({ field: 'a', operator: 'contains', value: '2' }, { a: [1, 2, 3] })).toBe(
      true
    );
    expect(evaluateConditional({ field: 'a', operator: 'contains', value: '9' }, { a: [1, 2, 3] })).toBe(
      false
    );
  });
  it('is_empty / is_not_empty (valueless, 0/false are NOT empty)', () => {
    expect(evaluateConditional({ field: 'a', operator: 'is_empty' }, { a: '' })).toBe(true);
    expect(evaluateConditional({ field: 'a', operator: 'is_empty' }, { a: [] })).toBe(true);
    expect(evaluateConditional({ field: 'a', operator: 'is_empty' }, {})).toBe(true);
    expect(evaluateConditional({ field: 'a', operator: 'is_not_empty' }, { a: 'x' })).toBe(true);
    // 0 / false are NOT empty.
    expect(evaluateConditional({ field: 'a', operator: 'is_not_empty' }, { a: 0 })).toBe(true);
    expect(evaluateConditional({ field: 'a', operator: 'is_not_empty' }, { a: false })).toBe(true);
  });
  it('unknown operator fails closed (hidden)', () => {
    expect(
      evaluateConditional({ field: 'a', operator: 'bogus' as never }, { a: 'x' })
    ).toBe(false);
  });
});

describe('isFieldVisible', () => {
  it('no conditional → always visible', () => {
    expect(isFieldVisible(undefined, {})).toBe(true);
    expect(isFieldVisible({ field: '', operator: 'equals' }, {})).toBe(true);
  });
  it('honors the rule', () => {
    expect(isFieldVisible({ field: 'a', operator: 'equals', value: 'yes' }, { a: 'yes' })).toBe(true);
    expect(isFieldVisible({ field: 'a', operator: 'equals', value: 'yes' }, { a: 'no' })).toBe(false);
  });
});

describe('partitionFieldsByVisibility', () => {
  it('fails closed for invalid source graphs', () => {
    const fields: FormField[] = [
      field({ type: 'text', name: 'always_first', label: 'Always first' }),
      field({
        type: 'text',
        name: 'missing_target',
        label: 'Missing target',
        conditional: { field: 'missing_source', operator: 'is_empty' },
      }),
      field({ type: 'text', name: 'duplicate_source', label: 'Duplicate one' }),
      field({ type: 'text', name: 'duplicate_source', label: 'Duplicate two' }),
      field({
        type: 'text',
        name: 'ambiguous_target',
        label: 'Ambiguous target',
        conditional: { field: 'duplicate_source', operator: 'is_empty' },
      }),
      field({ type: 'heading', name: 'layout_source', label: 'Layout source' }),
      field({
        type: 'text',
        name: 'layout_target',
        label: 'Layout target',
        conditional: { field: 'layout_source', operator: 'is_empty' },
      }),
      field({
        type: 'text',
        name: 'self_reference',
        label: 'Self reference',
        conditional: { field: 'self_reference', operator: 'is_empty' },
      }),
      field({
        type: 'text',
        name: 'cycle_a',
        label: 'Cycle A',
        conditional: { field: 'cycle_b', operator: 'is_empty' },
      }),
      field({
        type: 'text',
        name: 'cycle_b',
        label: 'Cycle B',
        conditional: { field: 'cycle_a', operator: 'is_empty' },
      }),
      field({
        type: 'text',
        name: 'cycle_descendant',
        label: 'Cycle descendant',
        conditional: { field: 'cycle_a', operator: 'is_empty' },
      }),
      field({
        type: 'text',
        name: 'empty_source_target',
        label: 'Empty source target',
        conditional: { field: '', operator: 'is_empty' },
      }),
      field({
        type: 'text',
        name: 'unsupported_operator',
        label: 'Unsupported operator',
        conditional: {
          field: 'always_first',
          operator: 'unsupported' as never,
        },
      }),
      field({ type: 'text', name: 'always_last', label: 'Always last' }),
    ];

    const { visible, hidden } = partitionFieldsByVisibility(fields, {});

    expect(visible.map((item) => item.name)).toEqual([
      'always_first',
      'duplicate_source',
      'duplicate_source',
      'layout_source',
      'always_last',
    ]);
    expect(hidden.map((item) => item.name)).toEqual([
      'missing_target',
      'ambiguous_target',
      'layout_target',
      'self_reference',
      'cycle_a',
      'cycle_b',
      'cycle_descendant',
      'empty_source_target',
      'unsupported_operator',
    ]);
  });

  it('resolves a visible chain regardless of field order', () => {
    const fields: FormField[] = [
      field({
        type: 'text',
        name: 'empty_child',
        label: 'Empty child',
        conditional: { field: 'visible_intermediate', operator: 'is_empty' },
      }),
      field({
        type: 'text',
        name: 'visible_intermediate',
        label: 'Visible intermediate',
        conditional: { field: 'visible_root', operator: 'equals', value: 'show' },
      }),
      field({ type: 'text', name: 'visible_root', label: 'Visible root' }),
    ];

    const result = partitionFieldsByVisibility(fields, { visible_root: 'show' });

    expect(result.visible.map((item) => item.name)).toEqual([
      'empty_child',
      'visible_intermediate',
      'visible_root',
    ]);
    expect(result.hidden).toEqual([]);
  });
});
