import { describe, expect, it, vi } from 'vitest';
import { createFormStore } from './store';
import { FormFlowError } from './errors';
import type { FormFlowClient } from './client';
import {
  conditionalForm,
  fileForm,
  freeFieldsForm,
  multiStepForm,
  nestedConditionalForm,
} from './__fixtures__/forms';

/** A minimal mock client; override only the methods a test exercises. */
function mockClient(overrides: Partial<FormFlowClient> = {}): FormFlowClient {
  return {
    getForm: vi.fn(),
    submit: vi.fn(),
    validateStep: vi.fn(),
    savePartial: vi.fn(),
    loadPartial: vi.fn(),
    ...overrides,
  } as FormFlowClient;
}

describe('createFormStore — initial state', () => {
  it('single-layout has stepCount 1 and currentStep 0', () => {
    const store = createFormStore(freeFieldsForm, { client: mockClient() });
    const s = store.getState();
    expect(s.stepCount).toBe(1);
    expect(s.currentStep).toBe(0);
    expect(s.status).toBe('idle');
  });

  it('seeds defaults and visible field names', () => {
    const store = createFormStore(freeFieldsForm, { client: mockClient() });
    expect(store.getState().visibleFieldNames).toContain('contact_email');
    expect(store.getVisibleFields().map((f) => f.name)).toEqual([
      'full_name',
      'contact_email',
      'message',
      'age',
    ]);
  });
});

