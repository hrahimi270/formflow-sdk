<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { createFormFlowClient, isFormFlowError, type FormSchema } from '@formflowjs/vue';
import FormView from './FormView.vue';

// Point this at your CMS origin (e.g. `https://cms.example.com`) or leave it as
// the localhost dev instance. Overridable via Vite env vars.
const BASE_URL = import.meta.env.VITE_FORMFLOW_BASE_URL ?? 'http://localhost:1337';
const SLUG = import.meta.env.VITE_FORMFLOW_SLUG ?? 'test-free-fields-form';

const client = createFormFlowClient({ baseUrl: BASE_URL });

const schema = ref<FormSchema | null>(null);
const error = ref<string | null>(null);
const controller = new AbortController();

onMounted(async () => {
  try {
    schema.value = await client.getForm(SLUG, { signal: controller.signal });
  } catch (err: unknown) {
    if (controller.signal.aborted) return;
    error.value = isFormFlowError(err) ? `${err.code}: ${err.message}` : String(err);
  }
});

onUnmounted(() => controller.abort());
</script>

<template>
  <main class="ff-page">
    <h1 class="ff-page__title">FormFlow · Vue + Vite</h1>
    <p class="ff-page__hint">
      Loading <code>{{ SLUG }}</code> from <code>{{ BASE_URL }}</code>
    </p>

    <p v-if="error" class="ff-alert ff-alert--error">Failed to load form: {{ error }}</p>
    <p v-else-if="!schema" class="ff-page__hint">Loading form…</p>
    <FormView v-else :schema="schema" :base-url="BASE_URL" />
  </main>
</template>
