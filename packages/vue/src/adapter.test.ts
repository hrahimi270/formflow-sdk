/**
 * Vue adapter integration tests (@testing-library/vue + happy-dom).
 *
 * Exercises the renderless components end-to-end against a mocked client:
 * render → type → validate-on-blur → conditional show/hide → submit → success,
 * plus the honeypot being present-and-empty. Test components are authored as
 * plain-TS render functions (no SFC), matching how the package itself ships.
 */

import { defineComponent, h } from 'vue';
import { render, fireEvent, waitFor } from '@testing-library/vue';
import { describe, it, expect, vi } from 'vitest';
import type { FormFlowClient, SubmitSuccess } from '@formflowjs/core';
import { FormFlow, FormFlowField, FormFlowHoneypot } from './index';
import { freeFieldsForm, conditionalForm } from './__fixtures__/forms';

/** A stub client: only the methods the store touches need real behavior. */
function stubClient(overrides: Partial<FormFlowClient> = {}): FormFlowClient {
  return {
    getForm: vi.fn(),
    submit: vi.fn(),
    validateStep: vi.fn(),
    savePartial: vi.fn(),
    loadPartial: vi.fn(),
    ...overrides,
  } as FormFlowClient;
}

/** Renderless email-field harness used by several tests. */
const EmailField = defineComponent({
  name: 'EmailField',
  setup() {
    return () =>
      h(FormFlowField, { name: 'contact_email' }, {
        default: (field: any) =>
          h('div', { 'data-testid': 'email-wrap' }, [
            h('label', field.labelProps.value, 'Email'),
            h('input', { 'data-testid': 'email', ...field.inputProps.value }),
            field.invalid.value
              ? h('span', { 'data-testid': 'email-error', ...field.errorProps.value }, field.error.value)
              : null,
          ]),
      });
  },
});

describe('@formflowjs/vue', () => {
  it('renders fields, validates on blur, and submits via the store', async () => {
    const submit = vi.fn(
      async (): Promise<SubmitSuccess> => ({
        success: true,
        message: 'Thanks!',
        redirectUrl: null,
      })
    );
    const client = stubClient({ submit });

    const Root = defineComponent({
      setup() {
        return () =>
          h(
            FormFlow,
            { form: freeFieldsForm, options: { client } },
            {
              default: (f: any) =>
                h('form', { 'data-testid': 'form', ...f.formProps.value }, [
                  h(EmailField),
                  h(FormFlowHoneypot),
                  h('button', { type: 'submit' }, 'Submit'),
                  h('output', { 'data-testid': 'status' }, f.status.value),
                ]),
            }
          );
      },
    });

    const { getByTestId, container } = render(Root);

    // Honeypot present, hidden, and empty.
    const honeypot = container.querySelector('input[name="_gotcha"]') as HTMLInputElement;
    expect(honeypot).toBeTruthy();
    expect(honeypot.getAttribute('aria-hidden')).toBe('true');
    expect(honeypot.getAttribute('tabindex')).toBe('-1');
    expect(honeypot.value).toBe('');

    // Validate-on-blur: blurring an empty required email surfaces an error.
    const email = getByTestId('email') as HTMLInputElement;
    await fireEvent.blur(email);
    await waitFor(() => expect(getByTestId('email-error')).toBeTruthy());

    // Type a valid email → error clears (revalidate-on-change after first error).
    await fireEvent.update(email, 'user@example.com');
    await waitFor(() =>
      expect(container.querySelector('[data-testid="email-error"]')).toBeNull()
    );

    // Submit → client.submit called, status becomes success.
    await fireEvent.submit(getByTestId('form'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByTestId('status').textContent).toBe('success'));

    // The submitted payload carried the typed value + empty honeypot.
    const [, payload] = submit.mock.calls[0] as [string, any];
    expect(payload.values.contact_email).toBe('user@example.com');
    expect(payload.honeypotValue).toBe('');
  });

  it('does not call the network when validation fails', async () => {
    const submit = vi.fn();
    const client = stubClient({ submit });

    const Root = defineComponent({
      setup() {
        return () =>
          h(FormFlow, { form: freeFieldsForm, options: { client } }, {
            default: (f: any) =>
              h('form', { 'data-testid': 'form', ...f.formProps.value }, [
                h(EmailField),
                h('output', { 'data-testid': 'status' }, f.status.value),
              ]),
          });
      },
    });

    const { getByTestId } = render(Root);
    await fireEvent.submit(getByTestId('form'));
    await waitFor(() => expect(getByTestId('status').textContent).toBe('error'));
    expect(submit).not.toHaveBeenCalled();
    expect(getByTestId('email-error')).toBeTruthy();
  });

  it('shows and hides a conditional field as its dependency changes', async () => {
    const client = stubClient();

    const Root = defineComponent({
      setup() {
        return () =>
          h(FormFlow, { form: conditionalForm, options: { client } }, {
            default: (f: any) =>
              h('div', [
                h(FormFlowField, { name: 'contact_method' }, {
                  default: (field: any) =>
                    h(
                      'select',
                      {
                        'data-testid': 'method',
                        ...field.inputProps.value,
                        onChange: (e: Event) =>
                          field.setValue((e.target as HTMLSelectElement).value),
                      },
                      [
                        h('option', { value: 'email' }, 'Email'),
                        h('option', { value: 'phone' }, 'Phone'),
                      ]
                    ),
                }),
                // The phone field renders only when visible.
                h(FormFlowField, { name: 'phone_number' }, {
                  default: (field: any) =>
                    field.visible.value
                      ? h('input', { 'data-testid': 'phone', ...field.inputProps.value })
                      : null,
                }),
              ]),
          });
      },
    });

    const { getByTestId, queryByTestId } = render(Root);

    // Hidden by default (contact_method defaults to '').
    expect(queryByTestId('phone')).toBeNull();

    // Selecting 'phone' reveals it; switching back hides it again.
    await fireEvent.update(getByTestId('method'), 'phone');
    await waitFor(() => expect(queryByTestId('phone')).not.toBeNull());

    await fireEvent.update(getByTestId('method'), 'email');
    await waitFor(() => expect(queryByTestId('phone')).toBeNull());
  });
});
