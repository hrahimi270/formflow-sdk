/**
 * Reactive, framework-agnostic form store — the single state container both the
 * React and Vue adapters bind to.
 *
 * Design: an immutable-state observer store. Every mutation REPLACES `state`
 * with a brand-new object and notifies subscribers, so React's
 * `useSyncExternalStore` and Vue's `shallowRef` both detect changes by identity.
 * No browser globals are touched — the store is fully SSR/RSC-safe; network I/O
 * is delegated to an injectable {@link FormFlowClient}.
 */

import type {
  CaptchaProvider,
  CaptchaConfig,
  CaptchaTokens,
  FormField,
  FormSchema,
  FormStep,
  FormValues,
  FormErrors,
  PartialResumeResult,
  PartialSaveResult,
  SubmitSuccess,
  ValidationResult,
} from './types';
import { DEFAULT_HONEYPOT_FIELD } from './constants';
import { isLayoutField } from './constants';
import { isFieldVisible } from './conditional';
import {
  validateForm as validateFormFields,
  validateSubset,
} from './validation';
import { FormFlowError, isFormFlowError } from './errors';
import {
  createFormFlowClient,
  type FormFlowClient,
} from './client';

/** When client-side validation runs against a field. */
export type ValidateOn = 'change' | 'blur' | 'submit';
/** When a field with an existing error is re-validated. */
export type RevalidateOn = 'change' | 'blur';

/** The full, immutable store state snapshot. */
export interface FormFlowState {
  values: FormValues;
  errors: FormErrors;
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
  /** Recomputed on every value change via {@link isFieldVisible}. */
  visibleFieldNames: string[];
  /** Zero-based; `0` for a single-layout form. */
  currentStep: number;
  /** `1` for a single-layout form. */
  stepCount: number;
  status: 'idle' | 'submitting' | 'success' | 'error';
  isSubmitting: boolean;
  isValidating: boolean;
  submitCount: number;
  submitError: FormFlowError | null;
  result: SubmitSuccess | null;
  /** 0..100 during a multipart upload; `null` otherwise. */
  uploadProgress: number | null;
  resumeToken: string | null;
}

/** Options for {@link createFormStore}. */
export interface FormStoreOptions {
  /** A pre-built client. If omitted, one is created from `baseUrl`/`apiPrefix`. */
  client?: FormFlowClient;
  baseUrl?: string;
  apiPrefix?: string;
  locale?: string;
  initialValues?: FormValues;
  /** When client-side validation fires. Default `'blur'`. */
  validateOn?: ValidateOn;
  /** When a field re-validates after its first error. Default `'change'`. */
  revalidateOn?: RevalidateOn;
  /** Use the server's per-step validate endpoint instead of client checks. */
  serverStepValidation?: boolean;
  captcha?: CaptchaConfig;
  onSubmitSuccess?(result: SubmitSuccess, values: FormValues): void;
  onSubmitError?(error: FormFlowError): void;
}

/** The store surface the adapters consume. */
export interface FormFlowStore {
  readonly schema: FormSchema;
  getState(): FormFlowState;
  subscribe(listener: () => void): () => void;
  // schema helpers
  getField(name: string): FormField | undefined;
  getVisibleFields(): FormField[];
  getStepFields(stepIndex?: number): FormField[];
  // value mutations
  setFieldValue(name: string, value: unknown): void;
  setValues(values: FormValues): void;
  setFieldTouched(name: string, touched?: boolean): void;
  setFieldError(name: string, errors: string[] | null): void;
  reset(values?: FormValues): void;
  // captcha + honeypot
  setCaptchaToken(provider: CaptchaProvider, token: string): void;
  // validation
  validateField(name: string): string[];
  validateForm(): ValidationResult;
  validateCurrentStep(): ValidationResult;
  // navigation
  goToStep(index: number): Promise<boolean>;
  nextStep(): Promise<boolean>;
  prevStep(): void;
  // submission
  submit(): Promise<{ ok: boolean; result?: SubmitSuccess; error?: FormFlowError }>;
  savePartial(): Promise<PartialSaveResult>;
  loadPartial(resumeToken: string): Promise<PartialResumeResult>;
}

/* ------------------------------------------------------------------ *
 * Implementation
 * ------------------------------------------------------------------ */

/** Compute the default value for a field, used to seed initial form values. */
function defaultValueFor(field: FormField): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'checkbox') return [];
  if (field.type === 'boolean' || field.type === 'consent') return false;
  return '';
}

