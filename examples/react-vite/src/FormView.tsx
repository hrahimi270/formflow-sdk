import {
  FormFlowField,
  FormFlowHoneypot,
  FormFlowProvider,
  isChoiceField,
  useFormFlow,
  type FormSchema,
} from '@formflowjs/react';

/**
 * Renders one form headlessly. Every element is OUR markup with utility
 * (Tailwind-ish) class names — the SDK ships no CSS and only wires behaviour,
 * accessibility, and `data-*` state. Swap the classes for your own design
 * system and nothing else changes.
 */
export function FormView({ schema, baseUrl }: { schema: FormSchema; baseUrl: string }) {
  return (
    <FormFlowProvider
      form={schema}
      baseUrl={baseUrl}
      options={{
        validateOn: 'blur',
        onSubmitSuccess: (result) => console.log('Submitted:', result),
      }}
    >
      <FormBody />
    </FormFlowProvider>
  );
}

function FormBody() {
  const { schema, fields, getFormProps, isSubmitting, status, result } = useFormFlow();

  if (status === 'success') {
    return (
      <p className="ff-alert ff-alert--success">
        {result?.message ?? 'Thank you for your submission!'}
      </p>
    );
  }

  return (
    <form {...getFormProps()} className="ff-form">
      {fields.map((f) => (
        <FormFlowField
          key={f.name}
          name={f.name}
          render={(field) => {
            // Layout/display-only fields (e.g. `heading`) have no input.
            if (field.field.type === 'heading') {
              return <h2 className="ff-form__heading">{field.field.label}</h2>;
            }

            return (
              <div className="ff-field" data-invalid={field.invalid || undefined}>
                <label {...field.getLabelProps()} className="ff-field__label">
                  {field.field.label}
                  {field.field.required && <span className="ff-field__req"> *</span>}
                </label>

                {renderControl(field)}

                {field.field.description && (
                  <p {...field.getDescriptionProps()} className="ff-field__hint">
                    {field.field.description}
                  </p>
                )}
                {field.invalid && (
                  <p {...field.getErrorProps()} className="ff-field__error">
                    {field.error}
                  </p>
                )}
              </div>
            );
          }}
        />
      ))}

      {/* Renders the schema-declared spam honeypot (hidden), if configured. */}
      <FormFlowHoneypot />

      <button type="submit" className="ff-form__submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting…' : schema.settings.submitButtonText || 'Submit'}
      </button>
    </form>
  );
}

/** Pick the right control per field type. Headless: classes are ours. */
function renderControl(field: Parameters<NonNullable<React.ComponentProps<typeof FormFlowField>['render']>>[0]) {
  const { type } = field.field;

  if (type === 'textarea') {
    return <textarea {...field.getTextareaProps()} className="ff-input ff-input--area" rows={4} />;
  }

  if (type === 'select') {
    return (
      <select {...field.getSelectProps()} className="ff-input">
        <option value="">Select…</option>
        {field.field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (isChoiceField(field.field.type) && field.field.options) {
    return (
      <div {...field.getControlProps()} className="ff-choices">
        {field.field.options.map((opt) => (
          <label key={opt.value} {...field.getOptionProps(opt.value)} className="ff-choice">
            <input {...field.getCheckboxProps(opt.value)} className="ff-choice__box" />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === 'file') {
    return <input {...field.getFileProps()} className="ff-input ff-input--file" />;
  }

  // Plain text-like inputs (text/email/number/url/phone/date/…).
  const inputType =
    type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'url' ? 'url' : 'text';
  return <input {...field.getInputProps({ type: inputType })} className="ff-input" />;
}
