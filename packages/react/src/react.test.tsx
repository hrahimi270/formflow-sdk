import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  createFormStore,
  type FormFlowClient,
  type SubmitSuccess,
} from '@formflowjs/core';
import {
  FormFlowProvider,
  FormFlowField,
  FormFlowHoneypot,
  useFormFlow,
} from './index';
import { demoForm } from './__fixtures__/forms';

/** A minimal headless form built from the demo schema for assertions. */
function DemoForm(): ReactNode {
  const f = useFormFlow();
  return (
    <form {...f.getFormProps()}>
      <FormFlowHoneypot />
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
      <FormFlowField name="contact_method">
        {(field) => (
          <select aria-label="method" {...field.getSelectProps()}>
            <option value="">--</option>
            {field.field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </FormFlowField>
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

describe('@formflowjs/react', () => {
  it('renders fields and lets the user type (controlled value)', () => {
    const store = createFormStore(demoForm, { client: mockClient() });
    render(
      <FormFlowProvider store={store}>
        <DemoForm />
      </FormFlowProvider>
    );
    const email = screen.getByLabelText('email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'a@b.com' } });
    expect(email.value).toBe('a@b.com');
    expect(store.getState().values.contact_email).toBe('a@b.com');
  });

  it('validates on blur and surfaces the required-error with ARIA wiring', async () => {
    const store = createFormStore(demoForm, { client: mockClient() });
    render(
      <FormFlowProvider store={store}>
        <DemoForm />
      </FormFlowProvider>
    );
    const email = screen.getByLabelText('email');
    fireEvent.blur(email);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/required/i);
    // aria-describedby on the input points at the error id.
    expect(email.getAttribute('aria-describedby')).toBe(alert.id);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('data-invalid', 'true');
  });

  it('shows/hides a conditional field as its controller changes', () => {
    const store = createFormStore(demoForm, { client: mockClient() });
    render(
      <FormFlowProvider store={store}>
        <DemoForm />
      </FormFlowProvider>
    );
    // Hidden initially (conditional: contact_method === 'phone').
    expect(screen.queryByLabelText('phone')).toBeNull();
    fireEvent.change(screen.getByLabelText('method'), { target: { value: 'phone' } });
    expect(screen.getByLabelText('phone')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('method'), { target: { value: 'email' } });
    expect(screen.queryByLabelText('phone')).toBeNull();
  });

  it('submits via the mocked client and reaches success state', async () => {
    const client = mockClient();
    const store = createFormStore(demoForm, { client });
    render(
      <FormFlowProvider store={store}>
        <DemoForm />
      </FormFlowProvider>
    );
    fireEvent.change(screen.getByLabelText('email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Thanks!'));
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('success');
  });

  it('does not hit the network when validation fails', () => {
    const client = mockClient();
    const store = createFormStore(demoForm, { client });
    render(
      <FormFlowProvider store={store}>
        <DemoForm />
      </FormFlowProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(client.submit).not.toHaveBeenCalled();
    expect(store.getState().status).toBe('error');
  });

  it('renders the honeypot as a hidden, empty, untabbable input', () => {
    const store = createFormStore(demoForm, { client: mockClient() });
    const { container } = render(
      <FormFlowProvider store={store}>
        <DemoForm />
      </FormFlowProvider>
    );
    const hp = container.querySelector('input[name="_gotcha"]') as HTMLInputElement;
    expect(hp).toBeTruthy();
    expect(hp.value).toBe('');
    expect(hp.tabIndex).toBe(-1);
    expect(hp.getAttribute('autocomplete')).toBe('off');
    expect(hp.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('throws when a hook is used outside the provider', () => {
    // Silence the expected React error boundary noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare(): ReactNode {
      useFormFlow();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/FormFlowProvider/);
    spy.mockRestore();
  });
});
