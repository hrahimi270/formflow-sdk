/**
 * @testing-library/react integration tests for the React adapter, exercised
 * against the `test-free-fields-form` fixture (a single-layout form mirroring
 * the live slug of the same name, extended with one conditional field).
 *
 * Covered behaviors (per the build contract's "Testing requirements"):
 *  - renders the visible, non-layout fields with their prop getters wired;
 *  - typing updates the store's reactive state (controlled value);
 *  - validate-on-blur surfaces the required error for `contact_email`;
 *  - a conditional field shows/hides as its controller changes;
 *  - submit via a mocked client reaches `status: 'success'` and exposes
 *    `result.message`;
 *  - the honeypot input is rendered, present, and empty;
 *  - a choice field (select + checkbox group) yields correct option props.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  createFormStore,
  isChoiceField,
  type FormFlowClient,
  type FormFlowStore,
  type SubmitSuccess,
} from '@formflowjs/core';
import {
  FormFlowProvider,
  FormFlowField,
  FormFlowHoneypot,
  useFormFlow,
} from './index';
import { freeFieldsForm } from './__fixtures__/forms';

/* ------------------------------------------------------------------ *
 * Test harness: a fully headless render of the free-fields fixture.
 * Each field is wired purely through the SDK's prop getters so the
 * tests assert the adapter's behavior, not bespoke markup.
 * ------------------------------------------------------------------ */

