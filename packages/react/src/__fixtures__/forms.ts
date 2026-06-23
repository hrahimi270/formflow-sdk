/**
 * React-adapter test fixtures, shaped exactly like the public content-API
 * (`GET /api/formflow/forms/:slug`) response. Mirrors the core fixtures so the
 * adapter tests exercise the same `FormField`/`FormSchema` shapes consumers get.
 */

import type { FormField, FormSchema } from '@formflowjs/core';

/** Build a FormField with sensible defaults; override what a test needs. */
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

/**
 * Single-layout fixture mirroring the live `test-free-fields-form` slug
 * (text / email-required / textarea / number / select / checkbox / heading),
 * extended with one conditional field so the adapter tests can exercise
 * show/hide. Shapes match `GET /api/formflow/forms/test-free-fields-form`.
 */
export const freeFieldsForm: FormSchema = {
  title: 'Free fields',
  slug: 'test-free-fields-form',
  fields: [
    field({ type: 'heading', name: 'section_heading', label: 'Your details', order: 0 }),
    field({ type: 'text', name: 'full_name', label: 'Full Name', order: 1 }),
    field({
      type: 'email',
      name: 'contact_email',
      label: 'Email',
      required: true,
      order: 2,
    }),
    field({
      type: 'select',
      name: 'contact_method',
      label: 'Preferred contact',
      order: 3,
      options: [
        { label: 'Email', value: 'email' },
        { label: 'Phone', value: 'phone' },
      ],
    }),
    field({
      type: 'checkbox',
      name: 'topics',
      label: 'Topics',
      order: 4,
      options: [
        { label: 'Sales', value: 'sales' },
        { label: 'Support', value: 'support' },
      ],
    }),
    field({
      type: 'textarea',
      name: 'message',
      label: 'Message',
      order: 5,
    }),
    field({
      type: 'number',
      name: 'age',
      label: 'Age',
      order: 6,
      validation: [{ type: 'min', value: 18 }],
    }),
    field({
      type: 'phone',
      name: 'phone_number',
      label: 'Phone number',
      required: true,
      order: 7,
      conditional: { field: 'contact_method', operator: 'equals', value: 'phone' },
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

/** Single-layout form with a required email + conditional phone field. */
export const demoForm: FormSchema = {
  title: 'Contact',
  slug: 'contact-form',
  fields: [
    field({ type: 'text', name: 'full_name', label: 'Full Name', order: 0 }),
    field({
      type: 'email',
      name: 'contact_email',
      label: 'Email',
      required: true,
      order: 1,
    }),
    field({
      type: 'select',
      name: 'contact_method',
      label: 'Preferred contact',
      order: 2,
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
      order: 3,
      conditional: { field: 'contact_method', operator: 'equals', value: 'phone' },
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
