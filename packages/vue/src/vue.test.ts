/**
 * Vue adapter scenario tests (@testing-library/vue + jsdom).
 *
 * These mirror, one-for-one, the React adapter's `react.test.tsx` scenarios,
 * but exercise the Vue renderless components against the `test-free-fields-form`
 * fixture (`freeFieldsForm`, slug `test-free-fields-form`):
 *   1. render + controlled typing
 *   2. validate-on-blur + ARIA wiring
 *   3. conditional show/hide
 *   4. submit via mocked client → success state
 *   5. no network when validation fails
 *   6. honeypot present, hidden, empty, untabbable
 *   7. composable used outside a provider throws
 *
 * Test components are authored as plain-TS render functions (no SFC), matching
 * how the package itself ships.
 */

import { defineComponent, h } from 'vue';
import { render, fireEvent, waitFor } from '@testing-library/vue';
import { describe, it, expect, vi } from 'vitest';
import {
  createFormStore,
  type FormFlowClient,
  type FormSchema,
  type SubmitSuccess,
} from '@formflowjs/core';
import {
  FormFlow,
  FormFlowField,
  FormFlowHoneypot,
  useFormFlow,
} from './index';
import { freeFieldsForm, field } from './__fixtures__/forms';

/**
 * A conditional variant of the free-fields form: keeps the `test-free-fields-form`
 * shape but adds a `contact_method` selector plus a `phone_number` field gated on
 * `contact_method === 'phone'`, so we can mirror React's show/hide scenario.
 */
