import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrgType } from "../lib/types.ts";
import {
  BUBBLE_FLOOR_PX,
  STANCE_CAPTION,
  STANCE_CORNERS,
  STANCE_EMPTY_COPY,
  STRUCTURE_CAPTION,
  STRUCTURE_CORNERS,
  bubbleDiameter,
  buildOrgPlot,
  compareSide,
  defaultMeasureId,
  hoverLines,
  nudgePixelPoints,
  orgReachCounts,
  orgStanceByActor,
  plottedNodes,
  scaleLinear,
  type OrgPlotMeasureInput,
  type OrgPlotSnapshot,
  type OrgPlotStanceRow,
} from "../lib/org-plot.ts";

const MEASURE_H = "a1111111-2026-4001-8001-111111111111";
const MEASURE_W = "a1111111-2026-4001-8001-222222222222";
const MEASURE_RTM = "a1111111-2026-4001-8001-333333333333";

function org(
  id: string,
  name: string,
  org_type: OrgType = "civic"
): OrgPlotSnapshot["organizations"][number] {
  return { id, name, org_type };
}

function membership(
  person_id: string,
  organization_id: string,
  end_date: string | null = null
): OrgPlotSnapshot["memberships"][number] {
  return { person_id, organization_id, end_date };
}

function snapshot(partial: Partial<OrgPlotSnapshot> = {}): OrgPlotSnapshot {
  return {
    organizations: [],
    memberships: [],
    seats: [],
    seatHolders: [],
    ...partial,
  };
}

function measure(
  id: string,
  short_code: string,
  election_date: string
): OrgPlotMeasureInput {
  return {
    id,
    title: `${short_code} title`,
    short_code,
    summary: null,
    status: "on_ballot",
    election_date,
  };
}

function orgStance(
  actor_id: string,
  subject_id: string,
  polarity: OrgPlotStanceRow["polarity"]
): OrgPlotStanceRow {
  return {
    actor_type: "organization",
    actor_id,
    subject_type: "measure",
    subject_id,
    polarity,
    confidence: 0.95,
  };
}

function personStance(
  actor_id: string,
  subject_id: string,
  polarity: OrgPlotStanceRow["polarity"]
): OrgPlotStanceRow {
  return {
    actor_type: "person",
    actor_id,
    subject_type: "measure",
    subject_id,
    polarity,
    confidence: 0.95,
  };
}

const council = org("council", "City Council", "city_body");
const chamber = org("chamber", "Chamber", "civic");
const rotary = org("rotary", "Rotary", "civic");
const ccta = org("ccta", "Contra Costa Taxpayers Association", "interest");
const lwv = org("lwv", "League of Women Voters of Diablo Valley", "civic");

const graph = snapshot({
  organizations: [council, chamber, rotary, ccta, lwv],
  memberships: [
    membership("ada", "council"),
    membership("bea", "council"),
    membership("ada", "chamber"),
    membership("cam", "chamber"),
    membership("cam", "rotary"),
  ],
  seats: [{ id: "seat-council", organization_id: "council" }],
  seatHolders: [{ seat_id: "seat-council", end_date: null }],
});

const measures = [
  measure(MEASURE_H, "H", "2026-06-02"),
  measure(MEASURE_W, "W", "2026-11-03"),
  measure(MEASURE_RTM, "RTM", "2026-11-03"),
  measure("h-2024", "Measure H (2024)", "2024-11-05"),
];

const stances: OrgPlotStanceRow[] = [
  orgStance("ccta", MEASURE_H, "oppose"),
  personStance("ada", MEASURE_H, "support"),
  personStance("bea", MEASURE_H, "support"),
  orgStance("lwv", "h-2024", "endorse"),
];

test("structure reach is shared-board neighbor count, not a new graph", () => {
  const membersByOrg = new Map([
    ["council", new Set(["ada", "bea"])],
    ["chamber", new Set(["ada", "cam"])],
    ["rotary", new Set(["cam"])],
  ]);
  const reach = orgReachCounts(membersByOrg);
  assert.equal(reach.get("council"), 1);
  assert.equal(reach.get("chamber"), 2);
  assert.equal(reach.get("rotary"), 1);
});

