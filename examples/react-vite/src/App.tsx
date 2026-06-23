import { useEffect, useState } from 'react';
import { createFormFlowClient, isFormFlowError, type FormSchema } from '@formflowjs/react';
import { FormView } from './FormView';

/**
 * Where the FormFlow Strapi plugin is served from. Point this at your CMS origin
 * (e.g. `https://cms.example.com`) or leave it as the localhost dev instance.
 * Read from `VITE_FORMFLOW_BASE_URL` / `VITE_FORMFLOW_SLUG` when provided.
 */
const BASE_URL = import.meta.env.VITE_FORMFLOW_BASE_URL ?? 'http://localhost:1337';
const SLUG = import.meta.env.VITE_FORMFLOW_SLUG ?? 'test-free-fields-form';

const client = createFormFlowClient({ baseUrl: BASE_URL });

/**
 * Top-level example: fetch a form schema by slug from `baseUrl`, then hand it to
 * the headless renderer. All loading/error state is handled here; the actual
 * form markup lives in {@link FormView}.
 */
export function App() {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSchema(null);
    setError(null);

    client
      .getForm(SLUG, { signal: controller.signal })
      .then(setSchema)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(isFormFlowError(err) ? `${err.code}: ${err.message}` : String(err));
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="ff-page">
      <h1 className="ff-page__title">FormFlow · React + Vite</h1>
      <p className="ff-page__hint">
        Loading <code>{SLUG}</code> from <code>{BASE_URL}</code>
      </p>

      {error && <p className="ff-alert ff-alert--error">Failed to load form: {error}</p>}
      {!error && !schema && <p className="ff-page__hint">Loading form…</p>}
      {schema && <FormView schema={schema} baseUrl={BASE_URL} />}
    </main>
  );
}
