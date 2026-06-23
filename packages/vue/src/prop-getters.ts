/**
 * Pure helpers that turn a field + store state into the accessibility-wired
 * attribute objects the Vue adapter exposes for `v-bind`. Framework-agnostic
 * except for the `onUpdate:value` shape — these return plain objects so they can
 * be spread into `v-bind` or returned from a `computed`.
 *
 * No browser globals are touched; everything is derived from the store snapshot.
 */

import {
  isChoiceField,
  isMultiValueField,
  type FormField,
  type FormFlowState,
} from '@formflowjs/core';

/** A bag of HTML attributes ready for `v-bind`. */
export type PropBag = Record<string, unknown>;

/** Derived, read-only view of a single field's current status. */
export interface FieldStatus {
  field: FormField;
  value: unknown;
  errors: string[];
  /** First error message, or `undefined`. */
  error: string | undefined;
  invalid: boolean;
  touched: boolean;
  dirty: boolean;
  visible: boolean;
}

/** Element ids derived for a field (input/label/error/description). */
export interface FieldIds {
  inputId: string;
  labelId: string;
  errorId: string;
  descriptionId: string;
}

/** Compute the stable element ids for a field from the form's id base. */
export function fieldIds(idBase: string, name: string): FieldIds {
  const base = `${idBase}-${name}`;
  return {
    inputId: base,
    labelId: `${base}-label`,
    errorId: `${base}-error`,
    descriptionId: `${base}-description`,
  };
}

/** Read a field's current status out of a store snapshot. */
export function readFieldStatus(state: FormFlowState, field: FormField): FieldStatus {
  const errors = state.errors[field.name] ?? [];
  return {
    field,
    value: state.values[field.name],
    errors,
    error: errors[0],
    invalid: errors.length > 0,
    touched: state.touched[field.name] ?? false,
    dirty: state.dirty[field.name] ?? false,
    visible: state.visibleFieldNames.includes(field.name),
  };
}

/**
 * Build the `aria-describedby` token list: the description id (when the field has
 * help text) and the error id (only while invalid). Returns `undefined` when
 * empty so the attribute is omitted entirely.
 */
function describedBy(field: FormField, ids: FieldIds, invalid: boolean): string | undefined {
  const tokens: string[] = [];
  if (field.description) tokens.push(ids.descriptionId);
  if (invalid) tokens.push(ids.errorId);
  return tokens.length > 0 ? tokens.join(' ') : undefined;
}

/** Shared `data-*` state attributes mirrored onto inputs and controls. */
function stateData(status: FieldStatus): PropBag {
  return {
    'data-invalid': status.invalid ? '' : undefined,
    'data-dirty': status.dirty ? '' : undefined,
    'data-touched': status.touched ? '' : undefined,
  };
}

/**
 * Core input props (text/email/number/textarea/select share this base). The
 * `onUpdate:value` handler lets templates use `v-model` against a custom
 * component; `onInput`/`onBlur` cover native elements. Callers may override any
 * key via the returned object.
 */
export function inputProps(
  status: FieldStatus,
  ids: FieldIds,
  handlers: {
    setValue: (value: unknown) => void;
    setTouched: (touched?: boolean) => void;
  },
  overrides: PropBag = {}
): PropBag {
  const { field } = status;
  const multi = isMultiValueField(field.type);
  return {
    id: ids.inputId,
    name: field.name,
    value: status.value ?? (multi ? [] : ''),
    required: field.required || undefined,
    'aria-required': field.required || undefined,
    'aria-invalid': status.invalid || undefined,
    'aria-describedby': describedBy(field, ids, status.invalid),
    ...stateData(status),
    // Native two-way binding helpers. `onUpdate:value` supports `v-model="..."`
    // on custom inputs; consumers can ignore these and wire their own.
    'onUpdate:value': (value: unknown) => handlers.setValue(value),
    onInput: (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target) handlers.setValue(readNativeValue(target));
    },
    onBlur: () => handlers.setTouched(true),
    ...overrides,
  };
}

/** Read the appropriate value out of a native input/select element. */
function readNativeValue(target: HTMLInputElement | HTMLSelectElement): unknown {
  if (target instanceof HTMLInputElement) {
    if (target.type === 'checkbox') return target.checked;
    if (target.type === 'number') return target.value === '' ? '' : Number(target.value);
  }
  return target.value;
}

/** Label props: ties the `<label for>` to the input and exposes a stable id. */
export function labelProps(ids: FieldIds): PropBag {
  return { id: ids.labelId, for: ids.inputId };
}

/**
 * Error-message props: `role="alert"` + `aria-live="polite"` so assistive tech
 * announces validation messages as they appear.
 */
export function errorProps(ids: FieldIds): PropBag {
  return { id: ids.errorId, role: 'alert', 'aria-live': 'polite' };
}

/** Description/help-text props (referenced by the input's `aria-describedby`). */
export function descriptionProps(ids: FieldIds): PropBag {
  return { id: ids.descriptionId };
}

/**
 * Group wrapper props for choice fields (radio/checkbox groups): `role="group"`
 * plus `aria-labelledby` pointing at the group label. For non-choice fields it
 * still returns the `data-*` state attributes so callers can style wrappers.
 */
export function controlProps(status: FieldStatus, ids: FieldIds): PropBag {
  const base = stateData(status);
  if (isChoiceField(status.field.type)) {
    return {
      role: 'group',
      'aria-labelledby': ids.labelId,
      'aria-invalid': status.invalid || undefined,
      'aria-describedby': describedBy(status.field, ids, status.invalid),
      ...base,
    };
  }
  return base;
}

/**
 * Per-option props for an entry in a choice group. Radios share a `name`;
 * checkboxes toggle membership in the value array; selects compare the scalar
 * value. The returned `checked`/`selected` flags reflect the current value, and
 * `onChange` folds the toggle back through `setValue`.
 */
export function optionProps(
  status: FieldStatus,
  ids: FieldIds,
  optionValue: string,
  handlers: {
    setValue: (value: unknown) => void;
    setTouched: (touched?: boolean) => void;
  }
): PropBag {
  const { field } = status;
  const optionId = `${ids.inputId}-${optionValue}`;

  if (isMultiValueField(field.type)) {
    // Checkbox group → value is an array; toggle membership.
    const current = Array.isArray(status.value) ? (status.value as unknown[]) : [];
    const checked = current.map(String).includes(optionValue);
    return {
      id: optionId,
      type: 'checkbox',
      name: field.name,
      value: optionValue,
      checked,
      'aria-invalid': status.invalid || undefined,
      onChange: (event: Event) => {
        const isChecked = (event.target as HTMLInputElement).checked;
        const next = isChecked
          ? [...current.filter((v) => String(v) !== optionValue), optionValue]
          : current.filter((v) => String(v) !== optionValue);
        handlers.setValue(next);
      },
      onBlur: () => handlers.setTouched(true),
    };
  }

  if (field.type === 'radio') {
    const checked = status.value != null && String(status.value) === optionValue;
    return {
      id: optionId,
      type: 'radio',
      name: field.name,
      value: optionValue,
      checked,
      required: field.required || undefined,
      'aria-invalid': status.invalid || undefined,
      onChange: () => handlers.setValue(optionValue),
      onBlur: () => handlers.setTouched(true),
    };
  }

  // select <option>: expose value + selected flag.
  return {
    value: optionValue,
    selected: status.value != null && String(status.value) === optionValue,
  };
}
