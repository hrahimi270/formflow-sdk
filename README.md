<p align="center">
  <img src="assets/logo.jpg" alt="FormFlow" width="120" height="120" />
</p>

<h1 align="center">FormFlow SDK</h1>

<p align="center">
  Headless, <strong>bring-your-own-markup</strong> frontend SDKs for
  <a href="https://github.com/hrahimi270/strapi-plugin-formflow">FormFlow</a> — the
  <code>@formflowjs/strapi-plugin-formflow</code> Strapi v5 plugin.
</p>

---

Fetch a form schema by slug and render it with **your own elements and styles** — Tailwind,
shadcn, MUI, or plain CSS. The SDKs own schema typing, client-side validation (parity with the
server), conditional visibility, multi-step flow, file uploads, and captcha/honeypot plumbing.
They ship **no CSS** and render no markup of their own.

## Packages

| Package | For | Description |
| --- | --- | --- |
| [`@formflowjs/core`](packages/core) | Framework-agnostic | Types, content-API client, schema-driven form store, validation, conditional logic, multi-step, uploads, captcha plumbing. |
| [`@formflowjs/react`](packages/react) | React · Next.js · Astro | Headless hooks and renderless fields with ARIA-complete prop getters. SSR/RSC-safe. |
| [`@formflowjs/vue`](packages/vue) | Vue 3 · Nuxt | Renderless components and composables exposing reactive state and prop bags. |

## Install

```bash
# React
npm i @formflowjs/react

# Vue
npm i @formflowjs/vue
```

`@formflowjs/core` is re-exported from both adapters, so you import everything from the one you use.

## Quick look (React)

```tsx
import { FormFlowProvider, FormFlowField, useFormFlow } from '@formflowjs/react';

function Fields() {
  const f = useFormFlow();
  return (
    <form {...f.getFormProps()}>
      {f.fields.map((field) => (
        <FormFlowField key={field.name} name={field.name}
          render={(api) => (
            <label {...api.getLabelProps()}>
              {api.field.label}
              <input {...api.getInputProps()} />
              {api.invalid && <span>{api.error}</span>}
            </label>
          )} />
      ))}
      <button disabled={f.isSubmitting}>{f.schema.settings.submitButtonText}</button>
    </form>
  );
}
```

Per-framework guides (Next.js App Router, Astro islands, Vite, Nuxt) live in each package's README.

## Links

- **Strapi plugin:** https://github.com/hrahimi270/strapi-plugin-formflow
- **Examples:** [`examples/`](examples) (React + Vue, Vite)

## License

MIT