/**
 * Create a reactive form store for a schema.
 *
 * @param schema  - The public form schema (from `client.getForm`)
 * @param options - Client/baseUrl, initial values, validation timing, callbacks
 */
export function createFormStore(
  schema: FormSchema,
  options: FormStoreOptions = {}
): FormFlowStore {
  const validateOn: ValidateOn = options.validateOn ?? 'blur';
  const revalidateOn: RevalidateOn = options.revalidateOn ?? 'change';
  const serverStepValidation = options.serverStepValidation ?? false;

  // Resolve (or lazily create) the content-API client.
  const client: FormFlowClient =
    options.client ??
    createFormFlowClient({
      baseUrl: options.baseUrl ?? '',
      apiPrefix: options.apiPrefix,
    });

  // ---- step model ----
  const isMultiStep =
    schema.settings.layout === 'multi-step' && Array.isArray(schema.settings.steps);
  const steps: FormStep[] = isMultiStep ? schema.settings.steps ?? [] : [];
  const stepCount = isMultiStep ? Math.max(steps.length, 1) : 1;

  // ---- captcha tokens (kept outside `state`; folded into the submit body) ----
  const captchaTokens: CaptchaTokens = {};

  // ---- initial values: schema defaults overlaid with caller-provided values ----
  function buildInitialValues(seed?: FormValues): FormValues {
    const values: FormValues = {};
    for (const field of schema.fields) {
      if (isLayoutField(field.type)) continue;
      values[field.name] = defaultValueFor(field);
    }
    return { ...values, ...(seed ?? {}) };
  }

  // ---- subscribers ----
  const listeners = new Set<() => void>();
  function notify(): void {
    for (const listener of listeners) listener();
  }

  // ---- state ----
  let state: FormFlowState = makeInitialState(buildInitialValues(options.initialValues));

  function makeInitialState(values: FormValues): FormFlowState {
    return {
      values,
      errors: {},
      touched: {},
      dirty: {},
      visibleFieldNames: computeVisibleFieldNames(values),
      currentStep: 0,
      stepCount,
      status: 'idle',
      isSubmitting: false,
      isValidating: false,
      submitCount: 0,
      submitError: null,
      result: null,
      uploadProgress: null,
      resumeToken: null,
    };
  }

  /** Names of currently-visible, non-layout fields. */
  function computeVisibleFieldNames(values: FormValues): string[] {
    return schema.fields
      .filter((f) => !isLayoutField(f.type) && isFieldVisible(f.conditional, values))
      .map((f) => f.name);
  }

  /** Replace `state` with a patched copy and notify subscribers. */
  function setState(patch: Partial<FormFlowState>): void {
    state = { ...state, ...patch };
    notify();
  }

  /* ---------------- schema helpers ---------------- */

  function getField(name: string): FormField | undefined {
    return schema.fields.find((f) => f.name === name);
  }

  function getVisibleFields(): FormField[] {
    const visible = new Set(state.visibleFieldNames);
    return schema.fields
      .filter((f) => !isLayoutField(f.type) && visible.has(f.name))
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Resolve a step's fields. `step.fields` stores field IDs, so map them back to
   * the schema fields (preserving the step's order), drop layout fields, and
   * keep only currently-visible ones. For a single-layout form, every visible
   * field is "the step".
   */
  function getStepFields(stepIndex: number = state.currentStep): FormField[] {
    if (!isMultiStep) return getVisibleFields();
    const step = steps[stepIndex];
    if (!step) return [];
    const visible = new Set(state.visibleFieldNames);
    const byId = new Map(schema.fields.map((f) => [f.id, f] as const));
    const fields: FormField[] = [];
    for (const id of step.fields) {
      const field = byId.get(id);
      if (field && !isLayoutField(field.type) && visible.has(field.name)) {
        fields.push(field);
      }
    }
    return fields;
  }

  /* ---------------- value mutations ---------------- */

  /**
   * Recompute visibility after a value change and DROP the errors of any field
   * that just became hidden (a hidden field enforces nothing).
   */
  function applyValueChange(nextValues: FormValues, patch: Partial<FormFlowState>): void {
    const nextVisible = computeVisibleFieldNames(nextValues);
    const visibleSet = new Set(nextVisible);
    const nextErrors: FormErrors = {};
    for (const [name, msgs] of Object.entries(state.errors)) {
      if (visibleSet.has(name)) nextErrors[name] = msgs;
    }
    setState({
      values: nextValues,
      visibleFieldNames: nextVisible,
      errors: nextErrors,
      ...patch,
    });
  }

  function setFieldValue(name: string, value: unknown): void {
    const nextValues = { ...state.values, [name]: value };
    const nextDirty = { ...state.dirty, [name]: true };

    // Re-validate on change when configured, or when the field already has an
    // error and `revalidateOn === 'change'`.
    const hadError = (state.errors[name]?.length ?? 0) > 0;
    const shouldValidate =
      validateOn === 'change' || (hadError && revalidateOn === 'change');

    applyValueChange(nextValues, { dirty: nextDirty });

    if (shouldValidate) {
      runFieldValidation(name);
    }
  }

  function setValues(values: FormValues): void {
    const nextValues = { ...state.values, ...values };
    const nextDirty = { ...state.dirty };
    for (const key of Object.keys(values)) nextDirty[key] = true;
    applyValueChange(nextValues, { dirty: nextDirty });
  }

  function setFieldTouched(name: string, touched = true): void {
    setState({ touched: { ...state.touched, [name]: touched } });
    // Validate on blur when configured (or re-validate an errored field).
    const hadError = (state.errors[name]?.length ?? 0) > 0;
    if (touched && (validateOn === 'blur' || (hadError && revalidateOn === 'blur'))) {
      runFieldValidation(name);
    }
  }

  function setFieldError(name: string, errors: string[] | null): void {
    const nextErrors = { ...state.errors };
    if (errors && errors.length > 0) {
      nextErrors[name] = errors;
    } else {
      delete nextErrors[name];
    }
    setState({ errors: nextErrors });
  }

  function reset(values?: FormValues): void {
    for (const key of Object.keys(captchaTokens)) {
      delete captchaTokens[key as CaptchaProvider];
    }
    state = makeInitialState(buildInitialValues(values ?? options.initialValues));
    notify();
  }

  /* ---------------- captcha ---------------- */

  function setCaptchaToken(provider: CaptchaProvider, token: string): void {
    captchaTokens[provider] = token;
    // Token state lives outside `state`; no re-render is required, but emit a
    // notify so any UI reflecting "captcha solved" can update if it subscribes.
    notify();
  }

  /* ---------------- validation ---------------- */

  /** Validate a single field against the full data; returns its messages. */
  function validateField(name: string): string[] {
    const field = getField(name);
    if (!field) return [];
    // Hidden fields enforce nothing.
    if (!isFieldVisible(field.conditional, state.values)) return [];
    const result = validateFormFields([field], state.values);
    return result.errors[name] ?? [];
  }

  /** Validate a field and fold the result into `state.errors`. */
  function runFieldValidation(name: string): string[] {
    const messages = validateField(name);
    setFieldError(name, messages.length > 0 ? messages : null);
    return messages;
  }

  function validateForm(): ValidationResult {
    const result = validateFormFields(schema.fields, state.values);
    setState({ errors: result.errors });
    return result;
  }

  function validateCurrentStep(): ValidationResult {
    if (!isMultiStep) return validateForm();
    const step = steps[state.currentStep];
    if (!step) return { valid: true, errors: {} };
    // Validate only this step's fields (matched by id or name), against the full
    // data — identical to the server's validateSubset.
    const result = validateSubset(schema.fields, step.fields, state.values);
    // Merge step errors into state (without clobbering other steps' errors).
    const nextErrors = { ...state.errors, ...result.errors };
    // Drop any now-passing fields belonging to this step.
    for (const field of getStepFields()) {
      if (!result.errors[field.name]) delete nextErrors[field.name];
    }
    setState({ errors: nextErrors });
    return result;
  }

  /* ---------------- navigation ---------------- */

  function clampStep(index: number): number {
    return Math.max(0, Math.min(index, stepCount - 1));
  }

  /** Validate the current step (client, or server when enabled). */
  async function validateStepForAdvance(): Promise<boolean> {
    if (!isMultiStep) {
      return validateCurrentStep().valid;
    }

    if (serverStepValidation) {
      const step = steps[state.currentStep];
      const stepIndicator = step?.id ?? state.currentStep;
      setState({ isValidating: true });
      try {
        await client.validateStep(schema.slug, state.values, stepIndicator);
        setState({ isValidating: false });
        return true;
      } catch (err) {
        setState({ isValidating: false });
        if (isFormFlowError(err) && err.code === 'validation') {
          // Merge server field errors into state.
          setState({ errors: { ...state.errors, ...(err.fieldErrors ?? {}) } });
          return false;
        }
        throw err;
      }
    }

    return validateCurrentStep().valid;
  }

  async function goToStep(index: number): Promise<boolean> {
    const target = clampStep(index);
    // Moving backward (or to the same step) never requires validation.
    if (target <= state.currentStep) {
      setState({ currentStep: target });
      return true;
    }
    // Moving forward validates the current step first.
    const valid = await validateStepForAdvance();
    if (!valid) return false;
    setState({ currentStep: target });
    return true;
  }

  async function nextStep(): Promise<boolean> {
    if (state.currentStep >= stepCount - 1) {
      // Already on the last step — validate but do not advance past the end.
      return validateStepForAdvance();
    }
    const valid = await validateStepForAdvance();
    if (!valid) return false;
    setState({ currentStep: state.currentStep + 1 });
    return true;
  }

  function prevStep(): void {
    if (state.currentStep > 0) {
      setState({ currentStep: state.currentStep - 1 });
    }
  }

  /* ---------------- submission ---------------- */

  function honeypotValueFor(): string | undefined {
    return schema.settings.spam?.honeypot
      ? ((state.values[schema.settings.spam.honeypotFieldName || DEFAULT_HONEYPOT_FIELD] as
          | string
          | undefined) ?? '')
      : undefined;
  }

  async function submit(): Promise<{
    ok: boolean;
    result?: SubmitSuccess;
    error?: FormFlowError;
  }> {
    // Validate the whole form first — never hit the network when invalid.
    const validation = validateForm();
    if (!validation.valid) {
      setState({
        status: 'error',
        submitCount: state.submitCount + 1,
        // Touch every errored field so adapters can surface messages.
        touched: { ...state.touched, ...touchAll(validation.errors) },
      });
      return { ok: false };
    }

    setState({
      status: 'submitting',
      isSubmitting: true,
      submitError: null,
      result: null,
      submitCount: state.submitCount + 1,
      uploadProgress: null,
    });

    try {
      const result = await client.submit(
        schema.slug,
        {
          schema,
          values: state.values,
          honeypotValue: honeypotValueFor(),
          captchaTokens: { ...captchaTokens },
        },
        {
          onUploadProgress: (pct) => setState({ uploadProgress: pct }),
        }
      );

      setState({
        status: 'success',
        isSubmitting: false,
        result,
        submitError: null,
        uploadProgress: null,
        resumeToken: null,
      });
      options.onSubmitSuccess?.(result, state.values);
      return { ok: true, result };
    } catch (err) {
      const error = isFormFlowError(err)
        ? err
        : new FormFlowError(
            err instanceof Error ? err.message : 'Submission failed',
            { code: 'unknown', status: 0, cause: err }
          );

      // Merge server validation errors into the field error map.
      const mergedErrors =
        error.code === 'validation'
          ? { ...state.errors, ...(error.fieldErrors ?? {}) }
          : state.errors;

      setState({
        status: 'error',
        isSubmitting: false,
        submitError: error,
        errors: mergedErrors,
        uploadProgress: null,
      });
      options.onSubmitError?.(error);
      return { ok: false, error };
    }
  }

  /** Mark every key in an error map as touched. */
  function touchAll(errors: FormErrors): Record<string, boolean> {
    const touched: Record<string, boolean> = {};
    for (const name of Object.keys(errors)) touched[name] = true;
    return touched;
  }

  async function savePartial(): Promise<PartialSaveResult> {
    const result = await client.savePartial(schema.slug, state.values, {
      resumeToken: state.resumeToken ?? undefined,
    });
    setState({ resumeToken: result.resumeToken });
    return result;
  }

  async function loadPartial(resumeToken: string): Promise<PartialResumeResult> {
    const result = await client.loadPartial(schema.slug, resumeToken);
    const nextValues = { ...state.values, ...result.data };
    applyValueChange(nextValues, { resumeToken });
    return result;
  }

  /* ---------------- public store ---------------- */

  return {
    schema,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getField,
    getVisibleFields,
    getStepFields,
    setFieldValue,
    setValues,
    setFieldTouched,
    setFieldError,
    reset,
    setCaptchaToken,
    validateField,
    validateForm,
    validateCurrentStep,
    goToStep,
    nextStep,
    prevStep,
    submit,
    savePartial,
    loadPartial,
  };
}
