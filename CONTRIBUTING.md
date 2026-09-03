# Contributing

We love pull requests. For new features, consider opening an issue to discuss the idea first. When you're ready to open a pull requset, here's a quick guide.

1. Fork, clone and branch off `main`:
    ```bash
    git clone git@github.com:<your-username>/datadog-lambda-js.git
    git checkout -b <my-branch>
    ```
1. Install the repositories dependencies, `yarn install`.
1. Make your changes.
1. Test your Lambda function against the locally modified version of Datadog Lambda library.
   * The easiest approach is to use [yarn link](https://classic.yarnpkg.com/en/docs/cli/link/).

     ```bash
     yarn build # rebuild after changes
     cd dist
     yarn link
     cd /path/to/your/testing/function/
     yarn link "datadog-lambda-js" # use unlink after done
     ```
   * You can also build and publish a Lambda layer to your own AWS account and use it for testing.

     ```bash
     # Build layers using docker
     ./scripts/build_layers.sh

     # Publish the a testing layer to your own AWS account, and the ARN will be returned
     # Example: ./scripts/publish_layers.sh us-east-1
     ./scripts/publish_layers.sh <AWS_REGION>
     ```

1. Update tests and ensure they pass
    ```bash
    yarn test
    ```
1. Run the local docker-based integration tests (no AWS account needed — this is the
   behavioral gate that runs per PR):
   ```bash
   ./integration_tests_local/run.sh
   ```
1. The real-AWS residual coverage (real layer artifact on the real platform, direct-API
   metric intake, X-Ray pass-through, a real API Gateway trigger) lives in the
   `integration-tests-residual` suite of the `serverless-e2e-tests` repo and runs from
   that repo's pipeline. See `integration_tests/README.md`.
1. Push to your fork and [submit a pull request][pr].

[pr]: https://github.com/your-username/datadog-lambda-js/compare/DataDog:main..main.

At this point you're waiting on us. We may suggest some changes or improvements or alternatives.