const freeFieldsFormWithConditional: FormSchema = {
  ...freeFieldsForm,
  fields: [
    ...freeFieldsForm.fields,
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
};

/** A mocked client whose `submit` resolves to a success body. */
function mockClient(overrides: Partial<FormFlowClient> = {}): FormFlowClient {
  const success: SubmitSuccess = {
    success: true,
    message: 'Thanks!',
    redirectUrl: null,
  };
  return {
    getForm: vi.fn(),
    submit: vi.fn(async () => success),
    validateStep: vi.fn(),
    savePartial: vi.fn(),
    loadPartial: vi.fn(),
    ...overrides,
  } as unknown as FormFlowClient;
}

/**
 * A minimal headless form built from the schema, mirroring React's `DemoForm`.
 * Reads its store from the injected `<FormFlow>` context via `useFormFlow()`.
 */
const DemoForm = defineComponent({
  name: 'DemoForm',
  setup() {
    const f = useFormFlow();
    return () =>
      h('form', { 'data-testid': 'form', ...f.formProps.value }, [
        h(FormFlowHoneypot),
        h(FormFlowField, { name: 'contact_email' }, {
          default: (fld: any) =>
            h('div', [
              h('label', fld.labelProps.value, fld.field.value?.label),
              h('input', { 'aria-label': 'email', ...fld.inputProps.value }),
              fld.invalid.value
                ? h('span', { 'data-testid': 'email-error', ...fld.errorProps.value }, fld.error.value)
                : null,
            ]),
        }),
        h(FormFlowField, { name: 'contact_method' }, {
          default: (fld: any) =>
            h(
              'select',
              {
                'aria-label': 'method',
                ...fld.inputProps.value,
                onChange: (e: Event) =>
                  fld.setValue((e.target as HTMLSelectElement).value),
              },
              [
                h('option', { value: '' }, '--'),
                ...((fld.field.value?.options ?? []).map((o: any) =>
                  h('option', { key: o.value, value: o.value }, o.label)
                )),
              ]
            ),
        }),
        h(FormFlowField, { name: 'phone_number' }, {
          default: (fld: any) =>
            fld.visible.value
              ? h('input', { 'aria-label': 'phone', ...fld.inputProps.value })
              : null,
        }),
        h('button', { type: 'submit' }, 'Submit'),
        f.status.value === 'success'
          ? h('p', { role: 'status' }, f.result.value?.message)
          : null,
      ]);
  },
});

/**
 * Mount `DemoForm` under `<FormFlow>` for a schema + options, returning both the
 * Testing Library utils and the live store (captured from the default slot) so
 * assertions can read `store.getState()` exactly like the React tests do.
 */
function renderWithSchema(
  schema: FormSchema,
  options: Record<string, unknown>
): { utils: ReturnType<typeof render>; getStore: () => ReturnType<typeof createFormStore> } {
  let captured: ReturnType<typeof createFormStore> | undefined;
  const Root = defineComponent({
    setup() {
      return () =>
        h(FormFlow, { form: schema, options }, {
          default: (f: any) => {
            captured = f.store;
            return h(DemoForm);
          },
        });
    },
  });
  const utils = render(Root);
  return {
    utils,
    getStore: () => {
      if (!captured) throw new Error('store not captured');
      return captured;
    },
  };
}

describe('@formflowjs/vue', () => {
  it('renders fields and lets the user type (controlled value)', async () => {
    const { utils, getStore } = renderWithSchema(freeFieldsFormWithConditional, {
      client: mockClient(),
    });
    const email = utils.getByLabelText('email') as HTMLInputElement;
    await fireEvent.update(email, 'a@b.com');
    expect(email.value).toBe('a@b.com');
    expect(getStore().getState().values.contact_email).toBe('a@b.com');
  });

  it('validates on blur and surfaces the required-error with ARIA wiring', async () => {
    const { utils } = renderWithSchema(freeFieldsFormWithConditional, {
      client: mockClient(),
    });
    const email = utils.getByLabelText('email');
    await fireEvent.blur(email);
    const alert = await utils.findByRole('alert');
    expect(alert).toHaveTextContent(/required/i);
    // aria-describedby on the input points at the error id.
    expect(email.getAttribute('aria-describedby')).toBe(alert.id);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('data-invalid');
  });

  it('shows/hides a conditional field as its controller changes', async () => {
    const { utils } = renderWithSchema(freeFieldsFormWithConditional, {
      client: mockClient(),
    });
    // Hidden initially (conditional: contact_method === 'phone').
    expect(utils.queryByLabelText('phone')).toBeNull();
    await fireEvent.update(utils.getByLabelText('method'), 'phone');
    await waitFor(() => expect(utils.queryByLabelText('phone')).not.toBeNull());
    await fireEvent.update(utils.getByLabelText('method'), 'email');
    await waitFor(() => expect(utils.queryByLabelText('phone')).toBeNull());
  });

  it('submits via the mocked client and reaches success state', async () => {
    const client = mockClient();
    const { utils, getStore } = renderWithSchema(freeFieldsFormWithConditional, {
      client,
    });
    await fireEvent.update(utils.getByLabelText('email'), 'user@example.com');
    await fireEvent.submit(utils.getByTestId('form'));
    await waitFor(() =>
      expect(utils.getByRole('status')).toHaveTextContent('Thanks!')
    );
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(getStore().getState().status).toBe('success');
  });

  it('does not hit the network when validation fails', async () => {
    const client = mockClient();
    const { utils, getStore } = renderWithSchema(freeFieldsFormWithConditional, {
      client,
    });
    await fireEvent.submit(utils.getByTestId('form'));
    await waitFor(() => expect(getStore().getState().status).toBe('error'));
    expect(client.submit).not.toHaveBeenCalled();
  });

  it('renders the honeypot as a hidden, empty, untabbable input', () => {
    const { utils } = renderWithSchema(freeFieldsFormWithConditional, {
      client: mockClient(),
    });
    const hp = utils.container.querySelector(
      'input[name="_gotcha"]'
    ) as HTMLInputElement;
    expect(hp).toBeTruthy();
    expect(hp.value).toBe('');
    expect(hp.tabIndex).toBe(-1);
    expect(hp.getAttribute('autocomplete')).toBe('off');
    expect(hp.getAttribute('aria-hidden')).toBe('true');
  });

  it('throws when a composable is used outside the provider', () => {
    // Silence the expected Vue warning noise from the failed setup.
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Bare = defineComponent({
      setup() {
        useFormFlow();
        return () => null;
      },
    });
    expect(() => render(Bare)).toThrow(/FormFlow/);
    spy.mockRestore();
  });
});
