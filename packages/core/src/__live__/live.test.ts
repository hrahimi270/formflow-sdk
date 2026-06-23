/**
 * Live integration test against a running FormFlow Strapi instance.
 *
 * SKIPPED BY DEFAULT. It only runs when `FORMFLOW_LIVE=1` is set, so the normal
 * `vitest run` (CI, local unit runs) never touches the network. Point it at a
 * different instance with `FORMFLOW_BASE_URL` (default `http://localhost:1337`).
 *
 *   FORMFLOW_LIVE=1 pnpm --filter @formflowjs/core exec vitest run src/__live__/live.test.ts
 *
 * It exercises the real content-API contract end-to-end against the seeded
 * `test-free-fields-form`:
 *   (a) fetch the schema and assert title + fields + honeypot config;
 *   (b) submit valid data and assert `{ success: true }`;
 *   (c) submit with the required `contact_email` missing and assert the request
 *       rejects with a `FormFlowError` of code `'validation'` carrying
 *       `fieldErrors.contact_email`.
 */

import { describe, expect, it } from 'vitest';
import { createFormFlowClient } from '../client';
import { FormFlowError, isFormFlowError } from '../errors';

const LIVE = process.env.FORMFLOW_LIVE === '1';
const BASE_URL = process.env.FORMFLOW_BASE_URL || 'http://localhost:1337';
const SLUG = 'test-free-fields-form';

// `describe.skipIf(true)` skips the whole block — so by default (no env) the
// suite is reported as skipped and never opens a socket.
describe.skipIf(!LIVE)(`live: ${SLUG} @ ${BASE_URL}`, () => {
  const client = createFormFlowClient({ baseUrl: BASE_URL });

  it('(a) getForm returns the expected schema, fields, and honeypot config', async () => {
    const schema = await client.getForm(SLUG);

    expect(schema.title).toBe('Test Free Fields Form');
    expect(schema.slug).toBe(SLUG);
    expect(Array.isArray(schema.fields)).toBe(true);

    // The seeded form must expose the fields this test relies on.
    const byName = new Map(schema.fields.map((f) => [f.name, f]));
    expect(byName.has('full_name')).toBe(true);

    const contactEmail = byName.get('contact_email');
    expect(contactEmail).toBeDefined();
    expect(contactEmail?.type).toBe('email');
    expect(contactEmail?.required).toBe(true);

    const message = byName.get('message');
    expect(message).toBeDefined();

    // Honeypot spam protection: enabled, with the documented `_gotcha` name.
    expect(schema.settings.spam.honeypot).toBe(true);
    expect(schema.settings.spam.honeypotFieldName).toBe('_gotcha');
  });

  it('(b) submitting valid data returns { success: true }', async () => {
    const schema = await client.getForm(SLUG);

    const result = await client.submit(SLUG, {
      schema,
      values: {
        full_name: 'Probe User',
        contact_email: 'probe@example.com',
        message: 'hello world this is long enough',
      },
    });

    expect(result.success).toBe(true);
    expect(typeof result.message).toBe('string');
  });

  it('(c) submitting without the required contact_email throws a validation FormFlowError', async () => {
    const schema = await client.getForm(SLUG);

    // Build values that satisfy every other field but omit `contact_email`.
    // The client runs no client-side validation here — the server is the one
    // asserting the required-field rule, which is exactly what we want to test.
    const promise = client.submit(SLUG, {
      schema,
      values: {
        full_name: 'Probe User',
        message: 'hello world this is long enough',
      },
    });

    await expect(promise).rejects.toBeInstanceOf(FormFlowError);

    const error = await promise.catch((e) => e as unknown);
    expect(isFormFlowError(error)).toBe(true);
    if (!isFormFlowError(error)) throw new Error('expected a FormFlowError');

    expect(error.code).toBe('validation');
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toBeDefined();
    expect(error.fieldErrors?.contact_email).toBeDefined();
    expect(Array.isArray(error.fieldErrors?.contact_email)).toBe(true);
    expect(error.fieldErrors?.contact_email?.length).toBeGreaterThan(0);
  });
});
