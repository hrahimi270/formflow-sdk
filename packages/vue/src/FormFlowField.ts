/**
 * `<FormFlowField name="email" v-slot="field">` — renderless field binding.
 *
 * Resolves the field context (must be under a `<FormFlow>` provider) and renders
 * its default scoped slot with the same surface as {@link useFormFlowField}:
 * value/errors/invalid refs plus `inputProps`, `labelProps`, `errorProps`,
 * `descriptionProps`, `controlProps`, `setValue`, `setTouched`,
 * `getInputProps`, `getOptionProps`.
 *
 * Renderless: emits only its slot content. SSR/Nuxt-safe.
 */

import { defineComponent, inject } from 'vue';
import { FORM_FLOW_KEY } from './context';
import { buildFieldReturn } from './use-form-flow-field';

export const FormFlowField = defineComponent({
  name: 'FormFlowField',
  props: {
    /** The field `name` to bind. */
    name: {
      type: String,
      required: true,
    },
  },
  setup(props, { slots }) {
    const ctx = inject(FORM_FLOW_KEY, null);
    if (!ctx) {
      throw new Error(
        `[formflow] <FormFlowField name="${props.name}"> must be used inside <FormFlow>.`
      );
    }

    const api = buildFieldReturn(ctx, props.name);

    return () => slots.default?.(api);
  },
});

export default FormFlowField;
