import { describe, expect, it } from "vite-plus/test";
import { buildViewerUrl, readViewerUrlState } from "../composables/viewerUrlState";

describe("viewerUrlState", () => {
  it.each([
    { side: "generated", line: 11, column: 417, sourceIndex: 0 },
    { side: "original", line: 17, column: 6, sourceIndex: 2 },
  ] as const)(
    "round trips requested $side coordinates independently of the selected mapping",
    (position) => {
      const url = buildViewerUrl("/demo", {
        activeGeneratedEntryIndex: 1,
        activeSourceIndex: 3,
        selectedSegmentIndex: 5,
        showStats: true,
        position,
      });
      expect(readViewerUrlState(url.slice(url.indexOf("?")))).toMatchObject({
        activeGeneratedEntryIndex: 1,
        activeSourceIndex: 3,
        selectedSegmentIndex: 5,
        position,
        showMappings: false,
      });
    },
  );

  it.each([
    "generated:0:2",
    "generated:1:-1",
    "original:1:2",
    "original:-1:2:3",
    "generated:1:2:3",
    "other:1:2",
    "generated:1:9007199254740992",
    "generated:1:1e3",
  ])("ignores malformed lookup state %s", (position) => {
    expect(readViewerUrlState(`?pos=${encodeURIComponent(position)}`).position).toBeNull();
  });
  it("reads valid viewer state from the URL", () => {
    expect(readViewerUrlState("?entry=2&tab=3&stats=1&seg=4")).toEqual({
      activeGeneratedEntryIndex: 2,
      activeSourceIndex: 3,
      selectedSegmentIndex: 4,
      showMappings: true,
      showStats: true,
      position: null,
    });
  });

  it("ignores invalid indexes but keeps the mappings panel hint", () => {
    expect(readViewerUrlState("?entry=0&tab=-1&seg=nope")).toEqual({
      activeGeneratedEntryIndex: 0,
      activeSourceIndex: 0,
      selectedSegmentIndex: null,
      showMappings: true,
      showStats: false,
      position: null,
    });
  });

  it("keeps the segment unset when the URL does not include seg", () => {
    expect(readViewerUrlState("?entry=1&tab=2")).toEqual({
      activeGeneratedEntryIndex: 1,
      activeSourceIndex: 2,
      selectedSegmentIndex: null,
      showMappings: false,
      showStats: false,
      position: null,
    });
  });

  it("builds compact viewer URLs", () => {
    expect(
      buildViewerUrl("/demo", {
        activeGeneratedEntryIndex: 2,
        activeSourceIndex: 3,
        selectedSegmentIndex: 4,
        showStats: true,
        position: null,
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
        position: null,
      }),
    ).toBe("/demo");
  });
});
