import { describe, expect, it } from 'vitest';
import { evaluateConditional, isEmptyValue, isFieldVisible } from './conditional';

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
  it('unknown operator fails open (visible)', () => {
    expect(
      evaluateConditional({ field: 'a', operator: 'bogus' as never }, { a: 'x' })
    ).toBe(true);
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
