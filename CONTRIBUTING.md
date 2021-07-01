# Contributing

We love pull requests. Here's a quick guide.

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
1. Run the integration tests against your own AWS account and Datadog org (or ask a Datadog member to run):
   ```bash
   BUILD_LAYERS=true DD_API_KEY=<your Datadog api key> ./scripts/run_integration_tests.sh
   ```
1. Update integration test snapshots if needed:
   ```bash
   UPDATE_SNAPSHOTS=true DD_API_KEY=<your Datadog api key> ./scripts/run_integration_tests.sh
   ```
1. Push to your fork and [submit a pull request][pr].

[pr]: https://github.com/your-username/datadog-lambda-js/compare/DataDog:main..main.

At this point you're waiting on us. We may suggest some changes or improvements or alternatives.
