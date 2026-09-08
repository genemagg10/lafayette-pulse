import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClusterCauses,
  clusterCauseHasWash,
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
  MIN_CLUSTER_SIZE,
  MIN_NAMED_CLUSTER_SIZE,
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

function clique(
  ids: readonly string[],
  orgs: Array<{ id: string; label: string }>
): ClusterEdge[] {
  const edges: ClusterEdge[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      edges.push(edge(ids[i], ids[j], orgs));
    }
  }
  return edges;
}

test("cluster of five or more who share one org is named for that org", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve"];
  const edges = clique(nodes, [org("council", "City Council")]);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "org");
  assert.equal(causes[0].label, "City Council");
  assert.equal(causes[0].orgId, "council");
  assert.deepEqual(causes[0].memberIds, nodes.slice().sort());
  assert.equal(clusterLabelText(causes[0]), "City Council");
  assert.equal(clusterCauseHasWash(causes[0]), true);
});

test("a group of five or more with no dominant org is Mixed boards", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve"];
  const edges = [
    edge("ada", "bea", [org("rotary", "Rotary")]),
    edge("bea", "cam", [org("planning", "Planning Commission")]),
    edge("cam", "dee", [org("chamber", "Chamber")]),
    edge("dee", "eve", [org("lwv", "League")]),
    edge("eve", "ada", [org("village", "Village")]),
    edge("ada", "cam", [org("parks", "Parks")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.equal(causes[0].label, MIXED_BOARDS_LABEL);
  assert.equal(causes[0].orgId, null);
  assert.equal(causes[0].folded, false);
  assert.equal(clusterCauseHasWash(causes[0]), false);
  assert.equal(clusterLabelText(causes[0]), "Mixed boards");
});

test("an org that covers everyone still wins when they also share other boards", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve"];
  const edges = [
    ...clique(nodes, [org("council", "City Council")]),
    edge("ada", "bea", [
      org("council", "City Council"),
      org("planning", "Planning Commission"),
    ]),
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

test("two disconnected groups of five each keep that org as the cause", () => {
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const rotary = ["fay", "gus", "hal", "ida", "jen"];
  const nodes = [...council, ...rotary];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
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
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const rotary = ["fay", "gus", "hal", "ida", "jen"];
  const nodes = [...council, ...rotary];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    edge("eve", "fay", [org("bridge", "Bridge")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
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

test("a shared person does not collapse two board groups of five into Mixed boards", () => {
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const rotary = ["eve", "fay", "gus", "hal", "ida"];
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay", "gus", "hal", "ida"];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.deepEqual(
    causes.map((cause) => cause.label).sort(),
    ["City Council", "Rotary"]
  );
});

test("the org that dominates a group of five wins without covering every bridged member", () => {
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const nodes = [...council, "fay"];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    edge("ada", "fay", [org("rotary", "Rotary")]),
    edge("bea", "fay", [org("planning", "Planning Commission")]),
    edge("cam", "fay", [org("chamber", "Chamber")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  const named = causes.filter((cause) => cause.kind === "org");
  assert.equal(named.some((cause) => cause.orgId === "council"), true);
  assert.equal(
    named.some((cause) => cause.memberIds.includes("fay") && cause.orgId === "council"),
    false
  );
  assert.equal(
    causes.some((cause) => cause.kind === "mixed" && cause.memberIds.includes("fay")),
    false
  );
});

test("pairs are not clusters; named size is five", () => {
  const causes = buildClusterCauses(
    ["ada", "bea"],
    [edge("ada", "bea", [org("rotary", "Rotary")])]
  );
  assert.deepEqual(causes, []);
  assert.equal(MIN_CLUSTER_SIZE, 3);
  assert.equal(MIN_NAMED_CLUSTER_SIZE, 5);
});

test("a mixed trio under five still folds into Mixed boards, not a named pill", () => {
  const nodes = ["ada", "bea", "cam"];
  const edges = [
    edge("ada", "bea", [org("rotary", "Rotary")]),
    edge("bea", "cam", [org("planning", "Planning Commission")]),
    edge("ada", "cam", [org("chamber", "Chamber")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.deepEqual(
    causes[0].topOrgs.map((row) => row.label).sort(),
    ["Chamber", "Planning Commission", "Rotary"]
  );
});

test("a group under five does not get a named pill even when one org dominates", () => {
  const nodes = ["ada", "bea", "cam"];
  const edges = clique(nodes, [org("council", "City Council")]);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.equal(causes[0].label, MIXED_BOARDS_LABEL);
  assert.equal(clusterCauseHasWash(causes[0]), false);
  assert.deepEqual(
    causes[0].topOrgs.map((row) => row.label),
    ["City Council"]
  );
});

test("smaller groups fold into one Mixed boards heading", () => {
  const council = ["ada", "bea", "cam"];
  const rotary = ["dee", "eve", "fay"];
  const parks = ["gus", "hal", "ida"];
  const nodes = [...council, ...rotary, ...parks];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
    ...clique(parks, [org("parks", "Parks Commission")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.equal(causes[0].folded, true);
  assert.equal(causes[0].label, MIXED_BOARDS_LABEL);
  assert.equal(clusterCauseHasWash(causes[0]), false);
  assert.deepEqual(
    causes[0].topOrgs.map((row) => row.label).sort(),
    ["City Council", "Parks Commission", "Rotary"]
  );
});

test("a named group of five keeps its pill while smaller groups share Mixed boards", () => {
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const rotary = ["fay", "gus", "hal"];
  const parks = ["ida", "jen", "kai"];
  const nodes = [...council, ...rotary, ...parks];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
    ...clique(parks, [org("parks", "Parks Commission")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.deepEqual(
    causes.map((cause) => cause.label).sort(),
    ["City Council", MIXED_BOARDS_LABEL]
  );
  const mixed = causes.find((cause) => cause.kind === "mixed");
  assert.ok(mixed);
  assert.equal(mixed.folded, true);
  assert.equal(clusterCauseHasWash(mixed), false);
  assert.deepEqual(
    mixed.topOrgs.map((row) => row.label).sort(),
    ["Parks Commission", "Rotary"]
  );
});

test("Mixed boards lists the smaller orgs, not an org that already has a named pill", () => {
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const rotary = ["eve", "fay", "gus"];
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay", "gus"];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  const named = causes.filter((cause) => cause.kind === "org");
  const mixed = causes.filter((cause) => cause.kind === "mixed");
  assert.equal(named.length, 1);
  assert.equal(named[0].label, "City Council");
  assert.equal(mixed.length, 1);
  assert.deepEqual(
    mixed[0].topOrgs.map((row) => row.label),
    ["Rotary"]
  );
  assert.equal(mixed[0].memberIds.includes("ada"), false);
  assert.equal(mixed[0].memberIds.includes("fay"), true);
  assert.equal(mixed[0].memberIds.includes("gus"), true);
});

test("mixed lists every smaller org and does not cap at three", () => {
  const groups = [
    ["a1", "a2", "a3"],
    ["b1", "b2", "b3"],
    ["c1", "c2", "c3"],
    ["d1", "d2", "d3"],
  ];
  const labels = [
    org("one", "One"),
    org("two", "Two"),
    org("three", "Three"),
    org("four", "Four"),
  ];
  const nodes = groups.flat();
  const edges = groups.flatMap((ids, index) => clique(ids, [labels[index]]));
  const top = topSharedOrgs(nodes, edges);
  assert.equal(top.length, 4);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.equal(causes[0].orgId, null);
  assert.equal(causes[0].folded, true);
  assert.deepEqual(
    causes[0].topOrgs.map((row) => row.label).sort(),
    ["Four", "One", "Three", "Two"]
  );
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
  const nodes = ["ada", "bea", "cam", "dee", "eve"];
  const edges = clique(nodes, [
    org("lwv", "League of Women Voters of the Diablo Valley"),
  ]);
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
  assert.equal(clusterCauseHasWash({
    id: "mixed:x",
    kind: "mixed",
    label: MIXED_BOARDS_LABEL,
    orgId: null,
    memberIds: ["a", "b", "c"],
    topOrgs: [],
    folded: true,
  }), false);
});
