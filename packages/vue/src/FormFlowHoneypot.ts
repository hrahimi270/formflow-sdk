/**
 * `<FormFlowHoneypot />` — renders the spam-trap input declared by the schema.
 *
 * Unlike the other components this one DOES render an element: a single hidden
 * text input whose `name` is `settings.spam.honeypotFieldName` (default
 * `_gotcha`). Real users never see or fill it; bots that auto-fill every input
 * trip it. When the schema has no honeypot configured it renders nothing.
 *
 * The input is hidden three ways for robustness (off-screen styles, `aria-hidden`
 * and `tabindex="-1"`) and uses `autocomplete="off"` so password managers leave
 * it alone. Its value is wired through the store so it ships in the submit body.
 *
 * Renderless of meaning, but DOM-emitting; SSR/Nuxt-safe (no globals at module
 * top level). Inline styles only — the SDK ships no CSS.
 */

import { computed, defineComponent, h, inject } from 'vue';
import { DEFAULT_HONEYPOT_FIELD } from '@formflowjs/core';
import { FORM_FLOW_KEY } from './context';

/** Off-screen, non-interactive styles to hide the honeypot from real users. */
const HIDDEN_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
} as const;

export const FormFlowHoneypot = defineComponent({
  name: 'FormFlowHoneypot',
  setup() {
    const ctx = inject(FORM_FLOW_KEY, null);
    if (!ctx) {
      throw new Error('[formflow] <FormFlowHoneypot> must be used inside <FormFlow>.');
    }
    const { store, state } = ctx;

    const spam = store.schema.settings?.spam;
    const enabled = !!spam?.honeypot;
    const name = spam?.honeypotFieldName || DEFAULT_HONEYPOT_FIELD;

    const value = computed(() => {
      const v = state.value.values[name];
      return typeof v === 'string' ? v : '';
    });

    return () => {
      if (!enabled) return null;
      return h('input', {
        type: 'text',
        name,
        value: value.value,
        tabindex: -1,
        autocomplete: 'off',
        'aria-hidden': 'true',
        style: HIDDEN_STYLE,
        onInput: (event: Event) => {
          store.setFieldValue(name, (event.target as HTMLInputElement).value);
        },
      });
    };
  },
});

export default FormFlowHoneypot;
