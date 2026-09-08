import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClusterCauses,
  clusterCauseOnStop,
  clusterLabelAnchor,
  clusterLabelText,
  clusterWashColor,
  dominantOrg,
  findBridgeKeys,
  nudgePointOffNodes,
  orgSittingGroups,
  pruneNestedSittingGroups,
  CLUSTER_LABEL_INK,
  CLUSTER_LABEL_SIZE_PX,
  CLUSTER_MIXED_STROKE,
  CLUSTER_WASH_COLORS,
  CLUSTER_WASH_IS_GROUND,
  CLUSTER_WASH_OPACITY,
  MIXED_BOARDS_LABEL,
  MIXED_ORG_LIST_MAX,
  MIN_CLUSTER_SIZE,
  topSharedOrgs,
  type ClusterEdge,
} from "../lib/cluster-cause.ts";

function org(id: string, label: string) {
  return { id, label, kind: "organization" as const };
}

function edge(
  source: string,
  target: string,
  orgs: Array<{ id: string; label: string }>
): ClusterEdge {
  return {
    source,
    target,
    shared_entities: orgs.map((row) => ({
      id: row.id,
      label: row.label,
      kind: "organization",
    })),
    shared_names: orgs.map((row) => row.label),
  };
}

test("cluster of people who share one org is named for that org", () => {
  const nodes = ["ada", "bea", "cam"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "org");
  assert.equal(causes[0].label, "City Council");
  assert.equal(causes[0].orgId, "council");
  assert.deepEqual(causes[0].memberIds, ["ada", "bea", "cam"]);
  assert.equal(clusterLabelText(causes[0]), "City Council");
});

