'use client';

/**
 * @formflowjs/react — headless React adapter for FormFlow.
 *
 * A thin, "use client" binding over the framework-agnostic `@formflowjs/core`
 * engine: a provider that owns a reactive store, hooks to read/drive it, and
 * renderless components (`FormFlowField`, `FormFlowStep`, `FormFlowHoneypot`)
 * that hand you value + errors + ARIA-complete prop getters so you render your
 * OWN markup. Ships no CSS; all visual state is exposed via boolean flags and
 * `data-*` attributes. SSR/RSC-safe (`useSyncExternalStore` with a server
 * snapshot, `useId` for ids, no top-level browser globals).
 */

/* ---- provider + context ---- */
export { FormFlowProvider, type FormFlowProviderProps } from './FormFlowProvider';
export { FormFlowContext } from './context';

/* ---- hooks ---- */
export {
  useFormFlow,
  type UseFormFlowReturn,
  type FormProps,
} from './useFormFlow';
export {
  useFormFlowField,
  isChoiceField,
  type UseFormFlowFieldReturn,
  type FieldDataAttributes,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type LabelProps,
  type ErrorProps,
  type DescriptionProps,
  type ControlProps,
  type OptionProps,
} from './useFormFlowField';
export {
  useFormFlowStoreContext,
  useStoreState,
} from './useFormFlowStore';

/* ---- renderless components ---- */
export { FormFlowField, type FormFlowFieldProps } from './FormFlowField';
export {
  FormFlowStep,
  type FormFlowStepProps,
  type FormFlowStepApi,
  type StepButtonProps,
} from './FormFlowStep';
export { FormFlowHoneypot, type FormFlowHoneypotProps } from './FormFlowHoneypot';

/* ---- re-export the core surface for one-import ergonomics ---- */
export * from '@formflowjs/core';