test("structure plot uses footprint and live medians of plotted orgs", () => {
  const plot = buildOrgPlot(graph, { view: "structure" });
  assert.equal(plot.view, "structure");
  assert.equal(plot.caption, STRUCTURE_CAPTION);
  assert.equal(plot.empty_copy, null);
  const ids = plot.nodes.map((node) => node.id).sort();
  assert.deepEqual(ids, ["chamber", "council", "rotary"]);
  assert.equal(plot.nodes.find((n) => n.id === "ccta"), undefined);

  const councilNode = plot.nodes.find((n) => n.id === "council");
  const chamberNode = plot.nodes.find((n) => n.id === "chamber");
  const rotaryNode = plot.nodes.find((n) => n.id === "rotary");
  assert.ok(councilNode);
  assert.equal(councilNode?.reach, 1);
  assert.equal(councilNode?.member_count, 2);
  assert.equal(councilNode?.footprint, 3);
  assert.equal(chamberNode?.reach, 2);
  assert.equal(chamberNode?.member_count, 2);
  assert.equal(chamberNode?.footprint, 2);
  assert.equal(rotaryNode?.reach, 1);
  assert.equal(rotaryNode?.member_count, 1);
  assert.equal(rotaryNode?.footprint, 1);

  const reaches = [1, 2, 1].sort((a, b) => a - b);
  assert.equal(plot.median_x, reaches[1]);
  const footprints = [3, 2, 1].sort((a, b) => a - b);
  assert.equal(plot.median_y, footprints[1]);
});

test("structure corners are civic, never stance words", () => {
  const blob = JSON.stringify({
    ...STRUCTURE_CORNERS,
    caption: STRUCTURE_CAPTION,
  }).toLowerCase();
  assert.equal(STRUCTURE_CORNERS.highReachHighFootprint, "Broad presence");
  assert.equal(STRUCTURE_CORNERS.lowReachHighFootprint, "Large, inward");
  assert.equal(STRUCTURE_CORNERS.highReachLowFootprint, "Connectors");
  assert.equal(STRUCTURE_CORNERS.lowReachLowFootprint, "Local");
  assert.equal(blob.includes("organized"), false);
  assert.equal(blob.includes("support"), false);
  assert.equal(blob.includes("oppose"), false);
  assert.equal(blob.includes("moderate"), false);
  assert.equal(/left\s*\/\s*right/.test(blob), false);
});

test("person quotes never become an org stance", () => {
  const byOrg = orgStanceByActor(stances, MEASURE_H);
  assert.equal(byOrg.get("ccta"), "oppose");
  assert.equal(byOrg.has("council"), false);
  assert.equal(byOrg.has("chamber"), false);
  assert.equal(byOrg.size, 1);
});

test("on the record Measure H plots CCTA on oppose and leaves people-only orgs off the plot", () => {
  const plot = buildOrgPlot(graph, {
    view: "stance",
    measureId: MEASURE_H,
    measures,
    stances,
  });
  assert.equal(plot.measure?.id, MEASURE_H);
  assert.equal(plot.empty_copy, null);
  const onPlot = plottedNodes(plot.nodes, "stance");
  assert.equal(onPlot.length, 1);
  assert.equal(onPlot[0].id, "ccta");
  assert.equal(onPlot[0].name, "Contra Costa Taxpayers Association");
  assert.equal(onPlot[0].stance, "oppose");
  const councilNode = plot.nodes.find((n) => n.id === "council");
  assert.ok(councilNode);
  assert.equal(councilNode?.stance, "none");
  const payload = JSON.stringify(plot).toLowerCase();
  assert.equal(payload.includes("moderate"), false);
});

test("endorse stays endorse and is not a fourth axis value beyond support/oppose/none", () => {
  const plot = buildOrgPlot(graph, {
    view: "stance",
    measureId: "h-2024",
    measures,
    stances,
  });
  const lwvNode = plot.nodes.find((n) => n.id === "lwv");
  assert.equal(lwvNode?.stance, "endorse");
  const onPlot = plottedNodes(plot.nodes, "stance");
  assert.equal(onPlot.every((n) => n.stance === "endorse" || n.stance === "support" || n.stance === "oppose"), true);
});