describe('createFormStore — visibility recompute + error clearing', () => {
  it('hides descendants of a hidden conditional source', () => {
    const store = createFormStore(nestedConditionalForm, { client: mockClient() });

    expect(store.getState().visibleFieldNames).toEqual(['show_details']);
    expect(store.getVisibleFields().map((item) => item.name)).toEqual(['show_details']);

    store.setFieldValue('show_details', 'yes');
    expect(store.getState().visibleFieldNames).toEqual([
      'details',
      'follow_up',
      'show_details',
    ]);
    expect(store.getVisibleFields().map((item) => item.name)).toEqual([
      'show_details',
      'details',
      'follow_up',
    ]);
  });

  it('recomputes visibility and drops hidden-field errors', () => {
    const store = createFormStore(conditionalForm, { client: mockClient(), validateOn: 'submit' });
    store.setFieldValue('contact_method', 'phone');
    expect(store.getState().visibleFieldNames).toContain('phone_number');

    // Force an error on the now-visible field, then hide it again.
    store.setFieldError('phone_number', ['Phone is required']);
    expect(store.getState().errors.phone_number).toBeTruthy();

    store.setFieldValue('contact_method', 'email');
    expect(store.getState().visibleFieldNames).not.toContain('phone_number');
    // Hidden field's error must be dropped.
    expect(store.getState().errors.phone_number).toBeUndefined();
  });

  it('notifies subscribers on mutation', () => {
    const store = createFormStore(freeFieldsForm, { client: mockClient() });
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.setFieldValue('full_name', 'Ada');
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

describe('createFormStore — analytics start tracking', () => {
  it('tracks the first single-layout interaction only once', () => {
    const trackStart = vi.fn(async () => undefined);
    const store = createFormStore(freeFieldsForm, { client: mockClient({ trackStart }) });

    store.setFieldValue('full_name', 'Ada');
    store.setFieldTouched('full_name');
    store.setValues({ message: 'Hello' });

    expect(trackStart).toHaveBeenCalledTimes(1);
    expect(trackStart).toHaveBeenCalledWith(freeFieldsForm.slug);
  });

  it('tracks client-validated multi-step interaction but defers to server step validation', () => {
    const clientTracked = vi.fn(async () => undefined);
    createFormStore(multiStepForm, {
      client: mockClient({ trackStart: clientTracked }),
    }).setFieldValue('first_name', 'Ada');
    expect(clientTracked).toHaveBeenCalledTimes(1);

    const serverTracked = vi.fn(async () => undefined);
    createFormStore(multiStepForm, {
      client: mockClient({ trackStart: serverTracked }),
      serverStepValidation: true,
    }).setFieldValue('first_name', 'Ada');
    expect(serverTracked).not.toHaveBeenCalled();
  });

  it('never lets analytics transport failures affect form interaction', async () => {
    const trackStart = vi.fn(async () => {
      throw new Error('analytics unavailable');
    });
    const store = createFormStore(freeFieldsForm, { client: mockClient({ trackStart }) });

    expect(() => store.setFieldValue('full_name', 'Ada')).not.toThrow();
    await Promise.resolve();
    expect(trackStart).toHaveBeenCalledTimes(1);
    expect(store.getState().values.full_name).toBe('Ada');
  });

  it('tracks a valid submit even when values were provided at initialization', async () => {
    const trackStart = vi.fn(async () => undefined);
    const submit = vi.fn(async () => ({
      success: true as const,
      message: 'Thanks',
      redirectUrl: null,
    }));
    const store = createFormStore(freeFieldsForm, {
      client: mockClient({ trackStart, submit }),
      initialValues: {
        contact_email: 'ada@example.com',
        message: 'Prefilled and long enough',
      },
    });

    expect((await store.submit()).ok).toBe(true);
    expect(trackStart).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('falls back to start tracking when a server-validated wizard submits directly', async () => {
    const trackStart = vi.fn(async () => undefined);
    const submit = vi.fn(async () => ({
      success: true as const,
      message: 'Thanks',
      redirectUrl: null,
    }));
    const store = createFormStore(multiStepForm, {
      client: mockClient({ trackStart, submit }),
      serverStepValidation: true,
      initialValues: {
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
      },
    });

    expect((await store.submit()).ok).toBe(true);
    expect(trackStart).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a start already recorded by first-step server validation', async () => {
    const trackStart = vi.fn(async () => undefined);
    const validateStep = vi.fn(async () => ({
      valid: true as const,
      step: 'step-1',
      errors: {},
    }));
    const submit = vi.fn(async () => ({
      success: true as const,
      message: 'Thanks',
      redirectUrl: null,
    }));
    const store = createFormStore(multiStepForm, {
      client: mockClient({ trackStart, validateStep, submit }),
      serverStepValidation: true,
      initialValues: {
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
      },
    });

    expect(await store.nextStep()).toBe(true);
    expect((await store.submit()).ok).toBe(true);
    expect(validateStep).toHaveBeenCalledTimes(1);
    expect(trackStart).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('createFormStore — per-field validation', () => {
  it('surfaces required errors for a graph-visible conditional field', () => {
    const store = createFormStore(nestedConditionalForm, {
      client: mockClient(),
      validateOn: 'change',
    });

    store.setFieldValue('show_details', 'yes');
    store.setFieldValue('follow_up', '');

    expect(store.getState().visibleFieldNames).toContain('follow_up');
    expect(store.getState().errors.follow_up).toEqual(['Follow-up is required']);
    expect(store.validateField('follow_up')).toEqual(['Follow-up is required']);
  });

  it('does not enforce a conditional field whose source is graph-hidden', () => {
    const store = createFormStore(nestedConditionalForm, {
      client: mockClient(),
      validateOn: 'blur',
    });

    store.setFieldTouched('follow_up');

    expect(store.getState().visibleFieldNames).not.toContain('follow_up');
    expect(store.getState().errors.follow_up).toBeUndefined();
    expect(store.validateField('follow_up')).toEqual([]);
  });

  it('routes file fields through required and file-rule validation', () => {
    const store = createFormStore(fileForm, { client: mockClient(), validateOn: 'blur' });

    store.setFieldTouched('resume');
    expect(store.getState().errors.resume).toEqual(['Resume is required']);
    expect(store.validateField('resume')).toEqual(['Resume is required']);

    store.setFieldValue('resume', new File(['not a PDF'], 'resume.png', { type: 'image/png' }));

    expect(store.getState().errors.resume).toEqual([
      'File "resume.png" type is not allowed. Accepted types: application/pdf,.docx',
    ]);
    expect(store.validateField('resume')).toEqual([
      'File "resume.png" type is not allowed. Accepted types: application/pdf,.docx',
    ]);
  });
});

describe('createFormStore — submit flow', () => {
  it('blocks the network and sets errors when invalid', async () => {
    const submit = vi.fn();
    const store = createFormStore(freeFieldsForm, { client: mockClient({ submit }) });
    const res = await store.submit();
    expect(res.ok).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    expect(store.getState().status).toBe('error');
    expect(store.getState().errors.contact_email).toBeTruthy();
  });

  it('submits valid data and reaches success', async () => {
    const result = { success: true as const, message: 'Thanks', redirectUrl: null };
    const onSubmitSuccess = vi.fn();
    const store = createFormStore(freeFieldsForm, {
      client: mockClient({ submit: vi.fn(async () => result) }),
      onSubmitSuccess,
    });
    store.setValues({ contact_email: 'a@b.com', message: 'hello world long enough' });
    const res = await store.submit();
    expect(res.ok).toBe(true);
    expect(store.getState().status).toBe('success');
    expect(store.getState().result).toEqual(result);
    expect(onSubmitSuccess).toHaveBeenCalledWith(result, expect.any(Object));
  });

  it('merges server validation errors on a 400', async () => {
    const onSubmitError = vi.fn();
    const serverErr = new FormFlowError('Validation failed', {
      code: 'validation',
      status: 400,
      fieldErrors: { contact_email: ['Server says invalid'] },
    });
    const store = createFormStore(freeFieldsForm, {
      client: mockClient({ submit: vi.fn(async () => { throw serverErr; }) }),
      onSubmitError,
    });
    store.setValues({ contact_email: 'a@b.com', message: 'hello world long enough' });
    const res = await store.submit();
    expect(res.ok).toBe(false);
    expect(store.getState().errors.contact_email).toEqual(['Server says invalid']);
    expect(store.getState().submitError).toBe(serverErr);
    expect(onSubmitError).toHaveBeenCalledWith(serverErr);
  });
});

describe('createFormStore — multi-step navigation', () => {
  it('client step validation blocks advance when invalid', async () => {
    const store = createFormStore(multiStepForm, { client: mockClient() });
    expect(store.getState().stepCount).toBe(2);
    const advanced = await store.nextStep();
    expect(advanced).toBe(false);
    expect(store.getState().currentStep).toBe(0);
    expect(store.getState().errors.first_name).toBeTruthy();
  });

  it('advances when the current step is valid; prevStep goes back', async () => {
    const store = createFormStore(multiStepForm, { client: mockClient() });
    store.setValues({ first_name: 'Ada', last_name: 'Lovelace' });
    expect(await store.nextStep()).toBe(true);
    expect(store.getState().currentStep).toBe(1);
    store.prevStep();
    expect(store.getState().currentStep).toBe(0);
  });

  it('uses the server when serverStepValidation is enabled', async () => {
    const validateStep = vi.fn(async () => ({ valid: true as const, step: 'step-1', errors: {} }));
    const store = createFormStore(multiStepForm, {
      client: mockClient({ validateStep }),
      serverStepValidation: true,
    });
    store.setValues({ first_name: 'Ada', last_name: 'Lovelace' });
    expect(await store.nextStep()).toBe(true);
    expect(validateStep).toHaveBeenCalledWith('wizard-form', expect.any(Object), 'step-1');
    expect(store.getState().currentStep).toBe(1);
  });

  it('server step validation blocks advance and merges server field errors', async () => {
    const validateStep = vi.fn(async () => {
      throw new FormFlowError('Validation failed', {
        code: 'validation',
        status: 400,
        step: 'step-1',
        fieldErrors: { first_name: ['Server rejects this'] },
      });
    });
    const store = createFormStore(multiStepForm, {
      client: mockClient({ validateStep }),
      serverStepValidation: true,
    });
    store.setValues({ first_name: 'Ada', last_name: 'Lovelace' });
    const advanced = await store.nextStep();
    expect(advanced).toBe(false);
    expect(store.getState().currentStep).toBe(0);
    expect(store.getState().errors.first_name).toEqual(['Server rejects this']);
  });

  it('getStepFields resolves step field IDs to fields', () => {
    const store = createFormStore(multiStepForm, { client: mockClient() });
    expect(store.getStepFields(0).map((f) => f.name)).toEqual(['first_name', 'last_name']);
    expect(store.getStepFields(1).map((f) => f.name)).toEqual(['email']);
  });
});

describe('createFormStore — captcha + partial', () => {
  it('setCaptchaToken folds the token into the submit body', async () => {
    const submit = vi.fn(async () => ({ success: true as const, message: 'ok', redirectUrl: null }));
    const store = createFormStore(freeFieldsForm, { client: mockClient({ submit }) });
    store.setValues({ contact_email: 'a@b.com', message: 'hello world long enough' });
    store.setCaptchaToken('recaptcha', 'tok123');
    await store.submit();
    expect(submit).toHaveBeenCalledWith(
      'test-free-fields-form',
      expect.objectContaining({ captchaTokens: { recaptcha: 'tok123' } }),
      expect.any(Object)
    );
  });

  it('loadPartial merges server data into values', async () => {
    const loadPartial = vi.fn(async () => ({ data: { full_name: 'Resumed' }, metadata: {} }));
    const store = createFormStore(freeFieldsForm, { client: mockClient({ loadPartial }) });
    await store.loadPartial('tok');
    expect(store.getState().values.full_name).toBe('Resumed');
    expect(store.getState().resumeToken).toBe('tok');
  });
});
