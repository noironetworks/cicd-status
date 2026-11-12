# cicd-status
CICD Status

#run locally:
cd cicd-status/docs
docker run -it --rm -v "$PWD":/usr/src/app -p "4000:4000" starefossen/github-pages

Scan observations use `scan.build` and `scan.refresh`, each with independent
`image` and `base` records. Each record has `state` (`ok`, `unavailable`,
`queued`, `unsupported`, `error`), `scanner`, `digest`, `observed_at`, optional
complete `counts` (`C/H/M/L/U`), and `report`. Only completed results show
current counts. `last_success` is explicitly historical and retains its own
digest and timestamp. Legacy severity/error records remain readable.

Freshness is independent of result: `freshness: {state, max_age_seconds}`.
Without an explicit positive age policy the UI displays `unknown`; freshness
never implies a scan succeeded. A refresh never replaces build provenance.

Tests: Node 22.14.0, `npm ci`, `npm test`,
`npx playwright install chromium`, `npm run test:browser`.
The Playwright tests open the real release page and scripts with fixture YAML
and all network responses intercepted. Browser dependencies are development
only; the site remains static. CI uses Linux and the Chromium revision pinned
by Playwright 1.56.1. The local fixtures use pinned js-yaml 4.3.2 in place of
the external CDN so tests run without a CDN connection.
