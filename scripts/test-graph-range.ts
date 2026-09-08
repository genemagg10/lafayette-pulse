import assert from "node:assert/strict";
import { test } from "node:test";
import {
  drawnCountForStop,
  rangeMetaLine,
  resolveGraphRangeStop,
  sliceConnectedByFootprint,
  visibleGraphRangeStops,
} from "../lib/graph-range.ts";

test("Most involved is 12, Wider is 24, All is the connected set", () => {
  assert.equal(drawnCountForStop(86, "most"), 12);
  assert.equal(drawnCountForStop(86, "wider"), 24);
  assert.equal(drawnCountForStop(86, "all"), 86);
});

test("a stop smaller than the connected set draws everyone", () => {
  assert.equal(drawnCountForStop(10, "most"), 10);
  assert.equal(drawnCountForStop(20, "wider"), 20);
  assert.equal(drawnCountForStop(8, "all"), 8);
});

test("hide a stop only when it would draw the same set as the previous one", () => {
  assert.deepEqual(visibleGraphRangeStops(86), ["most", "wider", "all"]);
  assert.deepEqual(visibleGraphRangeStops(24), ["most", "wider"]);
  assert.deepEqual(visibleGraphRangeStops(20), ["most", "wider"]);
  assert.deepEqual(visibleGraphRangeStops(12), ["most"]);
  assert.deepEqual(visibleGraphRangeStops(10), ["most"]);
  assert.deepEqual(visibleGraphRangeStops(25), ["most", "wider", "all"]);
});

test("resolve falls back to the last visible stop", () => {
  assert.equal(resolveGraphRangeStop("all", 20), "wider");
  assert.equal(resolveGraphRangeStop("wider", 10), "most");
  assert.equal(resolveGraphRangeStop("most", 86), "most");
});

test("meta line uses live drawn and connected counts", () => {
  assert.equal(
    rangeMetaLine(12, 46),
    "12 of 46 on the graph. The list still has everyone."
  );
});

test("people slice keeps the rank band even without an in-band edge", () => {
  const nodes = [
    { id: "ada", footprint: 8 },
    { id: "bea", footprint: 5 },
    { id: "cam", footprint: 3 },
  ];
  const edges = [{ source: "ada", target: "cam" }];
  const sliced = sliceConnectedByFootprint(nodes, edges, "most");
  assert.deepEqual(
    sliced.nodes.map((node) => node.id).sort(),
    ["ada", "bea", "cam"]
  );
  assert.deepEqual(sliced.edges, [{ source: "ada", target: "cam" }]);
});

test("org slice drops in-band isolates and does not backfill", () => {
  const nodes = [
    { id: "lpie", footprint: 20 },
    { id: "council", footprint: 15 },
    { id: "chamber", footprint: 12 },
    { id: "tiny", footprint: 11 },
    { id: "rotary", footprint: 4 },
  ];
  const edges = [
    { source: "lpie", target: "council" },
    { source: "tiny", target: "rotary" },
  ];
  const sliced = sliceConnectedByFootprint(nodes, edges, "most", {
    dropIsolates: true,
  });
  // Top 12 includes everyone; chamber has no in-band edge and stays off.
  // tiny–rotary stay because they share inside the band.
  assert.deepEqual(
    sliced.nodes.map((node) => node.id).sort(),
    ["council", "lpie", "rotary", "tiny"]
  );
  assert.equal(
    sliced.nodes.some((node) => node.id === "chamber"),
    false
  );

  const top3 = sliceConnectedByFootprint(
    nodes,
    edges,
    "most",
    { dropIsolates: true }
  );
  // Same as above with cap 12. Use a custom band via only the top 3 nodes:
  const band3 = sliceConnectedByFootprint(
    nodes.slice(0, 3),
    edges,
    "most",
    { dropIsolates: true }
  );
  assert.deepEqual(
    band3.nodes.map((node) => node.id).sort(),
    ["council", "lpie"]
  );
  assert.equal(
    band3.nodes.some((node) => node.id === "tiny" || node.id === "chamber"),
    false
  );
  assert.deepEqual(top3.nodes.length, 4);
});
