'use client';

/**
 * Low-level binding between a {@link FormFlowStore} and React's concurrent-safe
 * external-store subscription. Returns the store plus its latest immutable
 * state snapshot, re-rendering only when `store.getState()` changes identity.
 *
 * SSR: `useSyncExternalStore` is given a server snapshot (the same
 * `store.getState()`), which is safe because the store's initial state is
 * deterministic and touches no browser globals.
 */

import { useContext, useSyncExternalStore } from 'react';
import type { FormFlowState, FormFlowStore } from '@formflowjs/core';
import { FormFlowContext } from './context';

/** Read the store from context, throwing a helpful error when absent. */
export function useFormFlowStoreContext(): FormFlowStore {
  const store = useContext(FormFlowContext);
  if (!store) {
    throw new Error(
      '[formflow] No store found. Wrap your form in <FormFlowProvider> ' +
        '(or pass a store explicitly).'
    );
  }
  return store;
}

/**
 * Subscribe to a store and return `[store, state]`. The state object is the
 * store's current immutable snapshot; React re-renders when its identity
 * changes. Both client and server snapshots resolve to `store.getState()`.
 */
export function useStoreState(store: FormFlowStore): FormFlowState {
  return useSyncExternalStore(
    store.subscribe,
    store.getState,
    // Server snapshot — identical to the client's initial snapshot. Stable
    // across renders because the store never mutates in place.
    store.getState
  );
}
