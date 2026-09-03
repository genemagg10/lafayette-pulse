import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWhyLinkedModel,
  sameWhyLinkedEdge,
  stanceHoverLabel,
  toggleWhyLinkedEdge,
  whyLinkedTooltipLines,
  type WhyLinkedEdge,
} from "../lib/why-linked.ts";
import {
  EDGE_PICK_RADIUS_PX,
  distanceToSegment,
  pickClosestEdge,
  pickClosestNode,
} from "../lib/graph-edge-pick.ts";
import {
  isRetiredFootprintTab,
  parseWhoTab,
  resolveBoardRedirect,
  WHO_FOOTPRINT_REDIRECT,
  WHO_TABS,
} from "../lib/layout-ia.ts";

function membershipEdge(partial: Partial<WhyLinkedEdge> = {}): WhyLinkedEdge {
  return {
    source: "p1",
    target: "o1",
    kind: "membership",
    role: "Commissioner",
    start_date: "2022-01-01",
    end_date: null,
    source_url: "https://example.test/member",
    ...partial,
  };
}

test("Who primary tabs are People, Organizations, Measures only", () => {
  assert.deepEqual(
    WHO_TABS.map((tab) => tab.id),
    ["people", "orgs", "measures"]
  );
  assert.equal(parseWhoTab("footprint"), "people");
  assert.equal(isRetiredFootprintTab("footprint"), true);
  assert.equal(resolveBoardRedirect("#footprint", ""), WHO_FOOTPRINT_REDIRECT);
  assert.equal(
    resolveBoardRedirect("", "?tab=footprint"),
    WHO_FOOTPRINT_REDIRECT
  );
});

test("membership hover is Role · date range and at most two lines", () => {
  const lines = whyLinkedTooltipLines(membershipEdge());
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "Commissioner · 2022-01-01 – present");
  assert.ok(lines.every((line) => !/allies/i.test(line)));
});

test("seat hover is Seat title · date range", () => {
  const lines = whyLinkedTooltipLines({
    source: "p1",
    target: "s1",
    kind: "seat_holder",
    role: "Mayor",
    start_date: "2020-12-01",
    end_date: "2024-12-01",
  });
  assert.deepEqual(lines, ["Mayor · 2020-12-01 – 2024-12-01"]);
});

test("org affinity hover is shared members · Jaccard", () => {
  const lines = whyLinkedTooltipLines({
    source: "o1",
    target: "o2",
    kind: "membership",
    shared: 3,
    jaccard: 0.25,
    shared_names: ["Ada", "Bea", "Cam"],
  });
  assert.deepEqual(lines, ["3 shared members · Jaccard 0.25"]);
});

test("person-person hop-2 hover is N shared boards", () => {
  const lines = whyLinkedTooltipLines({
    source: "p1",
    target: "p2",
    kind: "shared_board",
    shared: 2,
    shared_names: ["City Council", "Planning Commission"],
  });
  assert.deepEqual(lines, ["2 shared boards"]);
});

test("stance hover is Support / Oppose / Co-stance and never allies", () => {
  assert.deepEqual(
    whyLinkedTooltipLines({
      source: "o1",
      target: "o2",
      kind: "co-stance",
      stance_kind: "co-stance",
      co_stance: 4,
      opposed: 1,
    }),
    ["Co-stance"]
  );
  assert.equal(
    stanceHoverLabel({
      source: "o1",
      target: "o2",
      stance_kind: "opposed-on-issues",
      opposed: 3,
    }),
    "Oppose"
  );
  assert.deepEqual(
    whyLinkedTooltipLines({
      source: "p1",
      target: "m1",
      kind: "stance",
      polarity: "support",
    }),
    ["Support"]
  );
  const text = whyLinkedTooltipLines({
    source: "a",
    target: "b",
    stance_kind: "co-stance",
    co_stance: 2,
    opposed: 0,
  }).join(" ");
  assert.equal(/allies/i.test(text), false);
});

