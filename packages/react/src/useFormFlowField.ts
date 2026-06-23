'use client';

/**
 * {@link useFormFlowField} — per-field binding. Resolves a field's value, error,
 * and interaction flags from the store, and returns a complete set of headless
 * prop getters (`getInputProps`, `getCheckboxProps`, …) that wire your own
 * markup with full ARIA + `data-*` state. No DOM is touched at module level;
 * ids come from React's `useId()`.
 *
 * The SDK ships no markup and no CSS — every visual state is exposed via boolean
 * flags and `data-invalid` / `data-touched` / `data-dirty` attributes for you to
 * style.
 */

import { useCallback, useId, useMemo } from 'react';
import type {
  ChangeEvent,
  FocusEvent,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import {
  isChoiceField,
  isMultiValueField,
  type FormField,
} from '@formflowjs/core';
import { useFormFlowStoreContext, useStoreState } from './useFormFlowStore';

/* ------------------------------------------------------------------ *
 * Returned prop-getter types (headless: you spread these on your own
 * elements). All getters accept overrides that are merged last.
 * ------------------------------------------------------------------ */

/** State data-attributes attached to every control by the getters. */
export interface FieldDataAttributes {
  'data-invalid': boolean | undefined;
  'data-touched': boolean | undefined;
  'data-dirty': boolean | undefined;
  'data-required': boolean | undefined;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldDataAttributes;
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldDataAttributes;
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldDataAttributes;

export interface LabelProps {
  htmlFor: string;
  id: string;
}

export interface ErrorProps {
  id: string;
  role: 'alert';
  'aria-live': 'polite';
}

export interface DescriptionProps {
  id: string;
}

export interface ControlProps {
  role: 'group';
  'aria-labelledby': string;
  'aria-describedby': string | undefined;
  'data-invalid': boolean | undefined;
}

export interface OptionProps {
  id: string;
  htmlFor: string;
  'data-value': string;
}

/** The full surface returned by {@link useFormFlowField}. */
export interface UseFormFlowFieldReturn {
  field: FormField;
  value: unknown;
  errors: string[];
  /** First error message, if any. */
  error: string | undefined;
  invalid: boolean;
  touched: boolean;
  dirty: boolean;
  /** Whether the field is currently visible (per conditional logic). */
  visible: boolean;

  setValue(value: unknown): void;
  setTouched(touched?: boolean): void;

  // prop getters
  getInputProps(overrides?: Partial<InputProps>): InputProps;
  getTextareaProps(overrides?: Partial<TextareaProps>): TextareaProps;
  getSelectProps(overrides?: Partial<SelectProps>): SelectProps;
  getCheckboxProps(optionValue?: string, overrides?: Partial<InputProps>): InputProps;
  getRadioProps(optionValue: string, overrides?: Partial<InputProps>): InputProps;
  getOptionProps(optionValue: string, overrides?: Partial<OptionProps>): OptionProps;
  getControlProps(overrides?: Partial<ControlProps>): ControlProps;
  getLabelProps(overrides?: Partial<LabelProps>): LabelProps;
  getErrorProps(overrides?: Partial<ErrorProps>): ErrorProps;
  getDescriptionProps(overrides?: Partial<DescriptionProps>): DescriptionProps;
  getFileProps(overrides?: Partial<InputProps>): InputProps;
}

/** Coerce a stored value into the array shape multi-value controls expect. */
function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

/** A flag is only emitted as a `data-*` attribute when true (else `undefined`). */
function flag(on: boolean): true | undefined {
  return on ? true : undefined;
}

/**
 * Bind a single field by name. Throws if the name is not in the schema so typos
 * fail loudly during development.
 */
export function useFormFlowField(name: string): UseFormFlowFieldReturn {
  const store = useFormFlowStoreContext();
  const state = useStoreState(store);

  const field = store.getField(name);
  if (!field) {
    throw new Error(`[formflow] Unknown field "${name}". Check the schema field names.`);
  }

  // Stable base id for this field instance; per-element ids derive from it.
  const baseId = useId();
  const inputId = `${baseId}-${name}`;
  const labelId = `${inputId}-label`;
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;

  const errors = state.errors[name] ?? [];
  const invalid = errors.length > 0;
  const touched = Boolean(state.touched[name]);
  const dirty = Boolean(state.dirty[name]);
  const visible = state.visibleFieldNames.includes(name);
  const value = state.values[name];
  const hasDescription = Boolean(field.description);

  const setValue = useCallback(
    (next: unknown) => store.setFieldValue(name, next),
    [store, name]
  );
  const setTouched = useCallback(
    (next: boolean = true) => store.setFieldTouched(name, next),
    [store, name]
  );

  // `aria-describedby` points at the error (when present) and/or description.
  const describedBy =
    [invalid ? errorId : null, hasDescription ? descriptionId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  const dataAttrs: FieldDataAttributes = {
    'data-invalid': flag(invalid),
    'data-touched': flag(touched),
    'data-dirty': flag(dirty),
    'data-required': flag(field.required),
  };

  return useMemo<UseFormFlowFieldReturn>(() => {
    const onTextChange = (
      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => store.setFieldValue(name, e.target.value);
    const onBlur = (
      _e: FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => store.setFieldTouched(name, true);

    /** Props shared by every text-like control (input/textarea/select). */
    const commonControlProps = {
      id: inputId,
      name,
      required: field.required || undefined,
      'aria-invalid': invalid || undefined,
      'aria-required': field.required || undefined,
      'aria-describedby': describedBy,
      onBlur,
      ...dataAttrs,
    } as const;

    const getInputProps = (overrides?: Partial<InputProps>): InputProps => ({
      ...commonControlProps,
      value: value === undefined || value === null ? '' : (value as string | number),
      onChange: onTextChange,
      ...overrides,
    });

    const getTextareaProps = (overrides?: Partial<TextareaProps>): TextareaProps => ({
      ...commonControlProps,
      value: value === undefined || value === null ? '' : (value as string | number),
      onChange: onTextChange,
      ...overrides,
    });

    const getSelectProps = (overrides?: Partial<SelectProps>): SelectProps => ({
      ...commonControlProps,
      value: value === undefined || value === null ? '' : (value as string | number),
      onChange: onTextChange,
      ...overrides,
    });

    /**
     * Checkbox: with `optionValue` this is one item of a checkbox GROUP (value is
     * a string[] toggled by membership). Without it, it's a single boolean
     * checkbox (`boolean`/`consent`).
     */
    const getCheckboxProps = (
      optionValue?: string,
      overrides?: Partial<InputProps>
    ): InputProps => {
      if (optionValue !== undefined) {
        const selected = asArray(value);
        const checked = selected.includes(optionValue);
        return {
          ...commonControlProps,
          id: `${inputId}-${optionValue}`,
          type: 'checkbox',
          value: optionValue,
          checked,
          'aria-describedby': describedBy,
          onChange: (e: ChangeEvent<HTMLInputElement>) => {
            const next = e.target.checked
              ? [...selected, optionValue]
              : selected.filter((v) => v !== optionValue);
            store.setFieldValue(name, next);
          },
          ...overrides,
        };
      }
      // Single boolean checkbox.
      return {
        ...commonControlProps,
        type: 'checkbox',
        checked: Boolean(value),
        onChange: (e: ChangeEvent<HTMLInputElement>) =>
          store.setFieldValue(name, e.target.checked),
        ...overrides,
      };
    };

    const getRadioProps = (
      optionValue: string,
      overrides?: Partial<InputProps>
    ): InputProps => ({
      ...commonControlProps,
      id: `${inputId}-${optionValue}`,
      type: 'radio',
      value: optionValue,
      checked: String(value ?? '') === optionValue,
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        store.setFieldValue(name, e.target.value),
      ...overrides,
    });

    /** Label props for an individual choice OPTION (checkbox/radio item). */
    const getOptionProps = (
      optionValue: string,
      overrides?: Partial<OptionProps>
    ): OptionProps => ({
      id: `${inputId}-${optionValue}-label`,
      htmlFor: `${inputId}-${optionValue}`,
      'data-value': optionValue,
      ...overrides,
    });

    /** Wrapper props for a choice GROUP (radio/checkbox set): a labelled group. */
    const getControlProps = (overrides?: Partial<ControlProps>): ControlProps => ({
      role: 'group',
      'aria-labelledby': labelId,
      'aria-describedby': describedBy,
      'data-invalid': flag(invalid),
      ...overrides,
    });

    const getLabelProps = (overrides?: Partial<LabelProps>): LabelProps => ({
      // For a choice group the label labels the group via `aria-labelledby`, so a
      // matching `htmlFor`/`id` are still emitted for single-control fields.
      htmlFor: inputId,
      id: labelId,
      ...overrides,
    });

    const getErrorProps = (overrides?: Partial<ErrorProps>): ErrorProps => ({
      id: errorId,
      role: 'alert',
      'aria-live': 'polite',
      ...overrides,
    });

    const getDescriptionProps = (
      overrides?: Partial<DescriptionProps>
    ): DescriptionProps => ({
      id: descriptionId,
      ...overrides,
    });

    /** File input: `type=file`, `multiple` for groups, no controlled `value`. */
    const getFileProps = (overrides?: Partial<InputProps>): InputProps => ({
      ...commonControlProps,
      type: 'file',
      multiple: isMultiValueField(field.type) || undefined,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) {
          store.setFieldValue(name, undefined);
        } else if (files.length === 1) {
          store.setFieldValue(name, files[0]);
        } else {
          store.setFieldValue(name, Array.from(files));
        }
      },
      ...overrides,
    });

    return {
      field,
      value,
      errors,
      error: errors[0],
      invalid,
      touched,
      dirty,
      visible,
      setValue,
      setTouched,
      getInputProps,
      getTextareaProps,
      getSelectProps,
      getCheckboxProps,
      getRadioProps,
      getOptionProps,
      getControlProps,
      getLabelProps,
      getErrorProps,
      getDescriptionProps,
      getFileProps,
    };
    // Recompute the getters whenever the field's visible state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store,
    name,
    field,
    value,
    errors,
    invalid,
    touched,
    dirty,
    visible,
    describedBy,
    inputId,
    labelId,
    errorId,
    descriptionId,
    setValue,
    setTouched,
  ]);
}

// Re-export the choice-field guard so adapters/consumers can branch rendering.
export { isChoiceField };
