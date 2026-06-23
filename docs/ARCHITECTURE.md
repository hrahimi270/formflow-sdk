# FormFlow SDK — Architecture & Build Contract

This is the single source of truth for building the FormFlow client SDKs. Every
build agent MUST follow the public API shapes and behavior pinned here so the
three packages stay consistent. Deep contract detail (exact server behavior)
lives in the audit findings — see "Reference material" at the bottom.

## Goal

Headless, framework-agnostic renderers for forms defined in the FormFlow Strapi
plugin. Users fetch a form schema by slug and render it with THEIR OWN markup and
styles (Tailwind / shadcn / MUI / plain CSS). The SDK owns: schema typing,
client-side validation (parity with the server), conditional visibility,
multi-step flow, file uploads, captcha/honeypot plumbing, the content-API client,
and reactive form state. The SDK ships NO CSS.

## Packages

```
@formflowjs/core   framework-agnostic engine (NO react/vue import; SSR/RSC-safe)
@formflowjs/react  thin React adapter (peer react>=18; "use client")
@formflowjs/vue    thin Vue 3 adapter (peer vue>=3.4; SSR/Nuxt-safe)
```

react & vue depend on core via `workspace:*`. core has ZERO runtime deps.

## Tooling (decided)

- pnpm workspaces + Turborepo + Changesets.
- Bundler: **tsup** (ESM + CJS + d.ts). React build injects a global
  `"use client"` banner via `esbuildOptions(o){ o.banner = { js: '"use client"' } }`.
- Tests: **Vitest** per package (core: node; react: jsdom + @testing-library/react;
  vue: happy-dom + @testing-library/vue). Type-check with `tsc --noEmit`.
- Node `>=18.18`. Keep code SSR-safe: never touch `window`/`document` at module
  top level; only inside event handlers / effects / `onMounted` / lazy getters.

---

## @formflowjs/core — public API

Already implemented (DO NOT rewrite, import from these):
- `types.ts` — all schema/value/result types.
- `constants.ts` — control field names, captcha field names, field-type groups, `DEFAULT_API_PREFIX = '/api/formflow'`, helpers (`isLayoutField`, `isChoiceField`, …).
- `conditional.ts` — `isEmptyValue`, `evaluateConditional`, `isFieldVisible` (verbatim port).
- `file-rules.ts` — `getFileInfo`, `isFile`, `isFileTypeAllowed`, `validateFile`.

To implement:

### `validation.ts` — client-side validation (PARITY-CRITICAL)
Port VERBATIM from `/home/bardiya/Projects/strapi-forms/server/src/services/validation.ts`
(read that file). Export pure functions (not a Strapi service object):
- `coerceBoolean(value): boolean` — for required `consent` (true/'true'/1/'yes'/'on' → true).
- `isEmpty(value)` — re-export `isEmptyValue` from conditional.ts.
- `runValidationRule(rule, value, field, data): string | null` — same switch (minLength, maxLength, min, max, pattern, minSelected, maxSelected, minDate, maxDate, minTime, maxTime, maxSize, allowedTypes, matches, custom). Use a no-op for invalid regex (no throw); drop the `strapi.log.warn`.
- `validateFieldType(type, value): string | null` — same per-type switch (email, url, number, phone, date, time, datetime, boolean, signature, rating, address, payment; others null).
- `validateFieldOptions(field, value): string | null` — choice option whitelist.
- `validateFields(fields, data): ValidationResult` — port of `validate()`: skip layout, skip `file`, skip hidden (`isFieldVisible`), required (+consent special), skip-empty-optional, custom rules, type check, option check. Use `field.requiredMessage ?? \`${field.label} is required\``.
- `validateFiles(fields, data): ValidationResult` — for `file` fields, read `data[name]` as `File | File[]`; skip hidden; required-when-empty; per-file `validateFile`.
- `validateSubset(fields, fieldKeys: string[] | Set<string>, data)` — filter by `id` OR `name`, then `validateFields`.
- `validateForm(fields, data): ValidationResult` — merge `validateFields` + `validateFiles`.

Add a Vitest parity test that imports the live fixtures and asserts results match the documented messages.

