/**
 * Shared injection context for the Vue adapter.
 *
 * The {@link FormFlow} component creates a {@link FormFlowStore} and `provide()`s
 * the bridged context below; composables (`useFormFlow`, `useFormFlowField`) and
 * the renderless components (`FormFlowField`, `FormFlowStep`, `FormFlowHoneypot`)
 * read it back via `inject()`. When no provider is present, `useFormFlow({ form })`
 * can create a standalone context on the fly.
 */

import type { InjectionKey, ShallowRef } from 'vue';
import type { FormFlowState, FormFlowStore } from '@formflowjs/core';

/**
 * The reactive context shared through provide/inject. `state` is a
 * {@link ShallowRef} kept in sync with the core store (see `use-store-state.ts`),
 * so any template reading `state.value` re-renders on every store mutation.
 */
export interface FormFlowContext {
  /** The framework-agnostic engine. */
  store: FormFlowStore;
  /** A shallowRef mirroring `store.getState()`, updated on every store change. */
  state: ShallowRef<FormFlowState>;
  /**
   * A stable id prefix unique to this form instance, used to derive element ids
   * (`${idBase}-${name}`, `${idBase}-${name}-error`, …) so labels/inputs/errors
   * wire up via `for`/`aria-describedby` without colliding across forms.
   */
  idBase: string;
}

/** The provide/inject key for the form context. */
export const FORM_FLOW_KEY: InjectionKey<FormFlowContext> =
  Symbol('formflow:context');
