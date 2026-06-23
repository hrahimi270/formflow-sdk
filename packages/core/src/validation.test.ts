import { describe, expect, it } from 'vitest';
import {
  coerceBoolean,
  isEmpty,
  runValidationRule,
  validateFieldOptions,
  validateFieldType,
  validateFields,
  validateFiles,
  validateForm,
  validateSubset,
} from './validation';
import { field, freeFieldsForm, multiStepForm } from './__fixtures__/forms';
import type { FormField } from './types';

describe('coerceBoolean', () => {
  it('maps truthy form encodings to true', () => {
    for (const v of [true, 'true', 1, 'yes', 'on']) {
      expect(coerceBoolean(v)).toBe(true);
    }
  });
  it('maps unchecked-consent encodings to false', () => {
    for (const v of [false, 'false', 0]) {
      expect(coerceBoolean(v)).toBe(false);
    }
  });
});

describe('isEmpty', () => {
  it('treats null/undefined/blank/[] as empty but keeps 0 and false', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
  });
});

describe('validateFieldType — exact messages', () => {
  it('email', () => {
    expect(validateFieldType('email', 'bad')).toBe('Invalid email address');
    expect(validateFieldType('email', 'a@b.com')).toBeNull();
  });
  it('url', () => {
    expect(validateFieldType('url', 'notaurl')).toBe('Invalid URL format');
    expect(validateFieldType('url', 'ftp://x.com')).toBe('URL must start with http:// or https://');
    expect(validateFieldType('url', 'https://x.com')).toBeNull();
  });
  it('number', () => {
    expect(validateFieldType('number', 'abc')).toBe('Must be a valid number');
    expect(validateFieldType('number', '42')).toBeNull();
  });
  it('phone', () => {
    expect(validateFieldType('phone', 'abc')).toBe('Invalid phone number format');
    expect(validateFieldType('phone', '123')).toBe('Phone number must have at least 7 digits');
    expect(validateFieldType('phone', '1234567890123456')).toBe('Phone number is too long');
    expect(validateFieldType('phone', '+1 (555) 123-4567')).toBeNull();
  });
  it('time / date / datetime', () => {
    expect(validateFieldType('time', '99:99')).toBe('Invalid time format (use HH:MM)');
    expect(validateFieldType('time', '14:30')).toBeNull();
    expect(validateFieldType('time', '14:30:59')).toBeNull();
    expect(validateFieldType('date', 'nope')).toBe('Invalid date format');
    expect(validateFieldType('date', '2025-06-23')).toBeNull();
    expect(validateFieldType('datetime', 'nope')).toBe('Invalid date and time format');
    expect(validateFieldType('datetime', '2025-06-23T14:30:00Z')).toBeNull();
  });
  it('boolean', () => {
    expect(validateFieldType('boolean', 'maybe')).toBe('Must be true or false');
    expect(validateFieldType('boolean', 'true')).toBeNull();
    expect(validateFieldType('boolean', 'false')).toBeNull();
    expect(validateFieldType('boolean', true)).toBeNull();
    expect(validateFieldType('boolean', 1)).toBeNull();
    expect(validateFieldType('boolean', 0)).toBeNull();
  });
  it('rating rejects non-integers and out-of-range, accepts 1 and 10', () => {
    expect(validateFieldType('rating', 0)).toBe('Rating must be a whole number between 1 and 10');
    expect(validateFieldType('rating', 5.5)).toBe('Rating must be a whole number between 1 and 10');
    expect(validateFieldType('rating', 1)).toBeNull();
    expect(validateFieldType('rating', 10)).toBeNull();
  });
  it('unknown / value-less field types are accepted (null)', () => {
    expect(validateFieldType('text', 'anything')).toBeNull();
    expect(validateFieldType('hidden', 'x')).toBeNull();
    expect(validateFieldType('richtext', '<b>hi</b>')).toBeNull();
    expect(validateFieldType('calculated', 42)).toBeNull();
    expect(validateFieldType('consent', true)).toBeNull();
  });
  it('signature / rating / payment', () => {
    expect(validateFieldType('signature', 'x')).toBe('Signature must be a valid image data URL');
    expect(validateFieldType('signature', 'data:image/png;base64,AAA')).toBeNull();
    expect(validateFieldType('rating', 11)).toBe('Rating must be a whole number between 1 and 10');
    expect(validateFieldType('rating', 5)).toBeNull();
    expect(validateFieldType('payment', 'x')).toBe(
      'Payment reference must be a valid Stripe PaymentIntent ID'
    );
    expect(validateFieldType('payment', 'pi_123')).toBeNull();
  });
  it('address', () => {
    expect(validateFieldType('address', '   ')).toBe('Address must be a non-empty value');
    expect(validateFieldType('address', {})).toBe('Address must be a non-empty value');
    expect(validateFieldType('address', { street: '1 Main St' })).toBeNull();
  });
});

