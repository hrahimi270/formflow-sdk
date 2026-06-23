<script setup lang="ts">
import {
  FormFlow,
  FormFlowField,
  FormFlowHoneypot,
  isChoiceField,
  type FormSchema,
} from '@formflowjs/vue';

// Headless rendering: every element below is OUR markup with utility
// (Tailwind-ish) class names. `@formflowjs/vue` ships no CSS — it only computes the
// `v-bind` prop bags (value, handlers, accessibility, `data-*` state).
defineProps<{ schema: FormSchema; baseUrl: string }>();
</script>

<template>
  <FormFlow
    :form="schema"
    :options="{ baseUrl, validateOn: 'blur' }"
    v-slot="form"
  >
    <p v-if="form.status.value === 'success'" class="ff-alert ff-alert--success">
      {{ form.result.value?.message ?? 'Thank you for your submission!' }}
    </p>

    <form v-else v-bind="form.formProps.value" class="ff-form">
      <FormFlowField
        v-for="f in form.fields.value"
        :key="f.name"
        :name="f.name"
        v-slot="field"
      >
        <!-- Display-only heading fields have no input. -->
        <h2 v-if="f.type === 'heading'" class="ff-form__heading">{{ f.label }}</h2>

        <div v-else class="ff-field" :data-invalid="field.invalid.value || undefined">
          <label v-bind="field.labelProps.value" class="ff-field__label">
            {{ f.label }}
            <span v-if="f.required" class="ff-field__req"> *</span>
          </label>

          <!-- textarea -->
          <textarea
            v-if="f.type === 'textarea'"
            v-bind="field.inputProps.value"
            class="ff-input ff-input--area"
            rows="4"
          />

          <!-- select -->
          <select
            v-else-if="f.type === 'select'"
            v-bind="field.inputProps.value"
            class="ff-input"
          >
            <option value="">Select…</option>
            <option v-for="opt in f.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>

          <!-- checkbox / radio choice group -->
          <div
            v-else-if="isChoiceField(f.type) && f.options"
            v-bind="field.controlProps.value"
            class="ff-choices"
          >
            <label
              v-for="opt in f.options"
              :key="opt.value"
              class="ff-choice"
            >
              <input v-bind="field.getOptionProps(opt.value)" class="ff-choice__box" />
              <span>{{ opt.label }}</span>
            </label>
          </div>

          <!-- file -->
          <input
            v-else-if="f.type === 'file'"
            v-bind="field.getInputProps({ type: 'file' })"
            class="ff-input ff-input--file"
          />

          <!-- plain text-like inputs -->
          <input
            v-else
            v-bind="field.getInputProps({
              type: f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text',
            })"
            class="ff-input"
          />

          <p v-if="f.description" v-bind="field.descriptionProps.value" class="ff-field__hint">
            {{ f.description }}
          </p>
          <p v-if="field.invalid.value" v-bind="field.errorProps.value" class="ff-field__error">
            {{ field.error.value }}
          </p>
        </div>
      </FormFlowField>

      <!-- Renders the schema-declared spam honeypot (hidden), if configured. -->
      <FormFlowHoneypot />

      <button type="submit" class="ff-form__submit" :disabled="form.isSubmitting.value">
        {{ form.isSubmitting.value ? 'Submitting…' : (schema.settings.submitButtonText || 'Submit') }}
      </button>
    </form>
  </FormFlow>
</template>