### `errors.ts` — typed errors
```ts
export type FormFlowErrorCode =
  | 'validation' | 'bad_request' | 'captcha' | 'payment_required'
  | 'forbidden' | 'not_found' | 'payload_too_large' | 'rate_limited'
  | 'server' | 'network' | 'aborted' | 'unknown';

export class FormFlowError extends Error {
  code: FormFlowErrorCode;
  status: number;            // HTTP status; 0 for network/aborted
  fieldErrors?: FormErrors;  // present for code 'validation'
  step?: string;             // present for step-validation errors
  retryAfter?: number;       // seconds, present for 'rate_limited'
  body?: unknown;            // raw parsed response body
  constructor(message, init: { code; status; ... });
}
export function isFormFlowError(e): e is FormFlowError;
```
`parseApiError(status, body, headers?): FormFlowError` maps BOTH envelope shapes
(`{ error }` and `{ data:null, error }`):
- 400 + `error.name==='ValidationError'` → `validation` (fieldErrors = `error.details.errors`, step = `error.details.step`).
- 400 + BadRequest whose message matches /recaptcha|captcha|turnstile|hcaptcha/i → `captcha`, else `bad_request`.
- 402 → `payment_required`; 403 → `forbidden`; 404 → `not_found`; 413 → `payload_too_large`;
  429 → `rate_limited` (retryAfter = `Number(headers['retry-after'])`); 500 → `server`; else `unknown`.

### `serialize.ts` — build the submit payload
- `buildSubmitData(schema, values, { honeypotValue?, captchaTokens?, stepIndicator?, resumeToken? }): { isMultipart: boolean; json?: Record<string,unknown>; formData?: FormData }`.
- Include values ONLY for currently-visible, non-layout fields (use `isFieldVisible`). For each visible `file` field whose value is `File | File[]`, the payload is multipart.
- Flat keys (NO `{data:...}` wrapper). Append the honeypot field (`schema.settings.spam.honeypotFieldName || '_gotcha'`) when `spam.honeypot` is true (default empty string, or the provided `honeypotValue`). Append captcha tokens under `CAPTCHA_TOKEN_FIELD[provider]` for each token present. Append `_step`/`_resumeToken` when provided.
- Multipart: append non-file values as strings (arrays → repeated keys; booleans/numbers → String()); append File(s) under the field `name`; append honeypot/captcha/control fields as text parts.

### `client.ts` — content-API client
```ts
export interface FormFlowClientOptions {
  baseUrl: string;                 // origin, e.g. 'https://cms.example.com' or '' for same-origin
  apiPrefix?: string;              // default '/api/formflow'
  fetch?: typeof fetch;            // injectable for SSR/testing
  headers?: Record<string,string>; // extra headers (e.g. CDN tokens)
}
export interface FormFlowClient {
  getForm(slug: string, opts?: { locale?: string; signal?: AbortSignal }): Promise<FormSchema>;
  submit(slug, payload: SubmitPayload, opts?: { signal?; onUploadProgress?(pct:number):void }): Promise<SubmitSuccess>;
  validateStep(slug, values, stepIndicator, opts?): Promise<StepValidationSuccess>; // POST submit with _step
  savePartial(slug, values, opts?: { resumeToken?: string; ... }): Promise<PartialSaveResult>;
  loadPartial(slug, resumeToken, opts?): Promise<PartialResumeResult>;
}
export function createFormFlowClient(opts): FormFlowClient;
```
Behavior: build URL `${baseUrl}${apiPrefix}/forms/${slug}` (+`?locale=` lowercased on getForm). Unwrap `{ data }` on success. On non-2xx, parse body and throw `parseApiError`. Use `XMLHttpRequest` for multipart submit WHEN `onUploadProgress` is provided and XHR exists; otherwise `fetch`. Network failure → `FormFlowError({code:'network',status:0})`; AbortError → `{code:'aborted'}`.

### `store.ts` — reactive form store (what adapters bind to)
Immutable-state observer store (so React `useSyncExternalStore` and Vue
`shallowRef` both work). Every mutation replaces `state` with a new object and
notifies subscribers.

