/**
 * Bridge a framework-agnostic {@link FormFlowStore} into Vue reactivity.
 *
 * The core store is an immutable-state observer: every mutation REPLACES its
 * state object and notifies subscribers. We mirror that into a `shallowRef`
 * seeded with the current snapshot, then on each `store.subscribe` notification
 * re-read `getState()` and `triggerRef` so templates depending on `state.value`
 * re-evaluate. A `shallowRef` (not `ref`) is correct here: the store hands us a
 * fresh object on every change, so deep reactivity would only add overhead.
 *
 * SSR-safe: subscription lives inside `onScopeDispose`/lifecycle, never at module
 * top level. The initial snapshot is read synchronously so the first server
 * render already reflects the store's state.
 */

import {
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  triggerRef,
  type ShallowRef,
} from 'vue';
import type { FormFlowState, FormFlowStore } from '@formflowjs/core';

/**
 * Create a {@link ShallowRef} mirroring a store's state. The subscription is
 * automatically torn down when the surrounding effect scope (component) is
 * disposed.
 */
export function useStoreState(store: FormFlowStore): ShallowRef<FormFlowState> {
  const state = shallowRef<FormFlowState>(store.getState());

  const unsubscribe = store.subscribe(() => {
    // The store always replaces its state object, so reassigning is enough to
    // change identity; triggerRef guarantees dependents re-run even if a
    // consumer mutated `.value` in place elsewhere.
    state.value = store.getState();
    triggerRef(state);
  });

  // Clean up when the owning component/effect scope is torn down. Guard for the
  // (rare) case of being called outside a scope so we never leak a listener.
  if (getCurrentScope()) {
    onScopeDispose(unsubscribe);
  }

  return state;
}
