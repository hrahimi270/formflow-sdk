# @formflowjs/core

Framework-agnostic engine for [FormFlow](https://github.com/hrahimi270/formflow-sdk) — the headless form renderer for the [`@formflowjs/strapi-plugin-formflow`](https://github.com/hrahimi270/strapi-plugin-formflow) Strapi plugin.

This package owns everything except the rendering: schema typing, a content-API
client, client-side validation with **parity to the server**, conditional
visibility, multi-step flow, file uploads, captcha/honeypot plumbing, and a
reactive form store. It imports **no framework** and ships **no CSS**. It is
SSR/RSC-safe — no `window`/`document` access at module load.

Use it directly, or reach for the thin adapters:

- [`@formflowjs/react`](https://www.npmjs.com/package/@formflowjs/react)
- [`@formflowjs/vue`](https://www.npmjs.com/package/@formflowjs/vue)

## Install

```bash
npm install @formflowjs/core
# or: pnpm add @formflowjs/core / yarn add @formflowjs/core
```

## `createFormFlowClient` — talk to the content-API

```ts
import { createFormFlowClient } from '@formflowjs/core';

const client = createFormFlowClient({
  baseUrl: 'https://cms.example.com', // origin; '' for same-origin
  // apiPrefix: '/api/formflow',      // default
  // headers: { 'x-cdn-token': '…' }, // optional extra headers
  // fetch: customFetch,              // injectable for SSR / tests
});

// Fetch a public schema by slug (optionally per-locale).
const schema = await client.getForm('contact', { locale: 'en' });

// Submit (flat body; multipart when a file field holds a File).
const result = await client.submit('contact', {
  schema,
  values: { email: 'ada@example.com', message: 'Hi' },
});
// result: { success: true, message, redirectUrl }
```

Every method rejects with a typed `FormFlowError` on failure — branch on
`error.code` (`'validation' | 'rate_limited' | 'network' | …`) instead of HTTP
statuses. `error.fieldErrors` carries server validation messages keyed by field
name; `error.retryAfter` holds the rate-limit cooldown in seconds.

```ts
import { isFormFlowError } from '@formflowjs/core';

try {
  await client.submit('contact', { schema, values });
} catch (err) {
  if (isFormFlowError(err) && err.code === 'validation') {
    console.log(err.fieldErrors);
  }
}
```

## `createFormStore` — reactive form state

A single immutable-state observer store. Every mutation replaces `state` and
notifies subscribers, so it drives both React's `useSyncExternalStore` and Vue's
`shallowRef`.

```ts
import { createFormStore } from '@formflowjs/core';

const store = createFormStore(schema, {
  baseUrl: 'https://cms.example.com', // or pass `client`
  validateOn: 'blur',                 // 'change' | 'blur' | 'submit'
  onSubmitSuccess: (result) => { /* navigate to result.redirectUrl, etc. */ },
});

store.subscribe(() => render(store.getState()));

store.setFieldValue('email', 'ada@example.com'); // recomputes visibility + clears hidden errors
store.setFieldTouched('email');                  // validate-on-blur

// Multi-step:
await store.nextStep();   // validates the current step (client, or server)
store.prevStep();

// Captcha (collect the token from your widget):
store.setCaptchaToken('recaptcha', token);

// Submit (validates first — never hits the network when invalid):
const { ok, result, error } = await store.submit();
```

State snapshot (`store.getState()`) exposes `values`, `errors`, `touched`,
`dirty`, `visibleFieldNames`, `currentStep`/`stepCount`, `status`,
`isSubmitting`, `submitError`, `result`, `uploadProgress`, and `resumeToken`.

## Analytics and server-only behavior

Headless by design — no markup, no styles, and no widget rendering. A store
records one best-effort `start` event per session: normally when interaction
begins, or through first-step validation when server-side step validation is
enabled (with a submit fallback). Form-schema fetches and successful submissions
record views and completions server-side. Consumers using the client without a
store can call `client.trackStart?.(slug)` once when interaction begins.
Analytics failures never block form use.

Webhooks, email, exports, and autoresponders are server-only concerns.

## License

MIT
