import { describe, expect, it } from "vite-plus/test";
import { buildViewerUrl, readViewerUrlState } from "../composables/viewerUrlState";

describe("viewerUrlState", () => {
  it("reads valid viewer state from the URL", () => {
    expect(readViewerUrlState("?entry=2&tab=3&stats=1&seg=4")).toEqual({
      activeGeneratedEntryIndex: 2,
      activeSourceIndex: 3,
      selectedSegmentIndex: 4,
      showMappings: true,
      showStats: true,
    });
  });

  it("ignores invalid indexes but keeps the mappings panel hint", () => {
    expect(readViewerUrlState("?entry=0&tab=-1&seg=nope")).toEqual({
      activeGeneratedEntryIndex: 0,
      activeSourceIndex: 0,
      selectedSegmentIndex: null,
      showMappings: true,
      showStats: false,
    });
  });

  it("keeps the segment unset when the URL does not include seg", () => {
    expect(readViewerUrlState("?entry=1&tab=2")).toEqual({
      activeGeneratedEntryIndex: 1,
      activeSourceIndex: 2,
      selectedSegmentIndex: null,
      showMappings: false,
      showStats: false,
    });
  });

  it("builds compact viewer URLs", () => {
    expect(
      buildViewerUrl("/demo", {
        activeGeneratedEntryIndex: 2,
        activeSourceIndex: 3,
        selectedSegmentIndex: 4,
        showStats: true,
      }),
    ).toBe("/demo?entry=2&tab=3&stats=1&seg=4");
  });

  it("omits default state from the URL", () => {
    expect(
      buildViewerUrl("/demo", {
        activeGeneratedEntryIndex: 0,
        activeSourceIndex: 0,
        selectedSegmentIndex: null,
        showStats: false,
      }),
    ).toBe("/demo");
  });
});
