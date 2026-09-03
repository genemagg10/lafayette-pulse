import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterOrgsByType,
  orgAffinityEgoIds,
  selectOrgAffinityIds,
  sharedBoardPersonOverlaps,
} from "../lib/civic-graph.ts";
import type { OrgType } from "../lib/types.ts";

const orgs = [
  { id: "council", name: "City Council", org_type: "city_body" as OrgType },
  { id: "chamber", name: "Chamber", org_type: "civic" as OrgType },
  { id: "rotary", name: "Rotary", org_type: "civic" as OrgType },
  { id: "planning", name: "Planning Commission", org_type: "city_body" as OrgType },
  { id: "foundation", name: "Community Foundation", org_type: "foundation" as OrgType },
];

const membersByOrg = new Map<string, Set<string>>([
  ["council", new Set(["ada", "bea"])],
  ["chamber", new Set(["ada", "cam"])],
  ["rotary", new Set(["cam"])],
  ["planning", new Set(["bea"])],
  ["foundation", new Set(["ada"])],
]);

const boardsByPerson = new Map<string, Set<string>>([
  ["ada", new Set(["council", "chamber", "foundation"])],
  ["bea", new Set(["council", "planning"])],
  ["cam", new Set(["chamber", "rotary"])],
]);

test("filterOrgsByType keeps only the requested org_type", () => {
  assert.deepEqual(
    filterOrgsByType(orgs, "civic").map((row) => row.id).sort(),
    ["chamber", "rotary"]
  );
  assert.equal(filterOrgsByType(orgs, null).length, 5);
});

test("orgAffinityEgoIds returns focus plus 1-hop shared-membership neighbors", () => {
  const ego = orgAffinityEgoIds("council", membersByOrg, membersByOrg.keys(), 1);
  assert.equal(ego[0], "council");
  assert.deepEqual(ego.slice(1).sort(), ["chamber", "foundation", "planning"]);
  assert.equal(ego.includes("rotary"), false);
});

test("overview selectOrgAffinityIds includes every type with members", () => {
  const ids = selectOrgAffinityIds(orgs, membersByOrg, {
    minShared: 1,
    limitOrgs: 40,
  });
  assert.deepEqual(ids.sort(), [
    "chamber",
    "council",
    "foundation",
    "planning",
    "rotary",
  ]);
});

test("org_type civic changes graph membership", () => {
  const ids = selectOrgAffinityIds(orgs, membersByOrg, {
    orgType: "civic",
    minShared: 1,
    limitOrgs: 40,
  });
  assert.deepEqual(ids.sort(), ["chamber", "rotary"]);
});

test("focus_org returns ego neighborhood and hides the rest", () => {
  const council = selectOrgAffinityIds(orgs, membersByOrg, {
    focusOrg: "council",
    minShared: 1,
    limitOrgs: 40,
  });
  assert.deepEqual(council.slice().sort(), [
    "chamber",
    "council",
    "foundation",
    "planning",
  ]);
  assert.equal(council.includes("rotary"), false);

  const chamber = selectOrgAffinityIds(orgs, membersByOrg, {
    focusOrg: "chamber",
    minShared: 1,
    limitOrgs: 40,
  });
  assert.deepEqual(chamber.slice().sort(), [
    "chamber",
    "council",
    "foundation",
    "rotary",
  ]);
  assert.equal(chamber.includes("planning"), false);
});

test("focus_org plus civic type keeps civic neighbors only", () => {
  const ids = selectOrgAffinityIds(orgs, membersByOrg, {
    orgType: "civic",
    focusOrg: "council",
    minShared: 1,
    limitOrgs: 40,
  });
  assert.deepEqual(ids.slice().sort(), ["chamber", "council"]);
});

test("clearing focus returns the type-filtered overview", () => {
  const overview = selectOrgAffinityIds(orgs, membersByOrg, {
    orgType: "city_body",
    minShared: 1,
    limitOrgs: 40,
  });
  assert.deepEqual(overview.slice().sort(), ["council", "planning"]);
});

test("shared board overlaps list people who sit on the same boards", () => {
  const overlaps = sharedBoardPersonOverlaps("ada", boardsByPerson);
  assert.deepEqual(
    overlaps.map((row) => row.personId).sort(),
    ["bea", "cam"]
  );
  const bea = overlaps.find((row) => row.personId === "bea");
  assert.deepEqual(bea?.orgIds.sort(), ["council"]);
});