function FreeFieldsForm(): ReactNode {
  const f = useFormFlow();
  return (
    <form {...f.getFormProps()}>
      <FormFlowHoneypot />

      <FormFlowField
        name="full_name"
        render={(field) => (
          <div>
            <label {...field.getLabelProps()}>{field.field.label}</label>
            <input aria-label="full_name" {...field.getInputProps()} />
          </div>
        )}
      />

      <FormFlowField
        name="contact_email"
        render={(field) => (
          <div>
            <label {...field.getLabelProps()}>{field.field.label}</label>
            <input aria-label="email" {...field.getInputProps()} />
            {field.invalid && <span {...field.getErrorProps()}>{field.error}</span>}
          </div>
        )}
      />

      {/* Choice field: <select> */}
      <FormFlowField name="contact_method">
        {(field) => (
          <div>
            <label {...field.getLabelProps()}>{field.field.label}</label>
            <select aria-label="method" {...field.getSelectProps()}>
              <option value="">--</option>
              {field.field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </FormFlowField>

      {/* Choice field: checkbox GROUP (multi-value) */}
      <FormFlowField name="topics">
        {(field) => (
          <fieldset {...field.getControlProps()}>
            <legend {...field.getLabelProps()}>{field.field.label}</legend>
            {field.field.options?.map((o) => (
              <label key={o.value} {...field.getOptionProps(o.value)}>
                <input
                  aria-label={`topic-${o.value}`}
                  {...field.getCheckboxProps(o.value)}
                />
                {o.label}
              </label>
            ))}
          </fieldset>
        )}
      </FormFlowField>

      <FormFlowField
        name="message"
        render={(field) => (
          <textarea aria-label="message" {...field.getTextareaProps()} />
        )}
      />

      <FormFlowField
        name="phone_number"
        render={(field) => <input aria-label="phone" {...field.getInputProps()} />}
      />

      <button type="submit">Submit</button>
      {f.status === 'success' && <p role="status">{f.result?.message}</p>}
    </form>
  );
}

/** A mocked client whose `submit` resolves to a success body. */
function mockClient(overrides: Partial<FormFlowClient> = {}): FormFlowClient {
  const success: SubmitSuccess = {
    success: true,
    message: 'Thank you for your submission!',
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

/** Mount the harness against a fresh store and return it for state assertions. */
function setup(client: FormFlowClient = mockClient()): { store: FormFlowStore } {
  const store = createFormStore(freeFieldsForm, { client });
  render(
    <FormFlowProvider store={store}>
      <FreeFieldsForm />
    </FormFlowProvider>
  );
  return { store };
}

describe('@formflowjs/react — test-free-fields-form', () => {
  it('renders the visible, non-layout fields', () => {
    setup();
    // Free-field controls are present...
    expect(screen.getByLabelText('full_name')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByLabelText('method')).toBeInTheDocument();
    expect(screen.getByLabelText('message')).toBeInTheDocument();
    expect(screen.getByLabelText('topic-sales')).toBeInTheDocument();
    // ...the layout-only heading is NOT a submission field (no control rendered).
    expect(screen.queryByLabelText('section_heading')).toBeNull();
    // ...and the conditional phone field is hidden initially.
    expect(screen.queryByLabelText('phone')).toBeNull();
  });

  it('typing updates the reactive store state (controlled value)', () => {
    const { store } = setup();
    const name = screen.getByLabelText('full_name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } });
    expect(name.value).toBe('Ada Lovelace');
    expect(store.getState().values.full_name).toBe('Ada Lovelace');

    const email = screen.getByLabelText('email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'ada@example.com' } });
    expect(email.value).toBe('ada@example.com');
    expect(store.getState().values.contact_email).toBe('ada@example.com');
  });

  it('validate-on-blur shows the required error for contact_email (with ARIA wiring)', async () => {
    const { store } = setup();
    const email = screen.getByLabelText('email');
    // Default validateOn is 'blur'; blurring an empty required field validates it.
    fireEvent.blur(email);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/email is required/i);
    // Store carries the field error keyed by field name.
    expect(store.getState().errors.contact_email).toEqual(['Email is required']);
    // aria-describedby on the input points at the error element's id.
    expect(email.getAttribute('aria-describedby')).toBe(alert.id);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('data-invalid', 'true');
    expect(email).toHaveAttribute('aria-required', 'true');
  });

  it('shows/hides the conditional phone field as its controller changes', () => {
    setup();
    // Hidden initially (conditional: contact_method === 'phone').
    expect(screen.queryByLabelText('phone')).toBeNull();

    fireEvent.change(screen.getByLabelText('method'), { target: { value: 'phone' } });
    expect(screen.getByLabelText('phone')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('method'), { target: { value: 'email' } });
    expect(screen.queryByLabelText('phone')).toBeNull();
  });

  it('submits via the mocked client and reaches the success state with result.message', async () => {
    const client = mockClient();
    const { store } = setup(client);

    // Fill the only required (visible) field.
    fireEvent.change(screen.getByLabelText('email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Thank you for your submission!'
      )
    );
    expect(client.submit).toHaveBeenCalledTimes(1);
    const state = store.getState();
    expect(state.status).toBe('success');
    expect(state.result?.message).toBe('Thank you for your submission!');
  });

  it('does not hit the network when validation fails', () => {
    const client = mockClient();
    const { store } = setup(client);
    // Submit with the required email empty.
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(client.submit).not.toHaveBeenCalled();
    expect(store.getState().status).toBe('error');
    expect(store.getState().errors.contact_email).toEqual(['Email is required']);
  });

  it('renders the honeypot as a hidden, empty, untabbable input', () => {
    const store = createFormStore(freeFieldsForm, { client: mockClient() });
    const { container } = render(
      <FormFlowProvider store={store}>
        <FreeFieldsForm />
      </FormFlowProvider>
    );
    const hp = container.querySelector('input[name="_gotcha"]') as HTMLInputElement;
    expect(hp).toBeTruthy();
    expect(hp.value).toBe('');
    expect(hp.tabIndex).toBe(-1);
    expect(hp.getAttribute('autocomplete')).toBe('off');
    // Wrapped inside an aria-hidden container so AT and users never see it.
    expect(hp.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  describe('choice fields', () => {
    it('exposes correct <select> option props and toggles value', () => {
      const { store } = setup();
      const select = screen.getByLabelText('method') as HTMLSelectElement;
      // The select control is wired (id/name/value) and starts empty.
      expect(select).toHaveAttribute('name', 'contact_method');
      expect(select.value).toBe('');
      // Two real options plus the placeholder.
      expect(within(select).getByRole('option', { name: 'Email' })).toHaveValue('email');
      expect(within(select).getByRole('option', { name: 'Phone' })).toHaveValue('phone');

      fireEvent.change(select, { target: { value: 'phone' } });
      expect(select.value).toBe('phone');
      expect(store.getState().values.contact_method).toBe('phone');
    });

    it('exposes checkbox-group option props and accumulates a string[]', () => {
      const { store } = setup();
      const sales = screen.getByLabelText('topic-sales') as HTMLInputElement;
      const support = screen.getByLabelText('topic-support') as HTMLInputElement;

      // Each checkbox carries type, its own option value, and a unique id.
      expect(sales).toHaveAttribute('type', 'checkbox');
      expect(sales).toHaveAttribute('value', 'sales');
      expect(support).toHaveAttribute('value', 'support');
      expect(sales.id).not.toBe(support.id);
      expect(sales.checked).toBe(false);

      // The wrapping control is an accessible group labelled by the legend.
      const group = screen.getByRole('group', { name: 'Topics' });
      expect(group).toBeInTheDocument();

      // Toggling membership accumulates an array of selected option values.
      fireEvent.click(sales);
      expect(sales.checked).toBe(true);
      expect(store.getState().values.topics).toEqual(['sales']);

      fireEvent.click(support);
      expect(store.getState().values.topics).toEqual(['sales', 'support']);

      fireEvent.click(sales);
      expect(sales.checked).toBe(false);
      expect(store.getState().values.topics).toEqual(['support']);
    });

    it('identifies select/checkbox as choice fields via the re-exported guard', () => {
      const select = freeFieldsForm.fields.find((x) => x.name === 'contact_method')!;
      const topics = freeFieldsForm.fields.find((x) => x.name === 'topics')!;
      const email = freeFieldsForm.fields.find((x) => x.name === 'contact_email')!;
      expect(isChoiceField(select.type)).toBe(true);
      expect(isChoiceField(topics.type)).toBe(true);
      expect(isChoiceField(email.type)).toBe(false);
    });
  });
});
