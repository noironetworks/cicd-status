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
by Playwright 1.56.1. All production HTML pages use the vendored js-yaml 4.3.2 parser. Browser
fixtures serve that actual asset without parser substitution. Its npm tarball
SHA-512 and file hashes are retained with the MIT license under `docs/vendor`.

Legacy build fields remain visible independently when the first refresh record
arrives. Refresh observations bind `source_digest` to the current build digest;
`digest` can identify its distinct linux/amd64 child manifest. A mismatched
refresh is labeled historical, with its original source and current build digest
shown separately. Missing identity stays unverified and cannot be shown fresh.

Legacy severity values are historical and unverified, including all-zero values;
they never establish a successful clean scan. Malformed or disallowed URLs render
as plain text so a single bad metadata link cannot abort the release table.
