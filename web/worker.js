import {
  compare,
  parseInventoryText,
  parseRequestsText,
} from "../src/engine.ts";
self.onmessage = ({ data }) => {
  const requestId = data?.requestId;
  try {
    const input = data?.input;
    if (!Number.isSafeInteger(requestId) || !input)
      throw new Error("Invalid worker request");
    const report = compare({
      netlify: input.netlify,
      pages: input.pages,
      inventory: parseInventoryText(
        input.inventory,
        input.complete,
        input.staticOnly ? "static" : "unknown",
      ),
      requests: parseRequestsText(input.requests),
      autoAssets: input.autoAssets,
    });
    self.postMessage({ requestId, report });
  } catch (error) {
    self.postMessage({
      requestId,
      error: {
        message: error instanceof Error ? error.message : "Comparison failed",
      },
    });
  }
};
