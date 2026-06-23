'use client';

/**
 * {@link FormFlowProvider} — creates (and owns) a {@link FormFlowStore} from a
 * schema, or wraps an externally-supplied store, and publishes it through React
 * context so the hooks and renderless components can bind to it.
 *
 * SSR/RSC note: this is a Client Component (`"use client"`). The store itself is
 * SSR-safe — it touches no browser globals — but the reactive bindings
 * (`useSyncExternalStore`) only make sense on the client, so mount the provider
 * inside a client boundary.
 */

import { useMemo, useRef, type ReactNode } from 'react';
import {
  createFormStore,
  type FormFlowStore,
  type FormSchema,
  type FormStoreOptions,
} from '@formflowjs/core';
import { FormFlowContext } from './context';

export interface FormFlowProviderProps {
  /**
   * The public form schema (from `client.getForm(slug)`). Required unless an
   * external `store` is supplied.
   */
  form?: FormSchema;
  /**
   * Origin of the FormFlow content API, e.g. `'https://cms.example.com'` or `''`
   * for same-origin. Forwarded to the store's lazily-created client. Ignored
   * when `options.client` or an external `store` is provided.
   */
  baseUrl?: string;
  /** Store options (validation timing, callbacks, locale, captcha, …). */
  options?: FormStoreOptions;
  /**
   * Bring-your-own store. When provided, `form`/`baseUrl`/`options` are ignored
   * and the provider simply publishes this instance. Useful for sharing one
   * store across boundaries or driving it from outside React.
   */
  store?: FormFlowStore;
  children: ReactNode;
}

/**
 * Provide a {@link FormFlowStore} to descendants.
 *
 * The store is created once and reused across re-renders. It is rebuilt only
 * when the `form` schema identity changes (or `baseUrl` changes), so passing a
 * fresh inline `options` object every render does NOT recreate the store — read
 * the latest callbacks from a ref instead if you need them to update.
 */
export function FormFlowProvider(props: FormFlowProviderProps): ReactNode {
  const { form, baseUrl, options, store: externalStore, children } = props;

  // Keep the newest options visible to the (stable) created store without
  // forcing a rebuild every render.
  const optionsRef = useRef<FormStoreOptions | undefined>(options);
  optionsRef.current = options;

  const internalStore = useMemo<FormFlowStore | null>(() => {
    if (externalStore) return null;
    if (!form) {
      throw new Error(
        '[formflow] <FormFlowProvider> requires a `form` schema (or an external `store`).'
      );
    }
    return createFormStore(form, {
      baseUrl,
      ...optionsRef.current,
      // Wrap the callbacks so they always read the latest props.
      onSubmitSuccess: (result, values) =>
        optionsRef.current?.onSubmitSuccess?.(result, values),
      onSubmitError: (error) => optionsRef.current?.onSubmitError?.(error),
    });
    // Recreate only on schema or baseUrl identity change. `externalStore`
    // toggles the branch; options are read via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, baseUrl, externalStore]);

  const store = externalStore ?? internalStore;
  if (!store) {
    // Unreachable in practice: either an external store or a created one exists.
    throw new Error('[formflow] <FormFlowProvider> has no store to provide.');
  }

  return <FormFlowContext.Provider value={store}>{children}</FormFlowContext.Provider>;
}
