# @formflowjs/react

Headless React adapter for [FormFlow](https://github.com/formflow/formflow-sdk) — the Strapi forms plugin. Fetch a form schema by slug and render it with **your own markup and styles** (Tailwind, shadcn, MUI, plain CSS). The SDK owns schema typing, client-side validation (parity with the server), conditional visibility, multi-step flow, file uploads, and captcha/honeypot plumbing. It ships **no CSS** and renders no markup of its own.

- **Headless** — every element is yours; the SDK hands you value + errors + ARIA-complete prop getters.
- **SSR / RSC-safe** — `useSyncExternalStore` with a server snapshot, `useId` for ids, no top-level browser globals. A `"use client"` banner is baked into the build for the Next.js App Router.
- **Typed** — full TypeScript types for the public content-API contract.

```bash
npm i @formflowjs/react @formflowjs/core
# peer deps: react >= 18, react-dom >= 18
```

## Core concepts

| Export | Purpose |
| --- | --- |
| `<FormFlowProvider form={schema} baseUrl="…">` | Creates and owns a reactive store (or accepts an external `store`). |
| `useFormFlow()` | `{ schema, state, values, errors, isSubmitting, status, result, fields, stepFields, currentStep, stepCount, isFirstStep, isLastStep, setFieldValue, submit, reset, nextStep, prevStep, goToStep, savePartial, loadPartial, setCaptchaToken, getFormProps() }` |
| `<FormFlowField name="…" render={…}>` | Per-field binding; render prop **or** children-as-function. Exposes `value/errors/error/invalid/touched/dirty/visible`, `setValue/setTouched`, and prop getters. |
| `<FormFlowStep render={…}>` | Multi-step controller: `{ index, total, fields, isFirst, isLast, getNextProps(), getPrevProps(), getSubmitProps() }`. |
| `<FormFlowHoneypot />` | Renders the schema's honeypot input (visually hidden, `aria-hidden`, `tabindex=-1`, autocomplete off). |

### `FormFlowField` prop getters

`getInputProps()`, `getTextareaProps()`, `getSelectProps()`, `getCheckboxProps(optionValue?)`, `getRadioProps(optionValue)`, `getOptionProps(optionValue)`, `getControlProps()` (a `role="group"` wrapper for choice groups), `getLabelProps()`, `getErrorProps()`, `getDescriptionProps()`, `getFileProps()`.

Each getter accepts an `overrides` object merged last, and wires full ARIA (`aria-invalid`, `aria-required`, `aria-describedby`) plus `data-invalid` / `data-touched` / `data-dirty` / `data-required` so you can style purely from state — no class toggling needed.

## Fetch the schema

`@formflowjs/core` ships a tiny content-API client:

```ts
import { createFormFlowClient } from '@formflowjs/core';

const client = createFormFlowClient({ baseUrl: 'https://cms.example.com' });
const schema = await client.getForm('contact-form'); // FormSchema
```

You can pass `client` to the provider via `options={{ client }}`, or just pass `baseUrl` and let the provider create one.

---

## Next.js (App Router)

The form is interactive, so it lives in a Client Component. Fetch the schema in a Server Component and hand it down.

```tsx
// app/contact/page.tsx  (Server Component)
import { createFormFlowClient } from '@formflowjs/core';
import { ContactForm } from './contact-form';

export default async function Page() {
  const client = createFormFlowClient({ baseUrl: process.env.CMS_URL! });
  const schema = await client.getForm('contact-form');
  return <ContactForm schema={schema} />;
}
```

```tsx
// app/contact/contact-form.tsx
'use client';

import {
  FormFlowProvider,
  FormFlowField,
  FormFlowHoneypot,
  useFormFlow,
  type FormSchema,
} from '@formflowjs/react';

function Fields() {
  const f = useFormFlow();
  return (
    <form {...f.getFormProps()}>
      <FormFlowHoneypot />
      {f.fields.map((field) => (
        <FormFlowField
          key={field.name}
          name={field.name}
          render={(api) => (
            <p>
              <label {...api.getLabelProps()}>{api.field.label}</label>
              {field.type === 'textarea' ? (
                <textarea {...api.getTextareaProps()} />
              ) : (
                <input {...api.getInputProps()} />
              )}
              {api.invalid && <span {...api.getErrorProps()}>{api.error}</span>}
            </p>
          )}
        />
      ))}
      <button type="submit" disabled={f.isSubmitting}>
        {f.schema.settings.submitButtonText}
      </button>
      {f.status === 'success' && <p role="status">{f.result?.message}</p>}
    </form>
  );
}

export function ContactForm({ schema }: { schema: FormSchema }) {
  return (
    <FormFlowProvider form={schema} baseUrl={process.env.NEXT_PUBLIC_CMS_URL}>
      <Fields />
    </FormFlowProvider>
  );
}
```

> The published bundle already carries a `"use client"` banner, but keep your own wrapper marked `"use client"` so the JSX that calls the hooks runs on the client.

---

## Astro (`client:load`)

Render the React island with a `client:*` directive and pass the schema as a prop (fetch it in the `.astro` frontmatter).

```astro
---
// src/pages/contact.astro
import { createFormFlowClient } from '@formflowjs/core';
import ContactForm from '../components/ContactForm.tsx';

const client = createFormFlowClient({ baseUrl: import.meta.env.CMS_URL });
const schema = await client.getForm('contact-form');
---
<ContactForm schema={schema} client:load />
```

```tsx
// src/components/ContactForm.tsx
import {
  FormFlowProvider,
  FormFlowField,
  FormFlowHoneypot,
  useFormFlow,
  type FormSchema,
} from '@formflowjs/react';

function Fields() {
  const f = useFormFlow();
  return (
    <form {...f.getFormProps()}>
      <FormFlowHoneypot />
      {f.fields.map((field) => (
        <FormFlowField key={field.name} name={field.name}>
          {(api) => (
            <label>
              {api.field.label}
              <input {...api.getInputProps()} />
              {api.invalid && <span {...api.getErrorProps()}>{api.error}</span>}
            </label>
          )}
        </FormFlowField>
      ))}
      <button type="submit">Submit</button>
    </form>
  );
}

export default function ContactForm({ schema }: { schema: FormSchema }) {
  return (
    <FormFlowProvider form={schema} baseUrl={import.meta.env.PUBLIC_CMS_URL}>
      <Fields />
    </FormFlowProvider>
  );
}
```

> Use `client:load` for a form that must be interactive immediately, or `client:visible` to hydrate when it scrolls into view.

---

## Vite + React

A plain client-side app: fetch on mount, then render.

```tsx
// src/App.tsx
import { useEffect, useState } from 'react';
import {
  createFormFlowClient,
  type FormSchema,
} from '@formflowjs/core';
import {
  FormFlowProvider,
  FormFlowField,
  FormFlowHoneypot,
  useFormFlow,
} from '@formflowjs/react';

const client = createFormFlowClient({ baseUrl: import.meta.env.VITE_CMS_URL });

function Fields() {
  const f = useFormFlow();
  return (
    <form {...f.getFormProps()} className="space-y-4">
      <FormFlowHoneypot />
      {f.fields.map((field) => (
        <FormFlowField
          key={field.name}
          name={field.name}
          render={(api) => (
            <div className="flex flex-col gap-1">
              <label {...api.getLabelProps()} className="font-medium">
                {api.field.label}
              </label>
              <input
                {...api.getInputProps()}
                className="rounded border px-3 py-2 data-[invalid]:border-red-500"
              />
              {api.invalid && (
                <span {...api.getErrorProps()} className="text-sm text-red-600">
                  {api.error}
                </span>
              )}
            </div>
          )}
        />
      ))}
      <button
        type="submit"
        disabled={f.isSubmitting}
        className="rounded bg-black px-4 py-2 text-white"
      >
        {f.schema.settings.submitButtonText}
      </button>
      {f.status === 'success' && <p role="status">{f.result?.message}</p>}
    </form>
  );
}

export default function App() {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  useEffect(() => {
    client.getForm('contact-form').then(setSchema);
  }, []);
  if (!schema) return <p>Loading…</p>;
  return (
    <FormFlowProvider form={schema} baseUrl={import.meta.env.VITE_CMS_URL}>
      <Fields />
    </FormFlowProvider>
  );
}
```

> The `data-[invalid]:` / `data-[touched]:` Tailwind variants pair naturally with the `data-*` attributes the prop getters emit.

---

## Multi-step forms

When the schema's `settings.layout === 'multi-step'`, drive the wizard with `<FormFlowStep>`:

```tsx
import { FormFlowStep, FormFlowField } from '@formflowjs/react';

<FormFlowStep
  render={({ fields, isFirst, isLast, getPrevProps, getNextProps, getSubmitProps }) => (
    <>
      {fields.map((field) => (
        <FormFlowField key={field.name} name={field.name} render={/* … */} />
      ))}
      <div>
        {!isFirst && <button {...getPrevProps()}>Back</button>}
        {isLast ? (
          <button {...getSubmitProps()}>Finish</button>
        ) : (
          <button {...getNextProps()}>Next</button>
        )}
      </div>
    </>
  )}
/>
```

`getNextProps()` validates the current step (client-side, or server-side when `options.serverStepValidation` is set) and advances only when valid.

## Captcha & honeypot

The honeypot is rendered for you by `<FormFlowHoneypot />`. Captcha widgets stay your responsibility — render reCAPTCHA / Turnstile / hCaptcha yourself and feed the token into the store:

```tsx
const f = useFormFlow();
// in the widget's onVerify callback:
f.setCaptchaToken('recaptcha', token);
```

Site keys: the public schema exposes the reCAPTCHA site key + version (`schema.settings.spam.recaptcha`). Turnstile/hCaptcha keys are never in the schema — pass them via `options.captcha`.

## License

MIT
