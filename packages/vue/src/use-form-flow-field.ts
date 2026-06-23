/**
 * `useFormFlowField(name)` — bind a single field to the injected form context.
 *
 * Returns reactive refs for the field's value / errors / invalid state plus
 * computed prop bags (`inputProps`, `labelProps`, `errorProps`,
 * `descriptionProps`, `controlProps`) ready for `v-bind`, and imperative
 * `setValue` / `setTouched` / `getOptionProps`. Must be used under a
 * `<FormFlow>` provider (or a standalone `useFormFlow({ form })` in the same
 * setup tree).
 */

import { computed, inject, type ComputedRef, type Ref } from 'vue';
import type { FormField } from '@formflowjs/core';
import { FORM_FLOW_KEY, type FormFlowContext } from './context';
import {
  controlProps as buildControlProps,
  descriptionProps as buildDescriptionProps,
  errorProps as buildErrorProps,
  fieldIds,
  inputProps as buildInputProps,
  labelProps as buildLabelProps,
  optionProps as buildOptionProps,
  readFieldStatus,
  type PropBag,
} from './prop-getters';

/** The shape returned by {@link useFormFlowField}. */
export interface UseFormFlowFieldReturn {
  /** The field definition (or `undefined` if the name is unknown). */
  field: ComputedRef<FormField | undefined>;
  /** The field's current value. */
  value: Ref<unknown>;
  /** All error messages for the field. */
  errors: ComputedRef<string[]>;
  /** The first error message, if any. */
  error: ComputedRef<string | undefined>;
  /** True when the field has errors. */
  invalid: ComputedRef<boolean>;
  touched: ComputedRef<boolean>;
  dirty: ComputedRef<boolean>;
  /** True when the field is currently visible (passes conditional logic). */
  visible: ComputedRef<boolean>;
  /** Attributes for the input/select/textarea (`v-bind`). */
  inputProps: ComputedRef<PropBag>;
  /** Attributes for the `<label>` (`v-bind`). */
  labelProps: ComputedRef<PropBag>;
  /** Attributes for the error element (`v-bind`). */
  errorProps: ComputedRef<PropBag>;
  /** Attributes for the description/help element (`v-bind`). */
  descriptionProps: ComputedRef<PropBag>;
  /** Wrapper attributes (`role=group` for choice fields). */
  controlProps: ComputedRef<PropBag>;
  /** Set the field's value (recomputes visibility, may re-validate). */
  setValue: (value: unknown) => void;
  /** Mark the field touched (default `true`); may trigger blur validation. */
  setTouched: (touched?: boolean) => void;
  /** Fine-grained input props with overrides merged in. */
  getInputProps: (overrides?: PropBag) => PropBag;
  /** Per-option props for a choice entry (radio/checkbox/select option). */
  getOptionProps: (optionValue: string) => PropBag;
}

/** Internal: build the field return surface from a known context. */
export function buildFieldReturn(
  ctx: FormFlowContext,
  name: string
): UseFormFlowFieldReturn {
  const { store, state, idBase } = ctx;

  const field = computed<FormField | undefined>(() => store.getField(name));
  const ids = fieldIds(idBase, name);

  // A single status snapshot recomputed whenever the bridged state changes.
  const status = computed(() => {
    const def = field.value;
    if (!def) {
      return {
        field: { name } as FormField,
        value: state.value.values[name],
        errors: [] as string[],
        error: undefined,
        invalid: false,
        touched: false,
        dirty: false,
        visible: false,
      };
    }
    return readFieldStatus(state.value, def);
  });

  const setValue = (value: unknown) => store.setFieldValue(name, value);
  const setTouched = (touched = true) => store.setFieldTouched(name, touched);
  const handlers = { setValue, setTouched };

  const value = computed({
    get: () => status.value.value,
    set: (next: unknown) => setValue(next),
  });

  return {
    field,
    value,
    errors: computed(() => status.value.errors),
    error: computed(() => status.value.error),
    invalid: computed(() => status.value.invalid),
    touched: computed(() => status.value.touched),
    dirty: computed(() => status.value.dirty),
    visible: computed(() => status.value.visible),
    inputProps: computed(() => buildInputProps(status.value, ids, handlers)),
    labelProps: computed(() => buildLabelProps(ids)),
    errorProps: computed(() => buildErrorProps(ids)),
    descriptionProps: computed(() => buildDescriptionProps(ids)),
    controlProps: computed(() => buildControlProps(status.value, ids)),
    setValue,
    setTouched,
    getInputProps: (overrides?: PropBag) =>
      buildInputProps(status.value, ids, handlers, overrides),
    getOptionProps: (optionValue: string) =>
      buildOptionProps(status.value, ids, optionValue, handlers),
  };
}

/**
 * Bind to a single field by name. Reads the form context from injection.
 *
 * @throws if there is no `<FormFlow>` provider in the component tree.
 */
export function useFormFlowField(name: string): UseFormFlowFieldReturn {
  const ctx = inject(FORM_FLOW_KEY, null);
  if (!ctx) {
    throw new Error(
      `[formflow] useFormFlowField('${name}') must be called within a <FormFlow> provider.`
    );
  }
  return buildFieldReturn(ctx, name);
}
