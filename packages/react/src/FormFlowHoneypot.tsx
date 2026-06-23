'use client';

/**
 * {@link FormFlowHoneypot} — renders the spam honeypot input declared by the
 * schema (`settings.spam.honeypot` / `honeypotFieldName`, default `_gotcha`).
 *
 * The input is bot-bait: visually hidden (off-screen, zero-size) but NOT
 * `display:none` (some bots skip those), `aria-hidden`, removed from the tab
 * order, and with autofill disabled. A real user never sees or fills it; a bot
 * that does triggers server-side rejection. When the form has no honeypot
 * configured this renders nothing.
 *
 * The wrapper uses an inline style object only (no CSS file) so the package
 * stays headless. You may override the wrapper style/className via props.
 */

import type { CSSProperties, ReactNode } from 'react';
import { DEFAULT_HONEYPOT_FIELD } from '@formflowjs/core';
import { useFormFlow } from './useFormFlow';
import { useFormFlowStoreContext, useStoreState } from './useFormFlowStore';

/** Off-screen, zero-footprint wrapper that keeps the input rendered but unseen. */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export interface FormFlowHoneypotProps {
  /** Override the wrapper class (default: none). */
  className?: string;
  /** Merge extra styles onto the visually-hidden wrapper. */
  style?: CSSProperties;
}

/**
 * Render the schema-defined honeypot field, wired into the store's values so it
 * is included (empty) in the submit payload.
 */
export function FormFlowHoneypot(props: FormFlowHoneypotProps): ReactNode {
  const { className, style } = props;
  const { schema, setFieldValue } = useFormFlow();
  const store = useFormFlowStoreContext();
  const state = useStoreState(store);

  const spam = schema.settings.spam;
  if (!spam?.honeypot) return null;

  const fieldName = spam.honeypotFieldName || DEFAULT_HONEYPOT_FIELD;
  const value = (state.values[fieldName] as string | undefined) ?? '';

  return (
    <div
      className={className}
      style={{ ...VISUALLY_HIDDEN, ...style }}
      aria-hidden="true"
    >
      <label htmlFor={`formflow-hp-${fieldName}`}>Leave this field empty</label>
      <input
        id={`formflow-hp-${fieldName}`}
        type="text"
        name={fieldName}
        value={value}
        onChange={(e) => setFieldValue(fieldName, e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
    </div>
  );
}
