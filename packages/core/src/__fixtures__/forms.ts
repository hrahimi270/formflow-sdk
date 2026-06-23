/**
 * Test fixtures: schemas shaped exactly like the public content-API response
 * (`GET /api/formflow/forms/:slug`), used across the core unit tests. Kept in
 * `src/__fixtures__` so the parity tests run against the same `FormField`/
 * `FormSchema` shapes real consumers receive.
 */

import type { FormField, FormSchema } from '../types';

/** Build a FormField with sensible defaults; override what each test needs. */
export function field(
  partial: Partial<FormField> & Pick<FormField, 'type' | 'name' | 'label'>
): FormField {
  return {
    id: partial.id ?? `id_${partial.name}`,
    required: partial.required ?? false,
    order: partial.order ?? 0,
    validation: partial.validation ?? [],
    ...partial,
  };
}

/** A single-layout free-fields form mirroring `test-free-fields-form`. */
export const freeFieldsForm: FormSchema = {
  title: 'Free fields',
  slug: 'test-free-fields-form',
  fields: [
    field({ type: 'text', name: 'full_name', label: 'Full Name', order: 0 }),
    field({ type: 'email', name: 'contact_email', label: 'Email', required: true, order: 1 }),
    field({
      type: 'textarea',
      name: 'message',
      label: 'Message',
      required: true,
      order: 2,
      validation: [{ type: 'minLength', value: 10, message: '' }],
    }),
    field({
      type: 'number',
      name: 'age',
      label: 'Age',
      order: 3,
      validation: [
        { type: 'min', value: 18 },
        { type: 'max', value: 120 },
      ],
    }),
  ],
  settings: {
    submitButtonText: 'Submit',
    showResetButton: false,
    resetButtonText: 'Reset',
    layout: 'single',
    spam: { honeypot: true, honeypotFieldName: '_gotcha' },
  },
};

/** A form with a conditional field that depends on `contact_method`. */
export const conditionalForm: FormSchema = {
  title: 'Conditional',
  slug: 'conditional-form',
  fields: [
    field({
      type: 'select',
      name: 'contact_method',
      label: 'Preferred contact',
      order: 0,
      options: [
        { label: 'Email', value: 'email' },
        { label: 'Phone', value: 'phone' },
      ],
    }),
    field({
      type: 'phone',
      name: 'phone_number',
      label: 'Phone number',
      required: true,
      order: 1,
      conditional: { field: 'contact_method', operator: 'equals', value: 'phone' },
    }),
  ],
  settings: {
    submitButtonText: 'Submit',
    showResetButton: false,
    resetButtonText: 'Reset',
    layout: 'single',
    spam: { honeypot: false },
  },
};

/** A two-step wizard form (steps reference field IDs). */
export const multiStepForm: FormSchema = {
  title: 'Wizard',
  slug: 'wizard-form',
  fields: [
    field({ type: 'text', name: 'first_name', label: 'First name', id: 'f_first', required: true, order: 0 }),
    field({ type: 'text', name: 'last_name', label: 'Last name', id: 'f_last', required: true, order: 1 }),
    field({ type: 'email', name: 'email', label: 'Email', id: 'f_email', required: true, order: 2 }),
  ],
  settings: {
    submitButtonText: 'Finish',
    showResetButton: false,
    resetButtonText: 'Reset',
    layout: 'multi-step',
    steps: [
      { id: 'step-1', title: 'Name', fields: ['f_first', 'f_last'] },
      { id: 'step-2', title: 'Contact', fields: ['f_email'] },
    ],
    spam: { honeypot: false },
  },
};

/** A form with a single required file field. */
export const fileForm: FormSchema = {
  title: 'Upload',
  slug: 'file-form',
  fields: [
    field({
      type: 'file',
      name: 'resume',
      label: 'Resume',
      required: true,
      order: 0,
      validation: [
        { type: 'maxSize', value: 1 },
        { type: 'allowedTypes', value: 'application/pdf,.docx' },
      ],
    }),
    field({ type: 'text', name: 'name', label: 'Name', order: 1 }),
  ],
  settings: {
    submitButtonText: 'Submit',
    showResetButton: false,
    resetButtonText: 'Reset',
    layout: 'single',
    spam: { honeypot: true, honeypotFieldName: '_gotcha' },
  },
};