describe('runValidationRule — exact messages', () => {
  const f = field({ type: 'text', name: 'x', label: 'Name' });

  it('minLength / maxLength', () => {
    expect(runValidationRule({ type: 'minLength', value: 5 }, 'ab', f, {})).toBe(
      'Name must be at least 5 characters'
    );
    expect(runValidationRule({ type: 'maxLength', value: 2 }, 'abcd', f, {})).toBe(
      'Name must be no more than 2 characters'
    );
  });
  it('min / max', () => {
    expect(runValidationRule({ type: 'min', value: 10 }, '5', f, {})).toBe('Name must be at least 10');
    expect(runValidationRule({ type: 'max', value: 10 }, '50', f, {})).toBe(
      'Name must be no more than 10'
    );
  });
  it('pattern honors custom message and no-ops on invalid regex', () => {
    expect(
      runValidationRule({ type: 'pattern', value: '^\\d+$', message: 'digits only' }, 'abc', f, {})
    ).toBe('digits only');
    // Invalid regex must NOT throw and must return null.
    expect(() => runValidationRule({ type: 'pattern', value: '(' }, 'abc', f, {})).not.toThrow();
    expect(runValidationRule({ type: 'pattern', value: '(' }, 'abc', f, {})).toBeNull();
  });
  it('minSelected / maxSelected pluralization', () => {
    expect(runValidationRule({ type: 'minSelected', value: 2 }, ['a'], f, {})).toBe(
      'Select at least 2 options'
    );
    expect(runValidationRule({ type: 'minSelected', value: 1 }, [], f, {})).toBe(
      'Select at least 1 option'
    );
    expect(runValidationRule({ type: 'maxSelected', value: 1 }, ['a', 'b'], f, {})).toBe(
      'Select no more than 1 option'
    );
  });
  it('minDate / maxDate', () => {
    expect(runValidationRule({ type: 'minDate', value: '2025-01-01' }, '2024-12-31', f, {})).toBe(
      'Name must be on or after 2025-01-01'
    );
    expect(
      runValidationRule({ type: 'minDate', value: '2025-01-01' }, '2025-06-01', f, {})
    ).toBeNull();
    expect(runValidationRule({ type: 'maxDate', value: '2025-12-31' }, '2026-01-01', f, {})).toBe(
      'Name must be on or before 2025-12-31'
    );
    expect(
      runValidationRule({ type: 'maxDate', value: '2025-12-31' }, '2025-06-01', f, {})
    ).toBeNull();
    // Unparseable date → no-op (server compares getTime() guarded by isNaN).
    expect(runValidationRule({ type: 'minDate', value: 'not-a-date' }, 'also-bad', f, {})).toBeNull();
  });
  it('minTime / maxTime (lexical HH:MM compare)', () => {
    expect(runValidationRule({ type: 'minTime', value: '09:00' }, '08:30', f, {})).toBe(
      'Name must be at or after 09:00'
    );
    expect(runValidationRule({ type: 'minTime', value: '09:00' }, '10:00', f, {})).toBeNull();
    expect(runValidationRule({ type: 'maxTime', value: '17:00' }, '18:00', f, {})).toBe(
      'Name must be at or before 17:00'
    );
    expect(runValidationRule({ type: 'maxTime', value: '17:00' }, '16:00', f, {})).toBeNull();
  });
  it('maxSize compares bytes against MB threshold', () => {
    // ruleValue is MB; value is bytes. 2MB value vs 1MB cap → fails.
    expect(runValidationRule({ type: 'maxSize', value: 1 }, 2 * 1024 * 1024, f, {})).toBe(
      'File size must be no more than 1MB'
    );
    expect(runValidationRule({ type: 'maxSize', value: 1 }, 500, f, {})).toBeNull();
  });
  it('allowedTypes matches MIME, wildcard and extension', () => {
    expect(runValidationRule({ type: 'allowedTypes', value: 'application/pdf' }, 'image/png', f, {})).toBe(
      'File type not allowed. Accepted types: application/pdf'
    );
    expect(
      runValidationRule({ type: 'allowedTypes', value: 'image/*' }, 'image/png', f, {})
    ).toBeNull();
    expect(
      runValidationRule({ type: 'allowedTypes', value: 'application/pdf' }, 'application/pdf', f, {})
    ).toBeNull();
  });
  it('matches cross-field', () => {
    expect(
      runValidationRule({ type: 'matches', value: 'password' }, 'a', f, { password: 'b' })
    ).toBe('Name does not match');
    expect(
      runValidationRule({ type: 'matches', value: 'password' }, '1', f, { password: 1 })
    ).toBeNull();
  });
  it('custom is a no-op', () => {
    expect(runValidationRule({ type: 'custom' }, 'anything', f, {})).toBeNull();
  });
  it('unknown rule type returns null', () => {
    expect(runValidationRule({ type: 'totally-unknown' }, 'x', f, {})).toBeNull();
  });
});

