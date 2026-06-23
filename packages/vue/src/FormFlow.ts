/**
 * `<FormFlow>` — the renderless provider component.
 *
 * Creates a {@link FormFlowStore} from the `form` schema + `options`, bridges it
 * into Vue reactivity, `provide()`s the context for descendant composables and
 * components, and renders its default scoped slot with the same surface as
 * {@link useFormFlow}. Renderless: it emits ONLY its slot content (no wrapper
 * element), so you bring your own `<form>` and `v-bind="form.formProps"`.
 *
 * Authored as a `defineComponent` in plain TS (no `.vue` SFC): `setup` returns a
 * render function that invokes the default slot. SSR/Nuxt-safe — no browser
 * globals at module top level.
 */

import { defineComponent, provide, type PropType } from 'vue';
import type { FormSchema, FormStoreOptions } from '@formflowjs/core';
import { FORM_FLOW_KEY } from './context';
import {
  buildFormFlowReturn,
  createFormFlowContext,
  type UseFormFlowReturn,
} from './use-form-flow';

export const FormFlow = defineComponent({
  name: 'FormFlow',
  props: {
    /** The public form schema (from `client.getForm`). */
    form: {
      type: Object as PropType<FormSchema>,
      required: true,
    },
    /** Store options: client/baseUrl, validation timing, callbacks, captcha. */
    options: {
      type: Object as PropType<FormStoreOptions>,
      default: () => ({}),
    },
    /** Override the auto-generated element id base (for stable SSR ids). */
    idBase: {
      type: String,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    // Build the store/context ONCE for this component instance. The schema is not
    // expected to change identity for a mounted form; consumers remount to swap.
    const ctx = createFormFlowContext(props.form, props.options, props.idBase);
    provide(FORM_FLOW_KEY, ctx);

    const api: UseFormFlowReturn = buildFormFlowReturn(ctx);

    return () => slots.default?.(api);
  },
});

export default FormFlow;
