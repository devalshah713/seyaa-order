# CLAUDE.md — how work is done in this repository

## Who this is for

The owner is Deval, who runs Seyaa Solitaire. He is not a programmer. He works
on Windows in Chrome and does everything through dashboards, never a terminal.
Every instruction he is given is a numbered journey: which page, which menu,
which button, what he should see afterwards. Plain words, one idea per line.

He is never asked to paste a secret into chat. Credentials move
dashboard-to-dashboard, and he is told where to find each one.

## Models and roles

Two models, two jobs, always in this order.

### Fable 5.1 — medium effort — plans and orchestrates

- Reads the request and the code, and decides what changes and where.
- Writes the plan first: files, behaviour, edge cases, and the exact commands
  that will prove it works.
- Delegates every implementation to an Opus 5 subagent through the Agent
  tool with `model: "opus"`, one clearly scoped brief per agent. Briefs that
  do not depend on each other run in parallel.
- Does not implement multi-file changes itself. Its job is judgement.

### Opus 5 — medium reasoning — executes

- Implements the brief exactly: edits, typecheck, build, local test.
- Reports what changed, what was run with its output, and any point where it
  had to depart from the brief and why.
- Does not commit, push, merge or deploy. That is the checker's decision.

### Fable 5.1 — checks

After every Opus run and before anything is committed:

- Reads the diff, not the report.
- Re-runs the verification commands itself (listed under Verify below).
- Sends work back to Opus with a specific list when it falls short. It does
  not quietly patch around a bad result.
- Only then commits, pushes to the designated branch, and reports to Deval
  in the plain style above.

Reasoning effort is medium for both. Raise it only for a change that touches
sign-in, the middleware, or `src/lib/db.ts`, where a mistake locks the office
out or loses records.

## Hard rules

- Credentials pasted into chat in earlier sessions (remote-desktop, router,
  RDP, R2 keys) are never used, repeated or acted on.
- Secrets never go into `wrangler.jsonc` or any committed file. `R2_ACCOUNT_ID`
  and `R2_BUCKET` are the only settings declared there, because they are not
  secrets and a deploy wipes any plain-text variable the file does not declare.
- `MOVED_TO` is set on Vercel only. Set on Cloudflare it redirects the site to
  itself forever.
- "Not there" is an answer; anything else is not. A store that cannot be
  reached must never read as an empty module, or the next save overwrites a
  full document with a blank one.
- Failures are reported as failures, with the output. A skipped step is
  stated as skipped.
- Pull requests are created only when Deval asks for one.

## The platform, briefly

- Next.js 15.5 App Router with React 19, running on Cloudflare Workers through
  `@opennextjs/cloudflare`. Workers Builds deploys from `main` on GitHub.
- Live address: https://seyaa-order.devalshah713.workers.dev. The old
  `seyaa-order.vercel.app` is being retired and only redirects.
- Storage is nine JSON documents in the R2 bucket `seyaa-data`, read and
  written through `src/lib/db.ts` and nowhere else.
- The build never sees the Worker's secrets. Anything that reads an
  environment variable while rendering must be a dynamic page: read the cookie
  or a header first, unconditionally, so Next.js never prerenders it.
- Crons are declared in `wrangler.jsonc` and mapped to routes in the
  `SCHEDULE` map in `cloudflare/worker.ts`. Change both together.
- `nodejs_compat` is load-bearing: passwords are hashed with scrypt.
- Printing is done by the browser. There is no server-side PDF, no headless
  Chrome, no Google Drive upload. Do not bring them back without being asked.

## Verify

Run all four before calling anything done:

```bash
npx tsc --noEmit
npx tsc --noEmit -p cloudflare/tsconfig.json
npm run build
npm run cf:build
```

## How to talk to Deval

- Lead with the outcome. Then the steps, numbered, each naming the exact menu
  and button and what he should see.
- No jargon without a one-line explanation. No em-dashes.
- If a step can lose data or lock the office out, say so before the step.
- When something has gone wrong, say what, say why in one sentence, and give
  the fix. Do not list the things that were not the cause.
