# @formflowjs/vue

Headless **Vue 3** adapter for [FormFlow](https://github.com/formflow/formflow-sdk) — the
Strapi forms plugin. Fetch a form schema by slug and render it with **your own
markup and styles** (Tailwind / UnoCSS / plain CSS). This package ships **no
CSS** and renders **no markup** of its own (except the hidden honeypot input): it
gives you reactive state and accessibility-wired prop bags to `v-bind`.

It is a thin layer over [`@formflowjs/core`](../core) — the framework-agnostic
engine that owns schema typing, client-side validation (server parity),
conditional visibility, multi-step flow, file uploads, captcha/honeypot plumbing,
and the content-API client.

```bash
pnpm add @formflowjs/vue   # or npm i / yarn add
```

`vue >= 3.4` is a peer dependency. `@formflowjs/core` is re-exported, so you import
everything from `@formflowjs/vue`.

---

## Public API

### Components (renderless)

| Component          | Slot props                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| `<FormFlow>`       | the full `useFormFlow()` surface (see below)                               |
| `<FormFlowField>`  | the full `useFormFlowField()` surface                                      |
| `<FormFlowStep>`   | `{ index, total, fields, isFirst, isLast, nextProps, prevProps, submitProps, getNextProps(), getPrevProps(), getSubmitProps() }` |
| `<FormFlowHoneypot>` | renders the hidden spam-trap input declared by the schema (or nothing)   |

`<FormFlow>` is the provider: it creates the store and `provide()`s context for
every descendant composable/component.

### Composables

```ts
const f = useFormFlow();          // inside <FormFlow>, OR useFormFlow({ form, baseUrl, ... }) standalone
// refs:    f.state, f.values, f.errors, f.isSubmitting, f.status, f.result,
//          f.fields, f.stepFields, f.currentStep, f.stepCount, f.isFirstStep, f.isLastStep
// methods: f.setFieldValue, f.setValues, f.submit, f.reset,
//          f.nextStep, f.prevStep, f.goToStep, f.setCaptchaToken,
//          f.savePartial, f.loadPartial
// computed: f.formProps   // v-bind on <form>

const field = useFormFlowField('email');
// refs:     field.value, field.errors, field.error, field.invalid, field.touched, field.dirty, field.visible
// computed: field.inputProps, field.labelProps, field.errorProps, field.descriptionProps, field.controlProps
// methods:  field.setValue, field.setTouched, field.getInputProps(overrides?), field.getOptionProps(value)
```

All prop bags are `computed` objects ready for `v-bind`. They include `data-*`
state attributes (`data-invalid`, `data-dirty`, `data-touched`) and full ARIA
wiring (`aria-invalid`, `aria-required`, `aria-describedby`, label `for`, error
`role="alert"`, choice-group `role="group"`).

---

## Vue + Vite

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  FormFlow,
  FormFlowField,
  FormFlowHoneypot,
  createFormFlowClient,
  type FormSchema,
} from '@formflowjs/vue';

const BASE_URL = 'https://cms.example.com';
const schema = ref<FormSchema | null>(null);

onMounted(async () => {
  const client = createFormFlowClient({ baseUrl: BASE_URL });
  schema.value = await client.getForm('contact');
});
</script>

<template>
  <FormFlow
    v-if="schema"
    :form="schema"
    :options="{ baseUrl: BASE_URL, validateOn: 'blur' }"
    v-slot="f"
  >
    <form v-bind="f.formProps">
      <FormFlowField
        v-for="field in f.fields.value"
        :key="field.name"
        :name="field.name"
        v-slot="ff"
      >
        <div :class="['field', { 'is-invalid': ff.invalid.value }]" v-bind="ff.controlProps.value">
          <label v-bind="ff.labelProps.value">{{ field.label }}</label>

          <!-- choice fields -->
          <template v-if="field.options">
            <label v-for="opt in field.options" :key="opt.value">
              <input v-bind="ff.getOptionProps(opt.value)" />
              {{ opt.label }}
            </label>
          </template>

          <!-- everything else -->
          <input v-else v-bind="ff.inputProps.value" />

          <p v-if="field.description" v-bind="ff.descriptionProps.value">
            {{ field.description }}
          </p>
          <p v-if="ff.invalid.value" v-bind="ff.errorProps.value">
            {{ ff.error.value }}
          </p>
        </div>
      </FormFlowField>

      <!-- Always render the honeypot; it hides itself when the schema disables it. -->
      <FormFlowHoneypot />

      <button type="submit" :disabled="f.isSubmitting.value">
        {{ schema.settings.submitButtonText }}
      </button>

      <p v-if="f.status.value === 'success'">{{ f.result.value?.message }}</p>
    </form>
  </FormFlow>
