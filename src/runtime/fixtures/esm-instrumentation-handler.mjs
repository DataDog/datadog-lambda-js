import { withDurableExecution } from "@aws/durable-execution-sdk-js";

const durableExecutionClient = {
  getExecutionState() {
    return Promise.resolve({ Operations: [] });
  },
  checkpoint() {
    return Promise.resolve({
      CheckpointToken: "next-checkpoint-token",
      NewExecutionState: { Operations: [] },
    });
  },
};

async function customerHandler() {
  return { statusCode: 200 };
}

export const handle = withDurableExecution(customerHandler, { durableExecutionClient });
