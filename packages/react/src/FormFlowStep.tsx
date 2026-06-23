'use client';

/**
 * {@link FormFlowStep} — renderless multi-step helper. Hands your render
 * function the current step's index/total/fields plus `getNextProps()`,
 * `getPrevProps()`, and `getSubmitProps()` button getters that drive
 * `store.nextStep()` / `prevStep()` / `submit()`.
 *
 * For a single-layout form there is exactly one step (index 0, total 1), so this
 * still works — `isFirst` and `isLast` are both true and `getSubmitProps()` is
 * the one to wire.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useCallback } from 'react';
import type { FormField } from '@formflowjs/core';
import { useFormFlow } from './useFormFlow';

/** Props for a `<button type="button">` that advances to the next step. */
export type StepButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** The step surface passed to the render function. */
export interface FormFlowStepApi {
  /** Zero-based current step index. */
  index: number;
  /** Total number of steps (`1` for single-layout). */
  total: number;
  /** The current step's visible fields. */
  fields: FormField[];
  isFirst: boolean;
  isLast: boolean;
  /** Button props that validate + advance (`type=button`, disabled while validating). */
  getNextProps(overrides?: Partial<StepButtonProps>): StepButtonProps;
  /** Button props that go back one step (no validation). */
  getPrevProps(overrides?: Partial<StepButtonProps>): StepButtonProps;
  /** Button props that submit the whole form (`type=submit`). */
  getSubmitProps(overrides?: Partial<StepButtonProps>): StepButtonProps;
}

export interface FormFlowStepProps {
  render?: (step: FormFlowStepApi) => ReactNode;
  children?: (step: FormFlowStepApi) => ReactNode;
}

/**
 * Renderless step controller. Supports `render` and children-as-function.
 *
 * @example
 * ```tsx
 * <FormFlowStep render={({ fields, isLast, getNextProps, getSubmitProps }) => (
 *   <>
 *     {fields.map((f) => <FormFlowField key={f.name} name={f.name} render={...} />)}
 *     {isLast ? <button {...getSubmitProps()}>Submit</button>
 *             : <button {...getNextProps()}>Next</button>}
 *   </>
 * )} />
 * ```
 */
export function FormFlowStep(props: FormFlowStepProps): ReactNode {
  const { render, children } = props;
  const {
    stepFields,
    currentStep,
    stepCount,
    isFirstStep,
    isLastStep,
    state,
    nextStep,
    prevStep,
    submit,
  } = useFormFlow();

  const isValidating = state.isValidating;
  const isSubmitting = state.isSubmitting;

  const getNextProps = useCallback(
    (overrides?: Partial<StepButtonProps>): StepButtonProps => ({
      type: 'button',
      disabled: isValidating || undefined,
      'aria-busy': isValidating || undefined,
      onClick: () => {
        void nextStep();
      },
      ...overrides,
    }),
    [isValidating, nextStep]
  );

  const getPrevProps = useCallback(
    (overrides?: Partial<StepButtonProps>): StepButtonProps => ({
      type: 'button',
      disabled: isFirstStep || undefined,
      onClick: () => prevStep(),
      ...overrides,
    }),
    [isFirstStep, prevStep]
  );

  const getSubmitProps = useCallback(
    (overrides?: Partial<StepButtonProps>): StepButtonProps => ({
      type: 'submit',
      disabled: isSubmitting || undefined,
      'aria-busy': isSubmitting || undefined,
      onClick: () => {
        void submit();
      },
      ...overrides,
    }),
    [isSubmitting, submit]
  );

  const api: FormFlowStepApi = {
    index: currentStep,
    total: stepCount,
    fields: stepFields,
    isFirst: isFirstStep,
    isLast: isLastStep,
    getNextProps,
    getPrevProps,
    getSubmitProps,
  };

  const renderFn = render ?? children;
  if (typeof renderFn !== 'function') {
    throw new Error('[formflow] <FormFlowStep> needs a `render` prop or a function child.');
  }
  return renderFn(api);
}
