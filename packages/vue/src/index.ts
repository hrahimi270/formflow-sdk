/**
 * @formflowjs/vue — headless Vue 3 adapter for FormFlow.
 *
 * A thin binding over {@link @formflowjs/core}'s framework-agnostic store. It ships
 * NO CSS and renders NO markup of its own (except the hidden honeypot input):
 * you provide every element and `v-bind` the accessibility-wired prop bags this
 * package computes. SSR/Nuxt-safe — never touches `window`/`document` at module
 * top level.
 *
 * Quick start:
 * ```vue
 * <script setup lang="ts">
 * import { FormFlow, FormFlowField, FormFlowHoneypot } from '@formflowjs/vue';
 * import type { FormSchema } from '@formflowjs/vue';
 * const props = defineProps<{ form: FormSchema }>();
 * </script>
 *
 * <template>
 *   <FormFlow :form="form" :options="{ baseUrl: 'https://cms.example.com' }" v-slot="f">
 *     <form v-bind="f.formProps">
 *       <FormFlowField name="email" v-slot="field">
 *         <label v-bind="field.labelProps">{{ field.field.value?.label }}</label>
 *         <input v-bind="field.inputProps" />
 *         <span v-if="field.invalid.value" v-bind="field.errorProps">{{ field.error.value }}</span>
 *       </FormFlowField>
 *       <FormFlowHoneypot />
 *       <button type="submit">Submit</button>
 *     </form>
 *   </FormFlow>
 * </template>
 * ```
 */

/* ---- components ---- */
export { FormFlow } from './FormFlow';
export { FormFlowField } from './FormFlowField';
export { FormFlowStep, type FormFlowStepSlot } from './FormFlowStep';
export { FormFlowHoneypot } from './FormFlowHoneypot';

/* ---- composables ---- */
export {
  useFormFlow,
  createFormFlowContext,
  buildFormFlowReturn,
  type UseFormFlowOptions,
  type UseFormFlowReturn,
} from './use-form-flow';
export {
  useFormFlowField,
  type UseFormFlowFieldReturn,
} from './use-form-flow-field';

/* ---- context (advanced / custom providers) ---- */
export { FORM_FLOW_KEY, type FormFlowContext } from './context';

/* ---- prop-getter types ---- */
export type { PropBag, FieldStatus, FieldIds } from './prop-getters';

/* ---- re-export the core surface so consumers need only one dependency ---- */
export * from '@formflowjs/core';
