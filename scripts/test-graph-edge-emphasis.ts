import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLUSTER_WASH_COLORS,
  CLUSTER_WASH_OPACITY,
  clusterCauseOnStop,
  clusterWashColor,
} from "../lib/cluster-cause.ts";
import {
  EMPHASIZED_EDGE_COLOR,
  EMPHASIZED_EDGE_SIZE_FACTOR,
  EMPHASIZED_EDGE_SIZE_MIN,
  WHO_EDGE_OVERLAY_ORDER,
  activeEmphasizedEdgeKey,
  edgeMatchesPair,
  emphasizeEdgeSize,
  emphasizedEdgeStroke,
} from "../lib/graph-edge-emphasis.ts";
import { visibleWhoLabelIds } from "../lib/graph-labels.ts";

const EDGES = [
  { key: "ab", source: "a", target: "b" },
  { key: "cd", source: "c", target: "d" },
];

test("hover and selected darken to ink and thicken, no new hue", () => {
  assert.equal(EMPHASIZED_EDGE_COLOR, "#1A2420");
  assert.equal(emphasizedEdgeStroke(), "#1A2420");
  assert.equal(emphasizedEdgeStroke(clusterWashColor("council")), "#1A2420");
  assert.equal(EMPHASIZED_EDGE_SIZE_FACTOR, 1.6);
  assert.equal(EMPHASIZED_EDGE_SIZE_MIN, 2.4);
  assert.equal(emphasizeEdgeSize(1.4), 2.4);
  assert.equal(emphasizeEdgeSize(2.4), 2.4 * 1.6);
});

test("stroke is never tinted with a cluster wash color", () => {
  for (const wash of CLUSTER_WASH_COLORS) {
    assert.notEqual(emphasizedEdgeStroke(wash).toLowerCase(), wash.toLowerCase());
  }
  assert.equal(CLUSTER_WASH_COLORS.includes(EMPHASIZED_EDGE_COLOR as never), false);
});

test("one edge at a time, bound to selected pair when not hovering", () => {
  assert.equal(
    activeEmphasizedEdgeKey({
      hoveredKey: "ab",
      selectedPair: { source: "c", target: "d" },
      edges: EDGES,
    }),
    "ab"
  );
  assert.equal(
    activeEmphasizedEdgeKey({
      hoveredKey: null,
      selectedPair: { source: "d", target: "c" },
      edges: EDGES,
    }),
    "cd"
  );
  assert.equal(
    activeEmphasizedEdgeKey({
      hoveredKey: null,
      selectedPair: null,
      edges: EDGES,
    }),
    null
  );
  assert.equal(edgeMatchesPair("c", "d", { source: "d", target: "c" }), true);
  assert.equal(edgeMatchesPair("a", "b", { source: "c", target: "d" }), false);
});

test("Who pair labels stay on the selected edge, not hover", () => {
  const pair = visibleWhoLabelIds({
    nodeIds: ["a", "b", "c", "d"],
    selectedEdgeEndpoints: ["c", "d"],
  });
  assert.deepEqual([...pair].sort(), ["c", "d"]);
  const idle = visibleWhoLabelIds({ nodeIds: ["a", "b", "c"] });
  assert.deepEqual([...idle].sort(), ["a", "b", "c"]);
});

test("wash stays ground at 12% and under the ink stroke", () => {
  assert.equal(CLUSTER_WASH_OPACITY, 0.12);
  assert.deepEqual(WHO_EDGE_OVERLAY_ORDER, [
    "cluster-wash",
    "emphasized-ink",
    "cluster-pill",
  ]);
  assert.ok(
    WHO_EDGE_OVERLAY_ORDER.indexOf("cluster-wash") <
      WHO_EDGE_OVERLAY_ORDER.indexOf("emphasized-ink")
  );
  assert.ok(
    WHO_EDGE_OVERLAY_ORDER.indexOf("emphasized-ink") <
      WHO_EDGE_OVERLAY_ORDER.indexOf("cluster-pill")
  );
});

test("cluster pills stay on Wider and All; Most involved has none", () => {
  assert.equal(clusterCauseOnStop("most"), false);
  assert.equal(clusterCauseOnStop("wider"), true);
  assert.equal(clusterCauseOnStop("all"), true);
});
