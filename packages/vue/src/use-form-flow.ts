/**
 * `useFormFlow()` — the primary composable.
 *
 * Two modes:
 *   1. Inside a `<FormFlow>` provider → reads the injected context (preferred).
 *   2. Standalone → pass `{ form, ...options }` and it creates its own store +
 *      context. Useful when you want a form without the wrapper component.
 *
 * Returns reactive refs derived from the bridged store state, plus the store's
 * imperative methods (bound) and a `formProps` computed for `v-bind` on a
 * `<form @submit.prevent>` element.
 */

import { computed, inject, provide, type ComputedRef, type Ref } from 'vue';
import {
  createFormStore,
  type CaptchaProvider,
  type FormFlowState,
  type FormFlowStore,
  type FormSchema,
  type FormStoreOptions,
  type FormValues,
  type SubmitSuccess,
} from '@formflowjs/core';
import { FORM_FLOW_KEY, type FormFlowContext } from './context';
import { useStoreState } from './use-store-state';
import { type PropBag } from './prop-getters';

let standaloneCounter = 0;

/** Options accepted when creating a standalone form (no provider). */
export interface UseFormFlowOptions extends FormStoreOptions {
  /** The schema to render. Required when no `<FormFlow>` provider is present. */
  form: FormSchema;
  /** Override the generated id base (otherwise derived from the slug). */
  idBase?: string;
}

/** The shape returned by {@link useFormFlow}. */
export interface UseFormFlowReturn {
  /** The underlying store (escape hatch for advanced use). */
  store: FormFlowStore;
  /** The form schema. */
  schema: FormSchema;
  /** The full immutable state snapshot (reactive). */
  state: Ref<FormFlowState>;
  /** Current values, keyed by field name. */
  values: ComputedRef<FormValues>;
  /** Current errors, keyed by field name. */
  errors: ComputedRef<Record<string, string[]>>;
  isSubmitting: ComputedRef<boolean>;
  status: ComputedRef<FormFlowState['status']>;
  result: ComputedRef<SubmitSuccess | null>;
  /** Currently-visible, ordered fields. */
  fields: ComputedRef<ReturnType<FormFlowStore['getVisibleFields']>>;
  /** The current step's visible fields. */
  stepFields: ComputedRef<ReturnType<FormFlowStore['getStepFields']>>;
  currentStep: ComputedRef<number>;
  stepCount: ComputedRef<number>;
  isFirstStep: ComputedRef<boolean>;
  isLastStep: ComputedRef<boolean>;
  // methods (bound to the store)
  setFieldValue: FormFlowStore['setFieldValue'];
  setValues: FormFlowStore['setValues'];
  setFieldTouched: FormFlowStore['setFieldTouched'];
  setFieldError: FormFlowStore['setFieldError'];
  submit: FormFlowStore['submit'];
  reset: FormFlowStore['reset'];
  nextStep: FormFlowStore['nextStep'];
  prevStep: FormFlowStore['prevStep'];
  goToStep: FormFlowStore['goToStep'];
  setCaptchaToken: FormFlowStore['setCaptchaToken'];
  savePartial: FormFlowStore['savePartial'];
  loadPartial: FormFlowStore['loadPartial'];
  /** Props for `v-bind` on `<form>`: wires submit + disables native validation. */
  formProps: ComputedRef<PropBag>;
}

/**
 * Build a fully-wired context (store + bridged state ref + id base) for a schema.
 * Used by both the standalone path here and by the {@link FormFlow} component.
 */
export function createFormFlowContext(
  schema: FormSchema,
  options: FormStoreOptions = {},
  idBase?: string
): FormFlowContext {
  const store = createFormStore(schema, options);
  const state = useStoreState(store);
  const resolvedIdBase =
    idBase ?? `formflow-${schema.slug || 'form'}-${++standaloneCounter}`;
  return { store, state, idBase: resolvedIdBase };
}

/**
 * Derive the public composable surface from a context. Shared by `useFormFlow`
 * and the `<FormFlow>` default slot so both expose identical refs/methods.
 */
export function buildFormFlowReturn(ctx: FormFlowContext): UseFormFlowReturn {
  const { store, state } = ctx;

  const values = computed(() => state.value.values);
  const errors = computed(() => state.value.errors);
  const isSubmitting = computed(() => state.value.isSubmitting);
  const status = computed(() => state.value.status);
  const result = computed(() => state.value.result);
  const currentStep = computed(() => state.value.currentStep);
  const stepCount = computed(() => state.value.stepCount);
  const isFirstStep = computed(() => state.value.currentStep === 0);
  const isLastStep = computed(() => state.value.currentStep >= state.value.stepCount - 1);

  // `getVisibleFields`/`getStepFields` read the live store state, so we depend on
  // `state.value` to make these recompute whenever visibility/step changes.
  const fields = computed(() => {
    void state.value;
    return store.getVisibleFields();
  });
  const stepFields = computed(() => {
    void state.value;
    return store.getStepFields();
  });

  const formProps = computed<PropBag>(() => ({
    // `@submit.prevent` is recommended in templates, but we also guard here so
    // `v-bind="formProps"` works on its own.
    onSubmit: (event: Event) => {
      event.preventDefault();
      void store.submit();
    },
    novalidate: true,
  }));

  return {
    store,
    schema: store.schema,
    state,
    values,
    errors,
    isSubmitting,
    status,
    result,
    fields,
    stepFields,
    currentStep,
    stepCount,
    isFirstStep,
    isLastStep,
    setFieldValue: store.setFieldValue.bind(store),
    setValues: store.setValues.bind(store),
    setFieldTouched: store.setFieldTouched.bind(store),
    setFieldError: store.setFieldError.bind(store),
    submit: store.submit.bind(store),
    reset: store.reset.bind(store),
    nextStep: store.nextStep.bind(store),
    prevStep: store.prevStep.bind(store),
    goToStep: store.goToStep.bind(store),
    setCaptchaToken: (provider: CaptchaProvider, token: string) =>
      store.setCaptchaToken(provider, token),
    savePartial: store.savePartial.bind(store),
    loadPartial: store.loadPartial.bind(store),
    formProps,
  };
}

/**
 * Read the form context from injection, or create a standalone one when given a
 * `{ form }`. When creating standalone, the context is also `provide()`d so
 * nested `useFormFlowField`/components in the same setup tree can find it.
 *
 * @throws if called without a provider AND without a `form` option.
 */
export function useFormFlow(options?: UseFormFlowOptions): UseFormFlowReturn {
  const injected = inject(FORM_FLOW_KEY, null);

  if (injected) {
    return buildFormFlowReturn(injected);
  }

  if (!options?.form) {
    throw new Error(
      '[formflow] useFormFlow() must be called within a <FormFlow> provider, ' +
        'or be given a `form` schema to create a standalone instance.'
    );
  }

  const { form, idBase, ...storeOptions } = options;
  const ctx = createFormFlowContext(form, storeOptions, idBase);
  // Share it down the tree so child composables/components reuse this instance.
  provide(FORM_FLOW_KEY, ctx);
  return buildFormFlowReturn(ctx);
}
