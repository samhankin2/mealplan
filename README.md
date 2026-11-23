# mealplan

A shared weekly meal planner for two: plan the week, rate what we cooked, and
get reminded of the good meals we've forgotten about.

This repo is the **frontend only**. The backend is HealthLog's server
(`../healthlog`): the `/api/planner/*` routes, the planner tables and
household logic live there, documented in HealthLog's `SPEC.md`
(§4 "Meal planner tables", §6 "Meal planner", §7 "Planner AI tasks").

- Svelte 5 + Vite + TypeScript, plain (not SvelteKit), hash routing
- Hosted on GitHub Pages at `<user>.github.io/mealplan`, the same origin as
  HealthLog, so CORS needs no change and the sign-in is shared between the two
- Sign in with a HealthLog account; two accounts that name each other as
  partners share one household and one plan

## Develop

```bash
# terminal 1: the API (HealthLog)
cd ../healthlog && node server/index.js         # http://127.0.0.1:8787

# terminal 2: this app
npm install
npm run dev                                     # http://localhost:5175, /api proxied to :8787
```

Use the live API instead: `VITE_DEV_API=https://healthlog.<ip>.sslip.io npm run dev`.

`npm run build` runs `svelte-check` and writes `dist/`.

## Deploy

Push to `main`. `.github/workflows/pages.yml` builds and publishes to Pages and
writes `dist/api-config.js` from the repository variable `API_BASE_URL` (the
HealthLog API origin). One-time setup: create the repo, set that variable, and
choose "GitHub Actions" as the Pages source.

## Build plan

M0 foundations (this) → M1 history import → M2 weekly planner → M3 weekly
review → M4 suggestions → M5 shopping list builder.
