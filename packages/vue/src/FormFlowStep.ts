/**
 * `<FormFlowStep v-slot="step">` — renderless multi-step navigation binding.
 *
 * Exposes the current step's index/total, its visible fields, first/last flags,
 * and prop bags for the Next / Previous / Submit buttons. For a single-layout
 * form there is exactly one step (`total === 1`), so the same template degrades
 * gracefully. Renderless; SSR/Nuxt-safe.
 *
 * Slot surface:
 *   { index, total, fields, isFirst, isLast,
 *     nextProps, prevProps, submitProps,
 *     getNextProps(), getPrevProps(), getSubmitProps() }
 */

import { computed, defineComponent, inject } from 'vue';
import type { FormField } from '@formflowjs/core';
import { FORM_FLOW_KEY } from './context';
import type { PropBag } from './prop-getters';

/** The scoped-slot surface for {@link FormFlowStep}. */
export interface FormFlowStepSlot {
  index: number;
  total: number;
  fields: FormField[];
  isFirst: boolean;
  isLast: boolean;
  nextProps: PropBag;
  prevProps: PropBag;
  submitProps: PropBag;
  getNextProps: (overrides?: PropBag) => PropBag;
  getPrevProps: (overrides?: PropBag) => PropBag;
  getSubmitProps: (overrides?: PropBag) => PropBag;
}

export const FormFlowStep = defineComponent({
  name: 'FormFlowStep',
  setup(_props, { slots }) {
    const ctx = inject(FORM_FLOW_KEY, null);
    if (!ctx) {
      throw new Error('[formflow] <FormFlowStep> must be used inside <FormFlow>.');
    }
    const { store, state } = ctx;

    const slotProps = computed<FormFlowStepSlot>(() => {
      // Depend on the bridged state so this recomputes on step/visibility change.
      const snapshot = state.value;
      const index = snapshot.currentStep;
      const total = snapshot.stepCount;
      const isFirst = index === 0;
      const isLast = index >= total - 1;

      const getNextProps = (overrides: PropBag = {}): PropBag => ({
        type: 'button',
        disabled: snapshot.isValidating || undefined,
        'aria-disabled': isLast || undefined,
        onClick: () => {
          void store.nextStep();
        },
        ...overrides,
      });

      const getPrevProps = (overrides: PropBag = {}): PropBag => ({
        type: 'button',
        disabled: isFirst || undefined,
        'aria-disabled': isFirst || undefined,
        onClick: () => store.prevStep(),
        ...overrides,
      });

      const getSubmitProps = (overrides: PropBag = {}): PropBag => ({
        type: 'submit',
        disabled: snapshot.isSubmitting || undefined,
        ...overrides,
      });

      return {
        index,
        total,
        fields: store.getStepFields(),
        isFirst,
        isLast,
        nextProps: getNextProps(),
        prevProps: getPrevProps(),
        submitProps: getSubmitProps(),
        getNextProps,
        getPrevProps,
        getSubmitProps,
      };
    });

    return () => slots.default?.(slotProps.value);
  },
});

export default FormFlowStep;
