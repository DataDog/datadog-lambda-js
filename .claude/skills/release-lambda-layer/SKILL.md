---
name: release-lambda-layer
description: Walks through releasing a new datadog-lambda-js Lambda layer version — the automated Commercial release (version bump, tag, GitLab sign/publish jobs, npm publish, GitHub release) and the manual GovCloud layer publish. Pauses for explicit confirmation before every irreversible or externally-visible step (tag push, GitLab manual jobs, npm publish, GitHub release, GovCloud deploy). Triggers on "release a new layer version", "cut a new datadog-lambda-js release", "publish the lambda layer", or similar. Source of truth: https://datadoghq.atlassian.net/wiki/spaces/SLS/pages/2724037230/Lambda+Layer+Node.js#Commercial
user-invocable: true
agent-invocable: true
---

# Release a new datadog-lambda-js Lambda layer

This mirrors the "Release" section of the SLS Confluence page "Lambda Layer
Node.js" (Commercial + GovCloud). It assumes a Release Candidate has
already been validated (self-monitoring + e2e tests passed) before this
process starts.

This process pushes git tags, triggers production-publishing GitLab jobs,
publishes to the public npm registry, and creates a public GitHub release.
**Treat every step in the "Guardrails" section as a hard stop** — confirm
with the user before running it, even if they've approved a similar step
earlier in the same run.

## Before starting

- Announce the start of the release in a **#apm-serverless** Slack thread.
  Use this same thread for every update below. Ask the user to post, don't
  post on their behalf unless they've explicitly asked you to send Slack
  messages for them.
- Confirm a Release Candidate deploy already passed self-monitoring and
  e2e tests for this change. Do not start Phase 1 without it.

## Phase 1 — Commercial release

Reference: https://datadoghq.atlassian.net/wiki/spaces/SLS/pages/3375925277

1. Create a branch for the version bump.
2. Run `yarn upgrade dd-trace` (or `yarn upgrade dd-trace@^a.b.c` for a
   specific version) to pick up the latest tracer.
3. If dd-trace changed, refresh integration test snapshots:
   `BUILD_LAYERS=true UPDATE_SNAPSHOTS=true DD_API_KEY=<key from 1Password> aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh`
4. Bump `package.json` version to `X.Y.0`:
   - Minor version bumps on every release, and **must match the layer
     version**.
   - Bump major too for breaking changes.
5. Commit as `vX.Y.0`, open a PR, get approval.
6. **Before merging**, confirm a Release Candidate deploy already passed
   for this change (per "Before starting" above).
7. Merge the PR. **Tell the user not to merge any other PR until this
   release finishes** — a concurrent merge can tag the wrong commit.
8. `git checkout main && git pull`
9. `git tag vX.Y.0`
10. `git push --tags origin main` — **guardrail: confirm with the user
    before running this.** It kicks off the production build in GitLab and
    can't be cleanly undone.
11. In [GitLab tags](https://gitlab.ddbuild.io/DataDog/datadog-lambda-js/-/tags),
    open the pipeline for the new tag.
12. **Guardrail: confirm before triggering**, then run the `sign-layer
    (nodeXX)` manual job for every supported runtime. This deploys the
    layer to every commercial region.
13. **Guardrail: confirm before triggering**, then run the
    `publish-npm-package` manual job. Afterward, verify publicly:
    ```
    mkdir new-dir && cd new-dir && npm init -y
    npm install datadog-lambda-js@<new version>
    ```
14. **Guardrail: confirm before creating**, then draft a GitHub release on
    the [releases page](https://github.com/DataDog/datadog-lambda-js/releases):
    - Select the new tag and the previous tag, generate release notes.
    - Paste in layer ARNs for every runtime and region pattern, e.g.:
      ```
      arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node18-x:117
      arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node20-x:117
      arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node22-x:117

      arn:aws-us-gov:lambda:us-gov-<AWS_REGION>:002406178527:layer:Datadog-Node18-x:117
      arn:aws-us-gov:lambda:us-gov-<AWS_REGION>:002406178527:layer:Datadog-Node20-x:117
      arn:aws-us-gov:lambda:us-gov-<AWS_REGION>:002406178527:layer:Datadog-Node22-x:117
      ```
      (substitute the actual layer version number for `117`)
    - Attach the layer zip files.
15. Post the finished release + release notes link to the Slack thread.

## Phase 2 — GovCloud (manual)

No automated pipeline exists for this — compliance requirements mean it has
to stay manual.

1. Confirm AWS SSO is set up for both Commercial and GovCloud (see
   [cloud-inventory setup](https://github.com/DataDog/cloud-inventory/tree/master/organizations/aws#aws-cli-config-setup--update)).
2. From the Phase 1 pipeline's Sign layer jobs, download each job's
   artifacts and place the layer bundle zips in the local `.layers` folder.
3. **Guardrail: confirm before running**, then for each GovCloud
   environment:
   ```
   VERSION=<LAYER_VERSION> ENVIRONMENT=us1-fed ./scripts/publish_govcloud_layers.sh <path-to-layer-bundle.zip>
   VERSION=<LAYER_VERSION> ENVIRONMENT=us2-fed ./scripts/publish_govcloud_layers.sh <path-to-layer-bundle.zip>
   ```
   `VERSION` is the integer layer version (e.g. `116`), not the npm semver.
   When prompted for auth, the user must open the link in their GovCloud
   browser profile — don't attempt to open or approve it yourself.
4. **Guardrail: confirm before editing**, then update
   [`latest-lambda-layer-version.html`](https://github.com/DataDog/documentation/blob/master/layouts/shortcodes/latest-lambda-layer-version.html)
   in the `documentation` repo to the new version, via a PR.

## Guardrails (always confirm before)

- `git push --tags origin main`
- Triggering any GitLab manual job that publishes/signs a layer or
  publishes the npm package
- Creating the GitHub release
- Running `publish_govcloud_layers.sh`
- Opening a PR against the `documentation` repo
- Merging any release-version-bump PR

## Failure modes

- If integration test snapshots don't update correctly, check the
  installed `serverless` framework is v3, not v4:
  `npm install -g serverless@3.39.0`.
- If a teammate merges a PR to `main` between step 7 and step 9 of Phase 1,
  stop and confirm with the user which commit should actually be tagged.
