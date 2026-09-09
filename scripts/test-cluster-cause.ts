import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClusterCauses,
  clusterCauseHasWash,
  clusterCauseOnStop,
  clusterStandsApart,
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
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const nodes = [...council, "out1", "out2"];
  const edges = clique(council, [org("council", "City Council")]);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "org");
  assert.equal(causes[0].label, "City Council");
  assert.equal(causes[0].orgId, "council");
  assert.deepEqual(causes[0].memberIds, council.slice().sort());
  assert.equal(clusterLabelText(causes[0]), "City Council");
  assert.equal(clusterCauseHasWash(causes[0]), true);
});

test("a group of five or more with no dominant org is Mixed boards", () => {
  const mixed = ["ada", "bea", "cam", "dee", "eve"];
  const nodes = [...mixed, "out1", "out2"];
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
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const nodes = [...council, "out1", "out2"];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
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

test("pairs are not clusters; named size floor stays five", () => {
  const causes = buildClusterCauses(
    ["ada", "bea"],
    [edge("ada", "bea", [org("rotary", "Rotary")])]
  );
  assert.deepEqual(causes, []);
  assert.equal(MIN_CLUSTER_SIZE, 3);
  assert.equal(MIN_NAMED_CLUSTER_SIZE, 5);
});

test("a trio under the floor gets no pill and no Mixed boards dump", () => {
  const nodes = ["ada", "bea", "cam", "out1", "out2"];
  const edges = [
    edge("ada", "bea", [org("rotary", "Rotary")]),
    edge("bea", "cam", [org("planning", "Planning Commission")]),
    edge("ada", "cam", [org("chamber", "Chamber")]),
  ];
  assert.deepEqual(buildClusterCauses(nodes, edges), []);
});

test("a group under five does not get a title even when one org dominates", () => {
  const nodes = ["ada", "bea", "cam", "out1", "out2"];
  const edges = clique(["ada", "bea", "cam"], [org("council", "City Council")]);
  assert.deepEqual(buildClusterCauses(nodes, edges), []);
});

test("unlabeled small groups are not dumped into Mixed boards", () => {
  const council = ["ada", "bea", "cam"];
  const rotary = ["dee", "eve", "fay"];
  const parks = ["gus", "hal", "ida"];
  const nodes = [...council, ...rotary, ...parks];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
    ...clique(parks, [org("parks", "Parks Commission")]),
  ];
  assert.deepEqual(buildClusterCauses(nodes, edges), []);
});

test("a named stand-apart group of five does not create Mixed boards for smaller groups", () => {
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
    causes.map((cause) => cause.label),
    ["City Council"]
  );
  assert.equal(
    causes.some((cause) => cause.kind === "mixed"),
    false
  );
});

test("a small overlapping group does not mint Mixed boards next to a named pill", () => {
  const council = ["ada", "bea", "cam", "dee", "eve"];
  const rotary = ["eve", "fay", "gus"];
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay", "gus"];
  const edges = [
    ...clique(council, [org("council", "City Council")]),
    ...clique(rotary, [org("rotary", "Rotary")]),
  ];
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "org");
  assert.equal(causes[0].label, "City Council");
});

test("stand-apart Mixed boards lists every org and does not cap at three", () => {
  const mixed = ["a", "b", "c", "d", "e"];
  const nodes = [...mixed, "out1", "out2"];
  const edges = [
    edge("a", "b", [org("one", "One")]),
    edge("b", "c", [org("two", "Two")]),
    edge("c", "d", [org("three", "Three")]),
    edge("d", "e", [org("four", "Four")]),
    edge("e", "a", [org("five", "Five")]),
    edge("a", "c", [org("six", "Six")]),
  ];
  const top = topSharedOrgs(mixed, edges);
  assert.ok(top.length >= 4);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].kind, "mixed");
  assert.equal(causes[0].orgId, null);
  assert.ok(causes[0].topOrgs.length >= 4);
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

test("cluster cause gate: people Wider and All; organizations All only", () => {
  assert.equal(clusterCauseOnStop("most"), false);
  assert.equal(clusterCauseOnStop("wider"), true);
  assert.equal(clusterCauseOnStop("all"), true);
  assert.equal(clusterCauseOnStop("most", "people"), false);
  assert.equal(clusterCauseOnStop("wider", "people"), true);
  assert.equal(clusterCauseOnStop("all", "people"), true);
  assert.equal(clusterCauseOnStop("most", "organization"), false);
  assert.equal(clusterCauseOnStop("wider", "organization"), false);
  assert.equal(clusterCauseOnStop("all", "organization"), true);
});

test("a group stands apart when most links stay inside, not out", () => {
  const blob = ["ada", "bea", "cam", "dee", "eve"];
  const rest = ["fay", "gus", "hal", "ida", "jen"];
  const nodes = [...blob, ...rest];
  const inside = clique(blob, [org("village", "Lamorinda Village")]);
  assert.equal(clusterStandsApart(blob, nodes, inside), true);

  const buried = [
    ...inside,
    ...rest.flatMap((outsider) =>
      blob.map((member) => edge(member, outsider, [org("mass", "Mass")]))
    ),
  ];
  assert.equal(clusterStandsApart(blob, nodes, buried), false);
  assert.deepEqual(buildClusterCauses(nodes, buried), []);
  const named = buildClusterCauses(nodes, inside);
  assert.equal(named.length, 1);
  assert.equal(named[0].label, "Lamorinda Village");
});

test("the whole drawing is not a stand-apart group", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve"];
  const edges = clique(nodes, [org("council", "City Council")]);
  assert.equal(clusterStandsApart(nodes, nodes, edges), false);
  assert.deepEqual(buildClusterCauses(nodes, edges), []);
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

  const core = ["ada", "bea", "cam", "dee", "eve"];
  const nodes = [...core, "out1", "out2"];
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
  const sitting = orgSittingGroups(core, edges);
  assert.equal(sitting.length, 1);
  const causes = buildClusterCauses(nodes, edges);
  assert.equal(causes.length, 1);
  assert.equal(causes[0].label, "City Council");
});

test("the cream pill uses the full org name", () => {
  const league = ["ada", "bea", "cam", "dee", "eve"];
  const nodes = [...league, "out1", "out2"];
  const edges = clique(league, [
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
