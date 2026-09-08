import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NETWORK_PREVIEW_FALLBACK_LABEL,
  givenName,
  networkPreviewFits,
  orgNetworkPreviewLabel,
  personNetworkPreviewLabel,
  resolveNetworkPreviewLabel,
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
    availableHeight: 52,
    contentWidth: 180,
    contentHeight: 40,
  }), true);
  assert.equal(networkPreviewFits({
    availableWidth: 200,
    availableHeight: 52,
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
