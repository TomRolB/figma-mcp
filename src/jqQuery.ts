import { json } from "jq-wasm";

// The escape hatch: a real jq filter over the cached raw file response, for
// the long tail of questions the purpose-built tools don't cover. Runs
// entirely in-process (WASM), no network, no shell-out to a system binary.
// jq filters can emit multiple outputs (e.g. `.. | select(...)`), so the
// result is always the array of every emitted value.
export const runJqFilter = async (data: object, filter: string): Promise<unknown[]> => {
  try {
    return await json(data, filter);
  } catch (error) {
    throw new Error(`Invalid jq filter: ${(error as Error).message}`);
  }
};
