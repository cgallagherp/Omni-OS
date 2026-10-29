// Integration tests share one seeded database, so files run in a fixed (alphabetical) order
// rather than vitest's duration-based order.
import { BaseSequencer, type TestSpecification } from "vitest/node";

export default class AlphabeticalSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}
