import assert from "node:assert/strict";
import { test } from "node:test";
import {
  givenName,
  orgNetworkPreviewLabel,
  personNetworkPreviewLabel,
} from "../lib/network-preview.ts";

test("person preview uses the given name, never Open Network", () => {
  const label = personNetworkPreviewLabel("Carl Anduri");
  assert.equal(givenName("Carl Anduri"), "Carl");
  assert.equal(label, "See who sits with Carl");
  assert.equal(label.includes("Open Network"), false);
  assert.equal(label.includes("Open"), false);
});

test("organization preview uses the overlap line", () => {
  const label = orgNetworkPreviewLabel("Lafayette City Council");
  assert.equal(label, "See who overlaps Lafayette City Council");
  assert.equal(label.includes("Open Network"), false);
});
