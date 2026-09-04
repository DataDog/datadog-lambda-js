# integration_tests/

This directory now hosts only the **fixtures shared with the local docker-based
integration suite** (`integration_tests_local/`):

- `input_events/` — the nine event payloads both suites invoke with,
- `parse-json.js` — JSON-log line parser used by `integration_tests_local/normalize.sh`,
- `container/` — the container-image fixtures (`cjs`, `esm`) built by the local suite.

## The AWS-based suite was retired

The serverless-deployed suite that used to live here (`serverless.yml`,
`snapshots/`, per-handler files, `scripts/run_integration_tests.sh`) was removed.
Its coverage moved to two homes:

- **Behavior** → `integration_tests_local/` (docker/RIE, runs per PR in GitHub
  Actions, no AWS account needed). Its goldens are strictly stronger: they
  preserve span `meta`/`metrics` keys, which the retired suite's normalization
  stripped wholesale.
- **Real-AWS residual signals** (the real layer artifact on the real platform,
  direct-API metric intake, `_X_AMZN_TRACE_ID` pass-through, a real API Gateway
  trigger, platform-drift canary) → the `integration-tests-residual` suite in the
  `serverless-e2e-tests` repo, which continues to diff against the same snapshots.

Do not re-add serverless-deployed tests here; add cases to the local suite, or to
`serverless-e2e-tests` if they genuinely need real AWS.
