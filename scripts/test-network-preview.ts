import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NETWORK_PREVIEW_FALLBACK_LABEL,
  ORGS_NETWORK_LIST_LABEL,
  PEOPLE_NETWORK_LIST_LABEL,
  WHO_NETWORK_WELL_SIZE,
  givenName,
  looksLikeScrapeId,
  networkPreviewFits,
  orgNetworkPreviewLabel,
  personNetworkPreviewLabel,
  resolveNetworkPreviewLabel,
  whoNetworkSchematic,
} from "../lib/network-preview.ts";

test("person preview is first name plus Network Map", () => {
  const label = personNetworkPreviewLabel("Carl Anduri");
  assert.equal(givenName("Carl Anduri"), "Carl");
  assert.equal(label, "Carl's Network Map");
  assert.equal(label.includes("See who sits"), false);
  assert.equal(label.includes("Open Network"), false);
});

test("organization preview is the org name plus Network Map", () => {
  const label = orgNetworkPreviewLabel("Lafayette Chamber of Commerce");
  assert.equal(label, "Lafayette Chamber of Commerce Network Map");
  assert.equal(label.includes("See who overlaps"), false);
  assert.equal(label.includes("Open Network"), false);
});

test("overflow replaces the whole label, never a truncated name", () => {
  assert.equal(NETWORK_PREVIEW_FALLBACK_LABEL, "View Network Map");
  assert.equal(
    resolveNetworkPreviewLabel("Carl's Network Map", true),
    "Carl's Network Map"
  );
  assert.equal(
    resolveNetworkPreviewLabel(
      "Lafayette Chamber of Commerce Network Map",
      false
    ),
    "View Network Map"
  );
  assert.equal(networkPreviewFits({
    availableWidth: 200,
    availableHeight: WHO_NETWORK_WELL_SIZE,
    contentWidth: 180,
    contentHeight: 40,
  }), true);
  assert.equal(networkPreviewFits({
    availableWidth: 200,
    availableHeight: WHO_NETWORK_WELL_SIZE,
    contentWidth: 240,
    contentHeight: 20,
  }), false);
  const overflow = resolveNetworkPreviewLabel(
    "Lafayette Chamber of Commerce Network Map",
    false
  );
  assert.equal(overflow.includes("…"), false);
  assert.equal(overflow.includes("..."), false);
  assert.equal(overflow.includes("Lafayette"), false);
});

test("mobile list door labels use the same Title Case as the person card", () => {
  assert.equal(PEOPLE_NETWORK_LIST_LABEL, "People Network Map");
  assert.equal(ORGS_NETWORK_LIST_LABEL, "Organizations Network Map");
  assert.equal(PEOPLE_NETWORK_LIST_LABEL.includes("network map"), false);
  assert.equal(ORGS_NETWORK_LIST_LABEL.includes("network map"), false);
  assert.equal(
    resolveNetworkPreviewLabel(PEOPLE_NETWORK_LIST_LABEL, true),
    "People Network Map"
  );
  assert.equal(
    resolveNetworkPreviewLabel(ORGS_NETWORK_LIST_LABEL, true),
    "Organizations Network Map"
  );
  const overflow = resolveNetworkPreviewLabel(ORGS_NETWORK_LIST_LABEL, false);
  assert.equal(overflow, "View Network Map");
  assert.equal(overflow.includes("…"), false);
  assert.equal(overflow.includes("..."), false);
  assert.equal(overflow.includes("Organizations"), false);
});

test("Who doors share one family: overview vs ego drawings", () => {
  assert.equal(whoNetworkSchematic("list"), "overview");
  assert.equal(whoNetworkSchematic("person"), "person");
  assert.equal(whoNetworkSchematic("org"), "org");
});

test("scrape ids never become the visible Network Map label", () => {
  const id = "3f1c9a2e-7b44-4c11-9d0a-12ab34cd56ef";
  assert.equal(looksLikeScrapeId(id), true);
  assert.equal(looksLikeScrapeId("Carl"), false);
  assert.equal(looksLikeScrapeId("Lafayette Chamber of Commerce"), false);
  assert.equal(personNetworkPreviewLabel(id), "View Network Map");
  assert.equal(orgNetworkPreviewLabel(id), "View Network Map");
  assert.equal(resolveNetworkPreviewLabel(id, true), "View Network Map");
  assert.equal(personNetworkPreviewLabel(id).includes(id), false);
  assert.equal(orgNetworkPreviewLabel(id).includes(id), false);
});
