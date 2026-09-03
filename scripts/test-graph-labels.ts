import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CURRENT_EDGE_COLOR,
  DEFAULT_ORG_AFFINITY_JACCARD,
  EGO_CENTER_SIZE,
  EGO_HALO_COLOR,
  EGO_HALO_WIDTH_PX,
  PAST_EDGE_COLOR,
  PRIMARY_EDGE_COLOR,
} from "../lib/civic-graph.ts";
import {
  degreesFromEdges,
  FOCUS_LABEL_ALL_ACTORS_MAX,
  FOCUS_LABEL_TOP_N,
  presentOrgTypesFromNodes,
  topFocusLabelIds,
  visibleFocusLabelIds,
} from "../lib/graph-labels.ts";

test("calm edges use Facelift faint/line, seated stays forest, never #364f37", () => {
  assert.equal(CURRENT_EDGE_COLOR, "#8A938C");
  assert.equal(PAST_EDGE_COLOR, "#C9C5B8");
  assert.equal(PRIMARY_EDGE_COLOR, "#24352A");
  assert.notEqual(CURRENT_EDGE_COLOR.toLowerCase(), "#364f37");
  assert.notEqual(PAST_EDGE_COLOR.toLowerCase(), "#364f37");
});

test("ego center is 16–18 with a 2px white halo", () => {
  assert.ok(EGO_CENTER_SIZE >= 16 && EGO_CENTER_SIZE <= 18);
  assert.equal(EGO_HALO_COLOR, "#FFFFFF");
  assert.equal(EGO_HALO_WIDTH_PX, 2);
});

test("org affinity default Jaccard is 0.25–0.30", () => {
  assert.equal(DEFAULT_ORG_AFFINITY_JACCARD, 0.28);
  assert.ok(DEFAULT_ORG_AFFINITY_JACCARD >= 0.25);
  assert.ok(DEFAULT_ORG_AFFINITY_JACCARD <= 0.3);
});

test("focus labels: center, hover, edge endpoints, and top 6 by degree", () => {
  const nodes = [
    { id: "ego", degree: 8 },
    { id: "a", degree: 5 },
    { id: "b", degree: 4 },
    { id: "c", degree: 3 },
    { id: "d", degree: 2 },
    { id: "e", degree: 2 },
    { id: "f", degree: 1 },
    { id: "g", degree: 0 },
    { id: "h", degree: 0 },
  ];
  const top = topFocusLabelIds(nodes, "ego", FOCUS_LABEL_TOP_N);
  assert.deepEqual(top, ["a", "b", "c", "d", "e", "f"]);
  assert.equal(top.includes("ego"), false);
  assert.equal(top.includes("g"), false);

  const visible = visibleFocusLabelIds({
    mode: "focus",
    nodeIds: nodes.map((node) => node.id),
    centerId: "ego",
    hoveredNodeId: "h",
    hoveredEdgeEndpoints: ["g", "ego"],
    selectedEdgeEndpoints: ["d", "ego"],
    topFocusIds: top,
  });
  assert.equal(visible.has("ego"), true);
  assert.equal(visible.has("h"), true);
  assert.equal(visible.has("g"), true);
  assert.equal(visible.has("a"), true);
  assert.equal(visible.has("f"), true);
  assert.equal(visible.has("c"), true);
});

test("focus labels on affinity rank by member_count, not degree", () => {
  const top = topFocusLabelIds(
    [
      { id: "council", member_count: 12, degree: 1 },
      { id: "chamber", member_count: 9, degree: 4 },
      { id: "rotary", member_count: 3, degree: 3 },
      { id: "tiny", member_count: 1, degree: 8 },
    ],
    "council",
    2
  );
  assert.deepEqual(top, ["chamber", "rotary"]);
});

test("all mode labels every node", () => {
  const visible = visibleFocusLabelIds({
    mode: "all",
    nodeIds: ["ego", "a", "b"],
    centerId: "ego",
    topFocusIds: [],
  });
  assert.deepEqual([...visible].sort(), ["a", "b", "ego"]);
});

test("ribbon focus labels every actor when cast is ≤ 12", () => {
  const actors = Array.from({ length: 7 }, (_, i) => `actor-${i}`);
  const nodeIds = ["measure", ...actors];
  const visible = visibleFocusLabelIds({
    mode: "focus",
    nodeIds,
    centerId: "measure",
    topFocusIds: actors.slice(0, 3),
    actorIds: actors,
    labelAllActorsMax: FOCUS_LABEL_ALL_ACTORS_MAX,
  });
  assert.equal(visible.size, nodeIds.length);
  assert.equal(actors.every((id) => visible.has(id)), true);
});

test("ribbon focus keeps top-N when actor count is above 12", () => {
  const actors = Array.from({ length: 13 }, (_, i) => `actor-${String(i).padStart(2, "0")}`);
  const nodeIds = ["measure", ...actors];
  const top = actors.slice(0, FOCUS_LABEL_TOP_N);
  const visible = visibleFocusLabelIds({
    mode: "focus",
    nodeIds,
    centerId: "measure",
    topFocusIds: top,
    actorIds: actors,
    labelAllActorsMax: FOCUS_LABEL_ALL_ACTORS_MAX,
  });
  assert.equal(visible.has("measure"), true);
  assert.deepEqual(
    [...visible].filter((id) => id !== "measure").sort(),
    top.slice().sort()
  );
  assert.equal(visible.has("actor-12"), false);
});

test("degreesFromEdges counts unique endpoints", () => {
  const degree = degreesFromEdges(
    ["ego", "org", "seat"],
    [
      { source: "ego", target: "org" },
      { source: "ego", target: "seat" },
      { source: "missing", target: "ego" },
    ]
  );
  assert.equal(degree.get("ego"), 2);
  assert.equal(degree.get("org"), 1);
  assert.equal(degree.get("seat"), 1);
});

test("legend org types are only those present on current nodes", () => {
  assert.deepEqual(
    presentOrgTypesFromNodes([
      { org_type: "civic" },
      { org_type: "city_body" },
      { org_type: "civic" },
      { org_type: undefined },
    ]),
    ["city_body", "civic"]
  );
  assert.deepEqual(presentOrgTypesFromNodes([{ org_type: null }]), []);
});
