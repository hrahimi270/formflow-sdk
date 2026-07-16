import { describe, expect, it } from 'vitest';
import { buildSubmitData } from './serialize';
import {
  conditionalForm,
  fileForm,
  freeFieldsForm,
  nestedConditionalForm,
} from './__fixtures__/forms';

describe('buildSubmitData — JSON path', () => {
  it('builds a flat body (no data wrapper) of visible fields', () => {
    const { isMultipart, json } = buildSubmitData(freeFieldsForm, {
      full_name: 'Ada',
      contact_email: 'a@b.com',
      message: 'hello world',
      age: 30,
    });
    expect(isMultipart).toBe(false);
    expect(json).toMatchObject({
      full_name: 'Ada',
      contact_email: 'a@b.com',
      message: 'hello world',
      age: 30,
    });
    // No wrapper key.
    expect(json && 'data' in json).toBe(false);
  });

  it('appends honeypot empty by default and the provided value when given', () => {
    expect(buildSubmitData(freeFieldsForm, {}).json?._gotcha).toBe('');
    expect(buildSubmitData(freeFieldsForm, {}, { honeypotValue: 'bot' }).json?._gotcha).toBe('bot');
  });

  it('omits honeypot when spam.honeypot is false', () => {
    const { json } = buildSubmitData(conditionalForm, { contact_method: 'email' });
    expect(json && '_gotcha' in json).toBe(false);
  });

  it('excludes fields hidden by conditional logic', () => {
    const { json } = buildSubmitData(conditionalForm, {
      contact_method: 'email',
      phone_number: '5551234567',
    });
    // phone_number is hidden (contact_method !== 'phone') → excluded.
    expect(json && 'phone_number' in json).toBe(false);

    const shown = buildSubmitData(conditionalForm, {
      contact_method: 'phone',
      phone_number: '5551234567',
    });
    expect(shown.json?.phone_number).toBe('5551234567');
  });

  it('excludes descendants when their conditional source is hidden', () => {
    const { json } = buildSubmitData(nestedConditionalForm, {
      show_details: 'no',
      details: '',
      follow_up: 'answer entered while incorrectly visible',
    });

    expect(json).toEqual({ show_details: 'no' });
  });

  it('appends captcha tokens under provider field names', () => {
    const { json } = buildSubmitData(
      freeFieldsForm,
      {},
      { captchaTokens: { recaptcha: 'rtok', turnstile: 'ttok', hcaptcha: 'htok' } }
    );
    expect(json?.recaptchaToken).toBe('rtok');
    expect(json?.turnstileToken).toBe('ttok');
    expect(json?.['h-captcha-response']).toBe('htok');
  });

  it('appends _step and _resumeToken when provided, arrays stay arrays', () => {
    const { json } = buildSubmitData(
      freeFieldsForm,
      { full_name: ['a', 'b'] },
      { stepIndicator: 'step-1', resumeToken: 'tok123' }
    );
    expect(json?._step).toBe('step-1');
    expect(json?._resumeToken).toBe('tok123');
    expect(json?.full_name).toEqual(['a', 'b']);
  });
});

describe('buildSubmitData — multipart path', () => {
  const mkFile = () => new File(['data'], 'cv.pdf', { type: 'application/pdf' });

  it('switches to multipart when a visible file field holds a File', () => {
    const file = mkFile();
    const { isMultipart, formData } = buildSubmitData(fileForm, { resume: file, name: 'Ada' });
    expect(isMultipart).toBe(true);
    expect(formData).toBeInstanceOf(FormData);
    expect(formData?.get('name')).toBe('Ada');
    expect(formData?.get('resume')).toBe(file);
    // Honeypot folded in as a text part.
    expect(formData?.get('_gotcha')).toBe('');
  });

  it('appends multiple files under the same field name', () => {
    const a = new File(['a'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['b'], 'b.pdf', { type: 'application/pdf' });
    const { formData } = buildSubmitData(fileForm, { resume: [a, b], name: '' });
    expect(formData?.getAll('resume')).toEqual([a, b]);
  });

  it('stringifies booleans/numbers and repeats array text parts', () => {
    const file = mkFile();
    const { formData } = buildSubmitData(
      fileForm,
      { resume: file, name: 'x' },
      { captchaTokens: { recaptcha: 'rt' }, stepIndicator: 2 }
    );
    expect(formData?.get('recaptchaToken')).toBe('rt');
    expect(formData?.get('_step')).toBe('2');
  });
});
