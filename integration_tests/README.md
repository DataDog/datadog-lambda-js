# integration_tests/

This directory now hosts only the **fixtures shared with the local docker-based
integration suite** (`integration_tests_local/`):

- `input_events/` — the nine event payloads the local RIE-based suite invokes
  with,
- `parse-json.js` — JSON-log line parser used by `integration_tests_local/normalize.sh`,
- `container/` — the container-image fixtures (`cjs`, `esm`) built by the local suite.

## The real AWS Lambda resource-based suite was deprecated

The serverless-deployed suite that used to live here (`serverless.yml`,
`snapshots/`, per-handler files, `scripts/run_integration_tests.sh`) was removed.
The in-repo integration coverage now uses `integration_tests_local/`, a
docker/RIE-based suite that runs per PR without an AWS account. Its goldens are
strictly stronger for behavior: they preserve span `meta`/`metrics` keys, which
the deprecated suite's normalization stripped wholesale.

Cases that require real AWS Lambda resources are covered by the end-to-end test
suites.

Do not re-add serverless-deployed tests here. Add behavioral cases to the local
RIE-based suite, and rely on the end-to-end suites for real AWS Lambda resource
cases.