```ts
export interface FormFlowState {
  values: FormValues;
  errors: FormErrors;                 // keyed by field name
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
  visibleFieldNames: string[];        // recomputed on every value change
  currentStep: number;                // 0 for single-layout
  stepCount: number;                  // 1 for single-layout
  status: 'idle' | 'submitting' | 'success' | 'error';
  isSubmitting: boolean;
  isValidating: boolean;
  submitCount: number;
  submitError: FormFlowError | null;
  result: SubmitSuccess | null;
  uploadProgress: number | null;      // 0..100 during multipart upload
  resumeToken: string | null;
}

export interface FormStoreOptions {
  client?: FormFlowClient;            // OR baseUrl below
  baseUrl?: string;
  apiPrefix?: string;
  locale?: string;
  initialValues?: FormValues;
  validateOn?: 'change' | 'blur' | 'submit'; // default 'blur'
  revalidateOn?: 'change' | 'blur';          // default 'change' (after first error)
  serverStepValidation?: boolean;     // default false -> client-only step checks
  captcha?: CaptchaConfig;
  onSubmitSuccess?(result: SubmitSuccess, values: FormValues): void;
  onSubmitError?(error: FormFlowError): void;
}

export interface FormFlowStore {
  readonly schema: FormSchema;
  getState(): FormFlowState;
  subscribe(listener: () => void): () => void;
  // schema helpers
  getField(name: string): FormField | undefined;
  getVisibleFields(): FormField[];                 // visible, sorted by order
  getStepFields(stepIndex?: number): FormField[];  // step's visible fields (default current)
  // value mutations (recompute visibility; clear errors of newly-hidden fields)
  setFieldValue(name: string, value: unknown): void;
  setValues(values: FormValues): void;
  setFieldTouched(name: string, touched?: boolean): void;
  setFieldError(name: string, errors: string[] | null): void;
  reset(values?: FormValues): void;
  // captcha + honeypot
  setCaptchaToken(provider: CaptchaProvider, token: string): void;
  // validation (client; mirrors server)
  validateField(name: string): string[];
  validateForm(): ValidationResult;
  validateCurrentStep(): ValidationResult;
  // navigation
  goToStep(index: number): Promise<boolean>;
  nextStep(): Promise<boolean>;       // validates current step (client, or server if enabled); advances if valid
  prevStep(): void;
  // submission
  submit(): Promise<{ ok: boolean; result?: SubmitSuccess; error?: FormFlowError }>;
  savePartial(): Promise<PartialSaveResult>;
  loadPartial(resumeToken: string): Promise<PartialResumeResult>;
}
export function createFormStore(schema: FormSchema, options?: FormStoreOptions): FormFlowStore;
```
Rules:
- `visibleFieldNames` recomputed after every value change via `isFieldVisible`. When a field becomes hidden, drop its error.
- `submit()` runs `validateForm()` first; if invalid → set errors, status `error`, return `{ok:false}` (NO network). If valid → status `submitting`, call `client.submit` with built payload + captcha tokens + honeypot; on success → status `success`, `result`, call `onSubmitSuccess`; on `FormFlowError` with `code:'validation'` merge `fieldErrors` into `state.errors`; set `submitError`, status `error`, call `onSubmitError`.
- `nextStep()`: if `serverStepValidation`, call `client.validateStep`; else `validateCurrentStep()`. Advance only when valid.
- Do NOT auto-redirect in core (SSR-safe). Expose `result.redirectUrl`; adapters may navigate.

### `index.ts`
Barrel-export everything public (types, constants helpers, conditional, file-rules, validation, errors, serialize entrypoints used by adapters, client, store).

---

## @formflowjs/react — public API

`"use client"` at top of each component/hook file. SSR-safe (`useSyncExternalStore` with a server snapshot; `useId` for ids).

```tsx
// Provider creates/owns a FormFlowStore from a schema (or accepts an external store).
<FormFlowProvider form={schema} baseUrl="..." options={...}>{children}</FormFlowProvider>

const f = useFormFlow();
// f: { schema, state, values, errors, isSubmitting, status, result,
//      fields (visible), stepFields, currentStep, stepCount, isFirstStep, isLastStep,
//      setFieldValue, submit, reset, nextStep, prevStep, goToStep, savePartial, loadPartial,
//      setCaptchaToken, getFormProps() }
// getFormProps(): { onSubmit, noValidate } — wires <form> to store.submit() + preventDefault.

<FormFlowField name="email" render={(field) => (...)} />
// field: { field: FormField, value, errors, error (first), invalid, touched, dirty, visible,
//   setValue, setTouched,
//   getInputProps(overrides?),  // { id,name,value,onChange,onBlur,required,'aria-invalid','aria-describedby','data-invalid','data-dirty','data-touched' }
//   getTextareaProps(), getSelectProps(),
//   getCheckboxProps(optionValue), getRadioProps(optionValue), getOptionProps(optionValue),
//   getControlProps(), // role=group + aria-labelledby for choice groups
//   getLabelProps(), getErrorProps(), getDescriptionProps(),
//   getFileProps() }  // type=file wiring, multiple where relevant
// Children-as-function also supported: <FormFlowField name="x">{(field)=>...}</FormFlowField>

<FormFlowStep render={(step) => (...)} />  // step: { index, total, fields, isFirst, isLast, getNextProps(), getPrevProps(), getSubmitProps() }
<FormFlowHoneypot />   // renders the hidden honeypot input from schema (visually hidden, aria-hidden, tabindex -1, autocomplete off)
```
Also export a `<ReCaptcha />` helper hook/component is OPTIONAL — at minimum expose `setCaptchaToken`. Keep widgets the user's responsibility but document the integration.

