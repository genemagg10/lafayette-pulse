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
  EMPHASIZED_EDGE_ENDPOINT_GAP_PX,
  EMPHASIZED_EDGE_SIZE_BUMP,
  WHO_EDGE_OVERLAY_ORDER,
  activeEmphasizedEdgeKey,
  edgeMatchesPair,
  emphasizeEdgeSize,
  emphasizeEdgeSizeFactor,
  emphasizedEdgeStroke,
  nodeExtentAlongRay,
  shortenEmphasizedStroke,
  whoNodeShape,
} from "../lib/graph-edge-emphasis.ts";
import { EDGE_PICK_RADIUS_PX } from "../lib/graph-edge-pick.ts";
import { visibleWhoLabelIds } from "../lib/graph-labels.ts";

const EDGES = [
  { key: "ab", source: "a", target: "b" },
  { key: "cd", source: "c", target: "d" },
];

test("hover and selected darken to ink, no new hue", () => {
  assert.equal(EMPHASIZED_EDGE_COLOR, "#1A2420");
  assert.equal(emphasizedEdgeStroke(), "#1A2420");
  assert.equal(emphasizedEdgeStroke(clusterWashColor("council")), "#1A2420");
});

test("emphasis is compressive, not a 2.4 bar", () => {
  assert.equal(EMPHASIZED_EDGE_SIZE_BUMP, 0.45);
  const thin = 1.4;
  const thick = 7.2;
  assert.equal(emphasizeEdgeSizeFactor(thin), 1 + 0.45 / (1 + thin));
  assert.equal(emphasizeEdgeSize(thin), thin * (1 + 0.45 / (1 + thin)));
  assert.equal(emphasizeEdgeSize(thick), thick * (1 + 0.45 / (1 + thick)));
  const thinGain = emphasizeEdgeSize(thin) / thin - 1;
  const thickGain = emphasizeEdgeSize(thick) / thick - 1;
  assert.ok(thinGain > thickGain);
  assert.ok(emphasizeEdgeSize(thin) < 2.4);
  assert.ok(emphasizeEdgeSize(thick) - thick < 0.5);
  assert.ok(emphasizeEdgeSize(thick) < thick * 1.2);
});

test("stroke is never tinted with a cluster wash color", () => {
  for (const wash of CLUSTER_WASH_COLORS) {
    assert.notEqual(emphasizedEdgeStroke(wash).toLowerCase(), wash.toLowerCase());
  }
  assert.equal(CLUSTER_WASH_COLORS.includes(EMPHASIZED_EDGE_COLOR as never), false);
});

test("one edge at a time, hover previews before click holds", () => {
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

test("stroke shortens to each shape edge and leaves a 1px gap", () => {
  assert.equal(EMPHASIZED_EDGE_ENDPOINT_GAP_PX, 1);
  assert.equal(whoNodeShape("square"), "square");
  assert.equal(whoNodeShape("diamond"), "diamond");
  assert.equal(whoNodeShape("circle"), "circle");
  assert.equal(nodeExtentAlongRay("circle", 10, 40, 0), 10);
  assert.equal(nodeExtentAlongRay("square", 10, 40, 0), 10);
  assert.ok(
    Math.abs(nodeExtentAlongRay("square", 10, 40, 40) - 10 / Math.SQRT1_2) < 1e-9
  );
  assert.ok(
    Math.abs(nodeExtentAlongRay("diamond", 10, 40, 0) - 10 * Math.SQRT2) < 1e-9
  );
  assert.ok(Math.abs(nodeExtentAlongRay("diamond", 10, 40, 40) - 10) < 1e-9);

  const circle = shortenEmphasizedStroke(
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { size: 10, shape: "circle" },
    { size: 10, shape: "circle" }
  );
  assert.ok(circle);
  assert.equal(circle.from.x, 11);
  assert.equal(circle.to.x, 89);
  assert.equal(circle.from.y, 0);
  assert.equal(circle.to.y, 0);

  const squareDiag = shortenEmphasizedStroke(
    { x: 0, y: 0 },
    { x: 80, y: 80 },
    { size: 10, shape: "square" },
    { size: 8, shape: "square" }
  );
  assert.ok(squareDiag);
  const diagLen = Math.hypot(80, 80);
  const start = 10 / Math.SQRT1_2 + 1;
  const end = 8 / Math.SQRT1_2 + 1;
  assert.ok(Math.abs(squareDiag.from.x - (80 / diagLen) * start) < 1e-9);
  assert.ok(Math.abs(squareDiag.to.x - (80 - (80 / diagLen) * end)) < 1e-9);

  assert.equal(
    shortenEmphasizedStroke(
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { size: 8, shape: "circle" },
      { size: 8, shape: "circle" }
    ),
    null
  );
});

test("pick target is a fat corridor; painted stroke stays thin", () => {
  assert.ok(EDGE_PICK_RADIUS_PX >= 24);
  assert.ok(EDGE_PICK_RADIUS_PX > emphasizeEdgeSize(1.4) * 4);
  assert.ok(emphasizeEdgeSize(1.4) < 2);
});