describe('validateFieldOptions', () => {
  const sel = field({
    type: 'select',
    name: 's',
    label: 'S',
    options: [{ label: 'A', value: 'a' }],
  });
  const cb = field({
    type: 'checkbox',
    name: 'c',
    label: 'C',
    options: [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ],
  });
  it('select rejects unknown values', () => {
    expect(validateFieldOptions(sel, 'z')).toBe('Invalid selection');
    expect(validateFieldOptions(sel, 'a')).toBeNull();
  });
  it('checkbox lists every invalid value', () => {
    expect(validateFieldOptions(cb, ['a', 'z', 'q'])).toBe('Invalid selection: z, q');
    expect(validateFieldOptions(cb, ['a', 'b'])).toBeNull();
  });
});

describe('validateFields — required + skip rules', () => {
  it('flags required-empty and short message, skips optional-empty', () => {
    const result = validateFields(freeFieldsForm.fields, { full_name: '', message: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.contact_email).toEqual(['Email is required']);
    expect(result.errors.message).toEqual(['Message is required']);
    // full_name optional + empty → no error.
    expect(result.errors.full_name).toBeUndefined();
  });

  it('runs type + custom rules on present values', () => {
    const result = validateFields(freeFieldsForm.fields, {
      contact_email: 'nope',
      message: 'short',
      age: '5',
    });
    expect(result.errors.contact_email).toEqual(['Invalid email address']);
    // minLength has empty custom message → falls back to default.
    expect(result.errors.message).toEqual(['Message must be at least 10 characters']);
    expect(result.errors.age).toEqual(['Age must be at least 18']);
  });

  it('required consent must coerce to true', () => {
    const consent = field({ type: 'consent', name: 'agree', label: 'Agree', required: true });
    expect(validateFields([consent], { agree: false }).errors.agree).toEqual(['Agree is required']);
    expect(validateFields([consent], { agree: true }).valid).toBe(true);
  });

  it('skips hidden fields entirely', () => {
    const fields: FormField[] = [
      field({ type: 'select', name: 'method', label: 'M' }),
      field({
        type: 'phone',
        name: 'phone',
        label: 'Phone',
        required: true,
        conditional: { field: 'method', operator: 'equals', value: 'phone' },
      }),
    ];
    // method !== 'phone' → phone field hidden → no required error.
    expect(validateFields(fields, { method: 'email' }).valid).toBe(true);
    // method === 'phone' → phone required.
    expect(validateFields(fields, { method: 'phone' }).errors.phone).toEqual(['Phone is required']);
  });
});

describe('validateFiles', () => {
  const mkFile = (name: string, size: number, type: string): File =>
    new File([new Uint8Array(size)], name, { type });

  const fileField = field({
    type: 'file',
    name: 'doc',
    label: 'Doc',
    required: true,
    validation: [
      { type: 'maxSize', value: 1 },
      { type: 'allowedTypes', value: 'application/pdf' },
    ],
  });

  it('requires a file when none provided', () => {
    expect(validateFiles([fileField], {}).errors.doc).toEqual(['Doc is required']);
  });
  it('passes a valid file', () => {
    const f = mkFile('a.pdf', 1000, 'application/pdf');
    expect(validateFiles([fileField], { doc: f }).valid).toBe(true);
  });
  it('rejects oversize and wrong type', () => {
    const tooBig = mkFile('a.pdf', 2 * 1024 * 1024, 'application/pdf');
    expect(validateFiles([fileField], { doc: tooBig }).errors.doc[0]).toContain(
      'exceeds the maximum size'
    );
    const wrong = mkFile('a.png', 10, 'image/png');
    expect(validateFiles([fileField], { doc: wrong }).errors.doc[0]).toContain(
      'type is not allowed'
    );
  });
});

describe('validateSubset / validateForm', () => {
  it('validateSubset matches by id or name', () => {
    // Only step-1 fields (by id) validated.
    const result = validateSubset(multiStepForm.fields, ['f_first', 'f_last'], {});
    expect(Object.keys(result.errors).sort()).toEqual(['first_name', 'last_name']);
    expect(result.errors.email).toBeUndefined();
  });

  it('validateForm merges value + file errors', () => {
    const fields: FormField[] = [
      field({ type: 'email', name: 'email', label: 'Email', required: true }),
      field({ type: 'file', name: 'doc', label: 'Doc', required: true }),
    ];
    const result = validateForm(fields, {});
    expect(result.errors.email).toEqual(['Email is required']);
    expect(result.errors.doc).toEqual(['Doc is required']);
  });
});