No bundled CSS. All visual state via `data-*` attributes + boolean flags.

## @formflowjs/vue — public API

Author components as renderless `defineComponent` in `.ts` (pure TS; no SFC
toolchain). SSR/Nuxt-safe.

```ts
// Component provides context (provide/inject) and exposes a default scoped slot.
<FormFlow :form="schema" :options="..." v-slot="form"> ... </FormFlow>
// form slot props mirror useFormFlow() below.

const form = useFormFlow();              // composable; reads injected context OR can create one with ({ form, ...options })
// refs: state, values, errors, isSubmitting, status, result, fields, stepFields,
//       currentStep, stepCount, isFirstStep, isLastStep
// methods: setFieldValue, submit, reset, nextStep, prevStep, goToStep, setCaptchaToken, savePartial, loadPartial
// formProps (computed) for v-bind on <form @submit.prevent>

<FormFlowField name="email" v-slot="field"> ... </FormFlowField>
const field = useFormFlowField('email');
// field.value (ref), field.errors (ref), field.invalid (ref), field.inputProps (computed for v-bind),
// field.labelProps, field.errorProps, field.descriptionProps, field.setValue, field.setTouched,
// field.getOptionProps(value), field.controlProps
<FormFlowStep v-slot="step"> ... </FormFlowStep>
<FormFlowHoneypot />
```
Vue prop getters returned as reactive objects for `v-bind` (plus `getInputProps(overrides)` for fine control). `data-*` state attrs included.

## Accessibility (wired by prop getters in BOTH adapters)
- input: `id`, `name`, `aria-invalid`, `aria-required`, `aria-describedby` (error id + description id).
- label: matching `htmlFor`/`for`. error: `id` + `role="alert"` + `aria-live="polite"`. description: `id`.
- choice groups: `role="group"` + `aria-labelledby`.

## Testing requirements
- core: unit tests for conditional (all 5 operators incl. coercion edge cases), validation parity (per-type + per-rule messages), serialize (flat body, honeypot, captcha fields, multipart with File), client (mocked `fetch`: success unwrap, all error codes incl. 429 Retry-After), store (visibility recompute, hidden-field error clearing, step nav, submit flow merging server validation errors), errors (`parseApiError` both envelopes).
- react: `@testing-library/react` — render a fixture schema, type, validate-on-blur, conditional show/hide, submit with mocked client → success state; honeypot present + empty.
- vue: `@testing-library/vue` — same scenarios.
- live integration (core): a script/test (gated by env, default skip) hitting `http://localhost:1337` against slug `test-free-fields-form`: fetch schema, assert shape; submit valid → `{success:true}`; submit missing required `contact_email` → `FormFlowError code 'validation'` with `fieldErrors.contact_email`.

## Examples (minimal, runnable references)
- `examples/react-vite` — Vite + React rendering a form with Tailwind-ish classes.
- `examples/vue-vite` — Vite + Vue 3.
- README usage snippets for Next.js (app router, `"use client"`), Astro (`client:load`), Nuxt (`<ClientOnly>` only if needed).

## Reference material (READ THESE)
- Live contract (ground truth from running instance): `/tmp/claude-1000/-home-bardiya-Projects-strapi-forms/7ff32602-c2b0-45d1-b79d-818b1b3ef87c/scratchpad/live-api-findings.md`
- Full audit findings: `/tmp/claude-1000/-home-bardiya-Projects-strapi-forms/7ff32602-c2b0-45d1-b79d-818b1b3ef87c/scratchpad/findings/` (audit-01..09, research-01..05; see INDEX.md)
- Plugin source (port validation/conditional verbatim): `/home/bardiya/Projects/strapi-forms/server/src/services/validation.ts`, `/home/bardiya/Projects/strapi-forms/server/src/utils/validation-rules.ts`
- Live test instance: `http://localhost:1337` (Strapi 5, plugin symlinked); slugs incl. `test-free-fields-form`, `rate-limit-test`, `recaptcha-test`.

## Hard rules
1. Match the plugin's client-relevant behavior exactly. Out of scope (server-only): webhooks, email/autoresponder, exports, analytics emission (server-derived — the SDK must NOT post analytics).
2. No bundled CSS. Headless only.
3. SSR/RSC-safe: no top-level browser globals.
4. peerDeps for react/vue; core has zero runtime deps.
5. Everything must build (`pnpm -r build`), type-check (`pnpm -r typecheck`), and test (`pnpm test`) green.
