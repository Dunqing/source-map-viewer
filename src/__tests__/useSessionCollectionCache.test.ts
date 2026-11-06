import { describe, expect, it } from "vite-plus/test";
import {
  cacheSessionCollection,
  createLocalSession,
  getCachedSession,
} from "../composables/useSessionCollectionCache";

const ENTRY = {
  generatedCode: "console.log('local');",
  sourceMapJson: '{"version":3,"sources":[],"names":[],"mappings":""}',
  label: "output.js",
  entryPath: "output.js",
};

describe("session collection storage failures", () => {
  it("keeps storage access best effort when the sessionStorage getter throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is disabled", "SecurityError");
      },
    });

    try {
      expect(() => cacheSessionCollection("local-denied", [ENTRY])).not.toThrow();
      expect(() => createLocalSession([ENTRY], "Pasted code")).not.toThrow();
      expect(getCachedSession("local-denied")).toBeNull();
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "sessionStorage", descriptor);
      } else {
        Reflect.deleteProperty(globalThis, "sessionStorage");
      }
    }
  });
});
