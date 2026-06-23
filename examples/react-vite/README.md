# FormFlow · React + Vite example

A tiny Vite + React 18 app that fetches a FormFlow form **by slug** from a Strapi
`baseUrl` and renders it **headlessly** with `@formflowjs/react`. The SDK ships no
CSS — every element here is plain markup with utility (Tailwind-ish) class names
you can replace with your own design system.

## What it shows

- `createFormFlowClient({ baseUrl }).getForm(slug)` to load a schema.
- `<FormFlowProvider>` + `useFormFlow()` to drive form state.
- `<FormFlowField render={…}>` to render text / textarea / select / checkbox /
  file controls with accessibility + `data-*` state wired by the SDK.
- `<FormFlowHoneypot />` for spam protection (renders the schema's hidden field).

## Run

```bash
pnpm install            # from the monorepo root
pnpm --filter @formflowjs/example-react-vite dev      # dev server
pnpm --filter @formflowjs/example-react-vite build    # production build
```

By default it loads slug `test-free-fields-form` from `http://localhost:1337`.
Override with env vars:

```bash
VITE_FORMFLOW_BASE_URL=https://cms.example.com VITE_FORMFLOW_SLUG=contact pnpm --filter @formflowjs/example-react-vite dev
```
