import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIXED_BOARDS_LABEL,
  MIN_CLUSTER_SIZE,
  type ClusterEdge,
} from "../lib/cluster-cause.ts";
import {
  chipContainsOrg,
  edgeHiddenByOrgFilter,
  edgeSharesOrg,
  orgEdgeFilterChips,
  peopleOrgEdgeFilterOnStop,
} from "../lib/people-org-edge-filter.ts";
import { GRAPH_RANGE_MOST, GRAPH_RANGE_WIDER } from "../lib/graph-range.ts";

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

test("filter is on Wider and All only — same gate as cluster pills", () => {
  assert.equal(peopleOrgEdgeFilterOnStop("most"), false);
  assert.equal(peopleOrgEdgeFilterOnStop("wider"), true);
  assert.equal(peopleOrgEdgeFilterOnStop("all"), true);
});

test("this PR does not change width stops or cluster min-size", () => {
  assert.equal(GRAPH_RANGE_MOST, 12);
  assert.equal(GRAPH_RANGE_WIDER, 24);
  assert.equal(MIN_CLUSTER_SIZE, 3);
});

test("named cluster orgs become chips first; mixed holds the smaller list", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
    edge("eve", "fay", [org("planning", "Planning Commission")]),
    edge("dee", "fay", [org("chamber", "Chamber")]),
  ];
  const chips = orgEdgeFilterChips(nodes, edges);
  assert.equal(chips[0]?.kind, "org");
  assert.equal(chips[0]?.kind === "org" && chips[0].id, "council");
  assert.equal(chips[0]?.label, "City Council");
  const mixed = chips.find((chip) => chip.kind === "mixed");
  assert.ok(mixed && mixed.kind === "mixed");
  assert.equal(mixed.label, MIXED_BOARDS_LABEL);
  assert.deepEqual(
    mixed.orgs.map((row) => row.label).sort(),
    ["Chamber", "Planning Commission", "Rotary"]
  );
  assert.equal(
    chips.some((chip) => chip.kind === "org" && chip.id === "rotary"),
    false
  );
});

test("smaller groups do not get their own chips unless listed under Mixed boards", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
    edge("eve", "fay", [org("planning", "Planning Commission")]),
    edge("dee", "fay", [org("chamber", "Chamber")]),
  ];
  const chips = orgEdgeFilterChips(nodes, edges);
  const namedIds = chips
    .filter((chip) => chip.kind === "org")
    .map((chip) => chip.id);
  assert.deepEqual(namedIds, ["council"]);
  const mixed = chips.find((chip) => chip.kind === "mixed");
  assert.ok(mixed && mixed.kind === "mixed");
  assert.equal(
    mixed.orgs.some((org) => org.id === "rotary"),
    true
  );
});

test("two named sitting groups each get a chip, in cluster order", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
    edge("dee", "fay", [org("rotary", "Rotary")]),
    edge("eve", "fay", [org("rotary", "Rotary")]),
  ];
  const chips = orgEdgeFilterChips(nodes, edges);
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ["City Council", "Rotary"]
  );
  assert.equal(
    chips.some((chip) => chip.kind === "mixed"),
    false
  );
});

test("a named org is not repeated under Mixed boards", () => {
  const nodes = ["ada", "bea", "cam", "dee", "eve", "fay"];
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("ada", "cam", [org("council", "City Council")]),
    edge("bea", "cam", [org("council", "City Council")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
    edge("eve", "fay", [org("planning", "Planning Commission")]),
    edge("dee", "fay", [org("chamber", "Chamber")]),
  ];
  const chips = orgEdgeFilterChips(nodes, edges);
  const mixed = chips.find((chip) => chip.kind === "mixed");
  assert.ok(mixed && mixed.kind === "mixed");
  assert.equal(
    mixed.orgs.some((org) => org.id === "council"),
    false
  );
});

test("pairs below cluster size do not mint chips", () => {
  const chips = orgEdgeFilterChips(
    ["ada", "bea"],
    [edge("ada", "bea", [org("rotary", "Rotary")])]
  );
  assert.deepEqual(chips, []);
});

test("selecting an org hides other lines and keeps every drawn person", () => {
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
  const visible = edges.filter((row) => !edgeHiddenByOrgFilter(row, "council"));
  assert.deepEqual(
    visible.map((row) => [row.source, row.target].sort().join("-")).sort(),
    ["ada-bea", "ada-cam", "bea-cam"]
  );
  assert.equal(edgeSharesOrg(edges[3], "council"), false);
  assert.equal(edgeHiddenByOrgFilter(edges[3], "council"), true);
  assert.deepEqual(nodes, ["ada", "bea", "cam", "dee", "eve", "fay"]);
});

test("clear restores every link; one org at a time", () => {
  const edges = [
    edge("ada", "bea", [org("council", "City Council")]),
    edge("dee", "eve", [org("rotary", "Rotary")]),
  ];
  assert.equal(
    edges.every((row) => !edgeHiddenByOrgFilter(row, null)),
    true
  );
  assert.equal(edgeHiddenByOrgFilter(edges[0], "rotary"), true);
  assert.equal(edgeHiddenByOrgFilter(edges[1], "rotary"), false);
});

test("a mixed-list org uses the same hide rule", () => {
  const row = edge("dee", "eve", [org("rotary", "Rotary")]);
  assert.equal(edgeHiddenByOrgFilter(row, "rotary"), false);
  assert.equal(
    edgeHiddenByOrgFilter(
      edge("ada", "bea", [org("council", "City Council")]),
      "rotary"
    ),
    true
  );
});

test("chip lookup sees named chips and mixed-list orgs", () => {
  const chips = orgEdgeFilterChips(
    ["ada", "bea", "cam", "dee", "eve", "fay"],
    [
      edge("ada", "bea", [org("council", "City Council")]),
      edge("ada", "cam", [org("council", "City Council")]),
      edge("bea", "cam", [org("council", "City Council")]),
      edge("dee", "eve", [org("rotary", "Rotary")]),
      edge("eve", "fay", [org("planning", "Planning Commission")]),
      edge("dee", "fay", [org("chamber", "Chamber")]),
    ]
  );
  assert.equal(chipContainsOrg(chips, "council"), true);
  assert.equal(chipContainsOrg(chips, "rotary"), true);
  assert.equal(chipContainsOrg(chips, "missing"), false);
  assert.equal(chipContainsOrg(chips, null), false);
});