test("W and RTM with zero org stances return the honest empty line", () => {
  for (const id of [MEASURE_W, MEASURE_RTM]) {
    const plot = buildOrgPlot(graph, {
      view: "stance",
      measureId: id,
      measures,
      stances,
    });
    assert.equal(plot.empty_copy, STANCE_EMPTY_COPY);
    assert.equal(plottedNodes(plot.nodes, "stance").length, 0);
    assert.equal(plot.measure?.id, id);
  }
});

test("default measure is the one with the most org stances, not a hardcoded id", () => {
  const plot = buildOrgPlot(graph, {
    view: "stance",
    measures,
    stances,
  });
  assert.equal(plot.measure?.id, MEASURE_H);
  assert.equal(defaultMeasureId(plot.measures), MEASURE_H);

  const extra = [
    orgStance("ccta", MEASURE_W, "oppose"),
    orgStance("lwv", MEASURE_W, "support"),
  ];
  const tilted = buildOrgPlot(graph, {
    view: "stance",
    measures,
    stances: [...stances, ...extra],
  });
  assert.equal(tilted.measure?.id, MEASURE_W);
});

test("hover copy uses words, never a raw footprint_score", () => {
  const lines = hoverLines(
    {
      name: "City Council",
      member_count: 12,
      reach: 4,
      footprint: 20,
      stance: "none",
    },
    "structure",
    10
  );
  assert.deepEqual(lines, [
    "City Council",
    "Members 12",
    "Shared boards 4 · Footprint high",
  ]);
  assert.equal(lines.join(" ").includes("footprint_score"), false);
  const stanceLines = hoverLines(
    {
      name: "Contra Costa Taxpayers Association",
      member_count: 0,
      reach: 0,
      footprint: 0,
      stance: "oppose",
    },
    "stance",
    4
  );
  assert.equal(stanceLines[2], "Oppose · Footprint low");
});

test("bubble size is area (sqrt) with an 18px floor", () => {
  assert.equal(bubbleDiameter(0, 16), BUBBLE_FLOOR_PX);
  const small = bubbleDiameter(1, 16);
  const large = bubbleDiameter(16, 16);
  const mid = bubbleDiameter(4, 16);
  assert.ok(small > BUBBLE_FLOOR_PX);
  assert.ok(large > small);
  const expectedMid =
    BUBBLE_FLOOR_PX + Math.sqrt(4 / 16) * (56 - BUBBLE_FLOOR_PX);
  assert.equal(mid, expectedMid);
});

test("collapsed domain pins to the low end, never the visual center", () => {
  assert.equal(scaleLinear(0, 0, 0, 180, 20), 180);
  assert.equal(scaleLinear(4, 0, 0, 40, 360), 40);
  assert.ok(scaleLinear(2, 0, 4, 0, 100) === 50);
});

test("collision nudge may not cross a median", () => {
  const nudged = nudgePixelPoints(
    [
      { id: "a", x: 48, y: 48, r: 20, sideX: -1, sideY: 1 },
      { id: "b", x: 52, y: 52, r: 20, sideX: 1, sideY: 1 },
    ],
    { minX: 0, maxX: 200, minY: 0, maxY: 200, midX: 100, midY: 100 }
  );
  const a = nudged.find((p) => p.id === "a")!;
  const b = nudged.find((p) => p.id === "b")!;
  assert.ok(a.x < 100);
  assert.ok(b.x > 100);
  assert.ok(a.y < 100);
  assert.ok(b.y < 100);
  assert.equal(compareSide(a.x, 100) < 0, true);
  assert.equal(compareSide(b.x, 100) > 0, true);
});

test("stance caption and corners never say moderate or Left / Right", () => {
  const blob = `${STANCE_CAPTION} ${JSON.stringify(STANCE_CORNERS)}`;
  assert.equal(STANCE_CORNERS.highOppose, "Organized opposition");
  assert.equal(STANCE_CORNERS.highSupport, "Organized support");
  assert.equal(STANCE_CORNERS.lowRecorded, "Vocal few");
  assert.equal(blob.toLowerCase().includes("moderate"), false);
  assert.equal(/left\s*\/\s*right/i.test(blob), false);
  assert.match(STANCE_CAPTION, /not a left–right score/);
  assert.equal(blob.toLowerCase().includes("present, not on record"), false);
});
