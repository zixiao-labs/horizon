import { describe, expect, it } from "@lightning-js/lightning";
import type { DesktopApi } from "./desktop";

describe("DesktopApi", () => {
  it("describes the readonly runtime bridge", () => {
    const api = {
      platform: "darwin",
      versions: {
        chrome: "1",
        electron: "41",
        node: "24",
      },
    } satisfies DesktopApi;

    expect(api.versions.electron).toBe("41");
  });
});