test("Why linked panel model keeps seat vs membership and source link", () => {
  const membership = buildWhyLinkedModel(membershipEdge(), [
    { id: "p1", label: "Ada Lovelace", kind: "person" },
    { id: "o1", label: "Planning Commission", kind: "organization" },
  ]);
  assert.equal(membership.kind, "membership");
  assert.equal(membership.relation, "Membership");
  assert.equal(membership.role, "Commissioner");
  assert.equal(membership.source_url, "https://example.test/member");
  assert.equal(membership.endpoints[0].label, "Ada Lovelace");

  const seat = buildWhyLinkedModel(
    {
      source: "p1",
      target: "s1",
      kind: "seat_holder",
      role: "Mayor",
      start_date: "2022-01-01",
      end_date: null,
      source_url: "https://example.test/seat",
    },
    [
      { id: "p1", label: "Ada Lovelace", kind: "person" },
      { id: "s1", label: "Mayor", kind: "seat" },
    ]
  );
  assert.equal(seat.kind, "seat");
  assert.equal(seat.relation, "Formal seat");
  assert.equal(seat.title, "Formal seat");
});

test("org affinity Why linked includes shared names and Jaccard", () => {
  const model = buildWhyLinkedModel(
    {
      source: "o1",
      target: "o2",
      kind: "membership",
      shared: 2,
      jaccard: 0.4,
      shared_entities: [
        { id: "p1", label: "Ada Lovelace", kind: "person" },
        { id: "p2", label: "Bea King", kind: "person" },
      ],
    },
    [
      { id: "o1", label: "City Council", kind: "organization" },
      { id: "o2", label: "Planning Commission", kind: "organization" },
    ]
  );
  assert.equal(model.kind, "org_affinity");
  assert.equal(model.jaccard, 0.4);
  assert.deepEqual(
    model.shared_items?.map((item) => item.label),
    ["Ada Lovelace", "Bea King"]
  );
});

test("second click on the same edge closes Why linked", () => {
  const edge = membershipEdge();
  const opened = toggleWhyLinkedEdge(null, edge);
  assert.ok(opened);
  assert.equal(toggleWhyLinkedEdge(opened, edge), null);
  assert.equal(sameWhyLinkedEdge(edge, membershipEdge({ role: "Chair" })), true);
});

test("shared-boards Why linked lists org names", () => {
  const model = buildWhyLinkedModel(
    {
      source: "p1",
      target: "p2",
      kind: "shared_board",
      shared: 2,
      shared_entities: [
        { id: "o1", label: "City Council", kind: "organization" },
        { id: "o2", label: "Planning Commission", kind: "organization" },
      ],
    },
    [
      { id: "p1", label: "Ada", kind: "person" },
      { id: "p2", label: "Bea", kind: "person" },
    ]
  );
  assert.equal(model.kind, "shared_boards");
  assert.equal(model.shared, 2);
  assert.deepEqual(
    model.shared_items?.map((item) => item.label),
    ["City Council", "Planning Commission"]
  );
});

test("edge pick radius is fat enough to hit mid-edge without pixel hunting", () => {
  assert.ok(EDGE_PICK_RADIUS_PX >= 12);
  assert.equal(distanceToSegment(50, 8, 0, 0, 100, 0), 8);
  const edges = [{ key: "affinity", x1: 0, y1: 0, x2: 100, y2: 0 }];
  assert.equal(pickClosestEdge(edges, 50, 8, EDGE_PICK_RADIUS_PX), "affinity");
  assert.equal(pickClosestEdge(edges, 50, 2, 1.4), null);
  assert.equal(pickClosestEdge(edges, 50, 40, EDGE_PICK_RADIUS_PX), null);
});

test("edge pick prefers the closer stroke and yields to a node disc", () => {
  const edges = [
    { key: "near", x1: 0, y1: 0, x2: 100, y2: 0 },
    { key: "far", x1: 0, y1: 20, x2: 100, y2: 20 },
  ];
  assert.equal(pickClosestEdge(edges, 50, 6, EDGE_PICK_RADIUS_PX), "near");
  assert.equal(
    pickClosestNode([{ key: "org", x: 50, y: 0, size: 12 }], 50, 4),
    "org"
  );
  assert.equal(
    pickClosestNode([{ key: "org", x: 50, y: 0, size: 12 }], 50, 20),
    null
  );
});