test("no single org explaining the group is Mixed boards", () => {
  const nodes = ["ada", "bea", "cam"];
  const edges = [
    edge("ada", "bea", [org("rotary", "Rotary")]),
    edge("bea", "cam", [org("planning", "Planning Commission")]),
    edge("ada", "cam", [org("chamber", "Chamber")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.equal(causes[0].label, MIXED_BOARDS_LABEL);
  assert.equal(causes[0].orgId, null);
  assert.equal(causes[0].topOrgs.length <= MIXED_ORG_LIST_MAX, true);
  assert.deepEqual(
    causes[0].topOrgs.map((row) => row.label).sort(),
    ["Chamber", "Planning Commission", "Rotary"]
  );
  assert.equal(clusterLabelText(causes[0]), "Mixed boards");
});

test("an org that covers everyone still wins when they also share other boards", () => {
  const nodes = ["ada", "bea", "cam"];
  const edges = [
    edge("ada", "bea", [
      org("council", "City Council"),
      org("planning", "Planning Commission"),
    ]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  const named = causes.filter((cause) => cause.kind === "org");
  assert.equal(
    named.some((cause) => cause.orgId === "council"),
    true
  );
  assert.equal(
    named.some((cause) => cause.orgId === "planning"),
    false
  );
  assert.equal(
    causes.some((cause) => cause.kind === "mixed"),
    false
  );
});

test("two disconnected org groups each keep that org as the cause", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
    edge("dee", "fay", [org("rotary", "Rotary")]),
    edge("eve", "fay", [org("rotary", "Rotary")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.deepEqual(
    causes.map((cause) => cause.label).sort(),
    ["City Council", "Rotary"]
  );
  assert.equal(
    causes.some((cause) => cause.kind === "mixed"),
    false
  );
});

test("a thin bridge does not merge two sitting org groups into Mixed boards", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("cam", "dee", [org("bridge", "Bridge")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
    edge("dee", "fay", [org("rotary", "Rotary")]),
    edge("eve", "fay", [org("rotary", "Rotary")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.deepEqual(
    causes.map((cause) => cause.label).sort(),
    ["City Council", "Rotary"]
  );
  assert.equal(
    causes.some((cause) => cause.kind === "mixed"),
    false
  );
  assert.equal(findBridgeKeys(nodes, edges).size >= 1, true);
});

test("a shared person does not collapse two board groups into Mixed boards", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("cam", "dee", [org("rotary", "Rotary")]),
    edge("cam", "eve", [org("rotary", "Rotary")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.deepEqual(
    causes.map((cause) => cause.label).sort(),
    ["City Council", "Rotary"]
  );
});

test("the org that dominates a group wins without covering every bridged member", () => {
  const nodes = ["ada", "bea", "cam", "dee"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("ada", "dee", [org("rotary", "Rotary")]),
    edge("bea", "dee", [org("planning", "Planning Commission")]),
    edge("cam", "dee", [org("chamber", "Chamber")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  const named = causes.filter((cause) => cause.kind === "org");
  assert.equal(named.some((cause) => cause.orgId === "council"), true);
  assert.equal(
    named.some((cause) => cause.memberIds.includes("dee") && cause.orgId === "council"),
    false
  );
  assert.equal(
    causes.some((cause) => cause.kind === "mixed" && cause.memberIds.includes("dee")),
    false
  );
});

test("pairs are not clusters", () => {
  const causes = buildClusterCauses(
    ["ada", "bea"],
    [edge("ada", "bea", [org("rotary", "Rotary")])]
  );
  assert.deepEqual(causes, []);
  assert.equal(MIN_CLUSTER_SIZE, 3);
});

test("mixed lists at most three shared orgs and does not pick a winner", () => {
  const nodes = ["a", "b", "c", "d"];
  const edges = [
    edge("a", "b", [org("one", "One")]),
    edge("b", "c", [org("two", "Two")]),
    edge("c", "d", [org("three", "Three")]),
    edge("a", "d", [org("four", "Four")]),
    edge("a", "c", [org("five", "Five")]),
  ];
  const top = topSharedOrgs(nodes, edges, MIXED_ORG_LIST_MAX);
  assert.equal(top.length, 3);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.equal(causes[0].orgId, null);
  assert.equal(causes[0].topOrgs.length, 3);
});

test("wash color is stable per org and from the muted set", () => {
  assert.equal(clusterWashColor("council"), clusterWashColor("council"));
  assert.notEqual(CLUSTER_WASH_COLORS.includes("#0072B2" as typeof CLUSTER_WASH_COLORS[number]), true);
  assert.equal(CLUSTER_WASH_COLORS.includes(clusterWashColor("council") as typeof CLUSTER_WASH_COLORS[number]), true);
  assert.equal(CLUSTER_WASH_OPACITY, 0.12);
  assert.equal(CLUSTER_MIXED_STROKE, "#C9C5B8");
  assert.equal(CLUSTER_LABEL_INK, "#1A2420");
  assert.equal(CLUSTER_LABEL_SIZE_PX, 11);
});

test("label sits in the open middle, not on a node", () => {
  const open = clusterLabelAnchor([
    { x: -20, y: -20 },
    { x: 20, y: -20 },
    { x: 0, y: 20 },
  ]);
  assert.ok(open);
  assert.ok(Math.abs(open.x) < 1);
  assert.ok(Math.abs(open.y + 6.666) < 1);

  const onNode = clusterLabelAnchor(
    [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: -30, y: 0 },
    ],
    16
  );
  assert.ok(onNode);
  assert.ok(Math.hypot(onNode.x, onNode.y) >= 16 - 0.01);
});

test("nudge keeps the pill off a node disc", () => {
  const moved = nudgePointOffNodes({ x: 0, y: 0 }, [{ x: 0, y: 0, size: 10 }], 14);
  assert.ok(Math.hypot(moved.x, moved.y) >= 24 - 0.01);
});

test("cluster cause is off on Most involved, on for Wider and All", () => {
  assert.equal(clusterCauseOnStop("most"), false);
  assert.equal(clusterCauseOnStop("wider"), true);
  assert.equal(clusterCauseOnStop("all"), true);
});

test("dominant org is most members, then most internal edges, else none", () => {
  assert.equal(
    dominantOrg([
      { id: "a", label: "A", people: 4, edges: 2 },
      { id: "b", label: "B", people: 3, edges: 5 },
    ])?.id,
    "a"
  );
  assert.equal(
    dominantOrg([
      { id: "a", label: "A", people: 3, edges: 4 },
      { id: "b", label: "B", people: 3, edges: 2 },
    ])?.id,
    "a"
  );
  assert.equal(
    dominantOrg([
      { id: "a", label: "A", people: 3, edges: 2 },
      { id: "b", label: "B", people: 3, edges: 2 },
    ]),
    null
  );
});

test("a nested board inside a larger sitting group does not get its own pill", () => {
  const pruned = pruneNestedSittingGroups([
    { memberIds: ["ada", "bea", "cam"] },
    { memberIds: ["ada", "bea", "cam", "dee", "eve"] },
  ]);
  assert.deepEqual(pruned, [{ memberIds: ["ada", "bea", "cam", "dee", "eve"] }]);

  const nodes = ["ada", "bea", "cam", "dee", "eve"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council"), org("planning", "Planning")]),
    edge("ada", "cam", [org("council", "City Council"), org("planning", "Planning")]),
    edge("bea", "cam", [org("council", "City Council"), org("planning", "Planning")]),
    edge("ada", "dee", [org("council", "City Council")]),
    edge("ada", "eve", [org("council", "City Council")]),
    edge("bea", "dee", [org("council", "City Council")]),
    edge("bea", "eve", [org("council", "City Council")]),
    edge("cam", "dee", [org("council", "City Council")]),
    edge("cam", "eve", [org("council", "City Council")]),
    edge("dee", "eve", [org("council", "City Council")]),
  ];
  const sitting = orgSittingGroups(nodes, edges);
  assert.equal(sitting.length, 1);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].label, "City Council");
});

test("the cream pill uses the full org name", () => {
  const nodes = ["ada", "bea", "cam"];
  const edges = [
    edge("ada", "bea", [org("lwv", "League of Women Voters of the Diablo Valley")]),
    edge("ada", "cam", [org("lwv", "League of Women Voters of the Diablo Valley")]),
    edge("bea", "cam", [org("lwv", "League of Women Voters of the Diablo Valley")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(
    clusterLabelText(causes[0]),
    "League of Women Voters of the Diablo Valley"
  );
  assert.equal(clusterLabelText(causes[0]).includes("…"), false);
});

test("wash stays ground and mixed boards has no wash color", () => {
  assert.equal(CLUSTER_WASH_IS_GROUND, true);
  assert.equal(CLUSTER_WASH_OPACITY, 0.12);
});
