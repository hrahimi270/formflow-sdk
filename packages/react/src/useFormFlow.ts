'use client';

/**
 * {@link useFormFlow} — the primary consumer hook. Reads the store from context,
 * subscribes to its state, and returns a stable, ergonomic surface for driving
 * the form: derived state, the visible-field list, step info, mutators, and a
 * `getFormProps()` getter that wires a native `<form>` to `store.submit()`.
 */

import { useCallback, useMemo, type FormEvent } from 'react';
import type {
  CaptchaProvider,
  FormField,
  FormFlowState,
  FormFlowStore,
  FormSchema,
  FormValues,
  PartialResumeResult,
  PartialSaveResult,
  SubmitSuccess,
} from '@formflowjs/core';
import { useFormFlowStoreContext, useStoreState } from './useFormFlowStore';

/** Props returned by {@link UseFormFlowReturn.getFormProps}. */
export interface FormProps {
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  /** Disable native browser validation; the SDK validates instead. */
  noValidate: true;
}

/** The shape returned by {@link useFormFlow}. */
export interface UseFormFlowReturn {
  /** The store driving this form (for advanced/imperative use). */
  store: FormFlowStore;
  /** The (immutable) form schema. */
  schema: FormSchema;
  /** The latest immutable store state snapshot. */
  state: FormFlowState;

  // ---- derived state ----
  values: FormValues;
  errors: FormFlowState['errors'];
  isSubmitting: boolean;
  status: FormFlowState['status'];
  result: SubmitSuccess | null;

  // ---- fields & steps ----
  /** Currently-visible, non-layout fields, sorted by `order`. */
  fields: FormField[];
  /** The current step's visible fields (== `fields` for single-layout forms). */
  stepFields: FormField[];
  currentStep: number;
  stepCount: number;
  isFirstStep: boolean;
  isLastStep: boolean;

  // ---- mutators (stable identities) ----
  setFieldValue(name: string, value: unknown): void;
  submit(): Promise<{ ok: boolean; result?: SubmitSuccess; error?: ReturnType<FormFlowStore['getState']>['submitError'] }>;
  reset(values?: FormValues): void;
  nextStep(): Promise<boolean>;
  prevStep(): void;
  goToStep(index: number): Promise<boolean>;
  savePartial(): Promise<PartialSaveResult>;
  loadPartial(resumeToken: string): Promise<PartialResumeResult>;
  setCaptchaToken(provider: CaptchaProvider, token: string): void;

  /** Wire a native `<form>`: `<form {...getFormProps()}>`. */
  getFormProps(): FormProps;
}

/**
 * Subscribe to the FormFlow store from context and return the form surface.
 *
 * Mutator identities are stable across renders (bound to the store), so they are
 * safe to use in dependency arrays.
 */
export function useFormFlow(): UseFormFlowReturn {
  const store = useFormFlowStoreContext();
  const state = useStoreState(store);

  // Derived field/step lists are recomputed from the snapshot. `getVisibleFields`
  // / `getStepFields` read the store's latest state, so recompute when the
  // snapshot identity (or step/visibility) changes.
  const fields = useMemo(
    () => store.getVisibleFields(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, state.visibleFieldNames, state.currentStep]
  );
  const stepFields = useMemo(
    () => store.getStepFields(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, state.visibleFieldNames, state.currentStep]
  );

  // Stable mutators bound to the store.
  const setFieldValue = useCallback(
    (name: string, value: unknown) => store.setFieldValue(name, value),
    [store]
  );
  const submit = useCallback(() => store.submit(), [store]);
  const reset = useCallback((values?: FormValues) => store.reset(values), [store]);
  const nextStep = useCallback(() => store.nextStep(), [store]);
  const prevStep = useCallback(() => store.prevStep(), [store]);
  const goToStep = useCallback((index: number) => store.goToStep(index), [store]);
  const savePartial = useCallback(() => store.savePartial(), [store]);
  const loadPartial = useCallback(
    (resumeToken: string) => store.loadPartial(resumeToken),
    [store]
  );
  const setCaptchaToken = useCallback(
    (provider: CaptchaProvider, token: string) => store.setCaptchaToken(provider, token),
    [store]
  );

  const getFormProps = useCallback((): FormProps => {
    return {
      noValidate: true,
      onSubmit: (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void store.submit();
      },
    };
  }, [store]);

  return {
    store,
    schema: store.schema,
    state,
    values: state.values,
    errors: state.errors,
    isSubmitting: state.isSubmitting,
    status: state.status,
    result: state.result,
    fields,
    stepFields,
    currentStep: state.currentStep,
    stepCount: state.stepCount,
    isFirstStep: state.currentStep <= 0,
    isLastStep: state.currentStep >= state.stepCount - 1,
    setFieldValue,
    submit,
    reset,
    nextStep,
    prevStep,
    goToStep,
    savePartial,
    loadPartial,
    setCaptchaToken,
    getFormProps,
  };
}
