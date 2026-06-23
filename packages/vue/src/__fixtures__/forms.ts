/**
 * Minimal schema fixtures mirroring the public content-API response shape, used
 * by the Vue adapter tests. Kept self-contained so the adapter package has no
 * test-time dependency on core's internal fixtures.
 */

import type { FormField, FormSchema } from '@formflowjs/core';

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

/** Single-layout form with a required email + honeypot, mirroring the live form. */
export const freeFieldsForm: FormSchema = {
  title: 'Free fields',
  slug: 'test-free-fields-form',
  fields: [
    field({ type: 'text', name: 'full_name', label: 'Full Name', order: 0 }),
    field({ type: 'email', name: 'contact_email', label: 'Email', required: true, order: 1 }),
  ],
  settings: {
    submitButtonText: 'Submit',
    showResetButton: false,
    resetButtonText: 'Reset',
    layout: 'single',
    spam: { honeypot: true, honeypotFieldName: '_gotcha' },
  },
};

/** A form whose `phone_number` field is conditional on `contact_method`. */
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
