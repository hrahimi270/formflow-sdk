'use client';

/**
 * {@link FormFlowField} — renderless per-field component. Supports BOTH a
 * `render` prop and children-as-function, handing your render function the full
 * field surface from {@link useFormFlowField} (value, errors, flags, and every
 * prop getter). You own all markup; the SDK owns the wiring.
 *
 * By default a hidden field renders nothing. Pass `alwaysRender` to keep calling
 * your render function even while the field is conditionally hidden (useful if
 * you animate visibility yourself).
 */

import type { ReactNode } from 'react';
import { useFormFlowField, type UseFormFlowFieldReturn } from './useFormFlowField';

export interface FormFlowFieldProps {
  /** Field `name` (submission key) to bind. */
  name: string;
  /** Render prop. Mutually compatible with `children`; one is required. */
  render?: (field: UseFormFlowFieldReturn) => ReactNode;
  /** Children-as-function (alternative to `render`). */
  children?: (field: UseFormFlowFieldReturn) => ReactNode;
  /** Keep rendering even when the field is conditionally hidden. Default false. */
  alwaysRender?: boolean;
}

/**
 * Bind a field and delegate rendering to `render`/`children`.
 *
 * @example
 * ```tsx
 * <FormFlowField name="email" render={(f) => (
 *   <label {...f.getLabelProps()}>{f.field.label}</label>
 * )} />
 * // or children-as-function:
 * <FormFlowField name="email">{(f) => <input {...f.getInputProps()} />}</FormFlowField>
 * ```
 */
export function FormFlowField(props: FormFlowFieldProps): ReactNode {
  const { name, render, children, alwaysRender = false } = props;
  const fieldApi = useFormFlowField(name);

  if (!fieldApi.visible && !alwaysRender) return null;

  const renderFn = render ?? children;
  if (typeof renderFn !== 'function') {
    throw new Error(
      `[formflow] <FormFlowField name="${name}"> needs a \`render\` prop or a function child.`
    );
  }
  return renderFn(fieldApi);
}