</template>
```

### Multi-step forms

```vue
<FormFlow :form="schema" :options="options" v-slot="f">
  <form v-bind="f.formProps">
    <FormFlowStep v-slot="step">
      <p>Step {{ step.index + 1 }} of {{ step.total }}</p>

      <FormFlowField v-for="field in step.fields" :key="field.name" :name="field.name" v-slot="ff">
        <label v-bind="ff.labelProps.value">{{ field.label }}</label>
        <input v-bind="ff.inputProps.value" />
      </FormFlowField>

      <button v-if="!step.isFirst" v-bind="step.prevProps">Back</button>
      <button v-if="!step.isLast" v-bind="step.nextProps">Next</button>
      <button v-else v-bind="step.submitProps">Submit</button>
    </FormFlowStep>
  </form>
</FormFlow>
```

---

## Nuxt 3

The adapter is SSR-safe: it never touches `window`/`document` at module load, so
`<FormFlow>` and the composables render on the server. The content-API **client**
(`createFormFlowClient`) uses the global `fetch`, available in Nuxt's Nitro
server — fetch the schema in `useAsyncData` and pass it down.

```vue
<script setup lang="ts">
import { FormFlow, FormFlowField, FormFlowHoneypot, createFormFlowClient } from '@formflowjs/vue';

const config = useRuntimeConfig();
const client = createFormFlowClient({ baseUrl: config.public.formflowBaseUrl });

// Schema fetch is SSR-friendly (runs on the server, hydrates on the client).
const { data: schema } = await useAsyncData('contact-form', () => client.getForm('contact'));
</script>

<template>
  <ClientOnly>
    <FormFlow v-if="schema" :form="schema" :options="{ client }" v-slot="f">
      <form v-bind="f.formProps">
        <FormFlowField name="email" v-slot="ff">
          <label v-bind="ff.labelProps.value">Email</label>
          <input v-bind="ff.inputProps.value" />
          <span v-if="ff.invalid.value" v-bind="ff.errorProps.value">{{ ff.error.value }}</span>
        </FormFlowField>
        <FormFlowHoneypot />
        <button type="submit">Submit</button>
      </form>
    </FormFlow>
  </ClientOnly>
</template>
```

> **`<ClientOnly>` note:** the form **renders** fine on the server, but
> *interaction* (typing, file selection, captcha widgets) is client-only. Wrap the
> form in Nuxt's `<ClientOnly>` when you only need it interactive in the browser
> and want to avoid a hydration mismatch from third-party captcha/file widgets.
> If you render the form server-side for SEO/no-JS, pass an explicit `idBase` to
> `<FormFlow>` so element ids are stable across the SSR/CSR boundary.

---

## Captcha

The schema exposes the reCAPTCHA **site key** + version but never secret keys.
Render your captcha widget yourself and feed tokens to the store:

```ts
const f = useFormFlow();
// in your reCAPTCHA / Turnstile / hCaptcha callback:
f.setCaptchaToken('recaptcha', token);
```

The token is folded into the submit body under the correct field name
automatically. Provide Turnstile/hCaptcha site keys via `options.captcha` (they
are not present in the schema).

---

## Accessibility

Prop getters wire everything for you:

- **input** — `id`, `name`, `aria-invalid`, `aria-required`, `aria-describedby`
  (description id + error id).
- **label** — matching `for`.
- **error** — `id`, `role="alert"`, `aria-live="polite"`.
- **description** — `id`.
- **choice groups** — `role="group"` + `aria-labelledby` (via `controlProps`).

No CSS is bundled; style with the `data-*` attributes and the boolean refs.
