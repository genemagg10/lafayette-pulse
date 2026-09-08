import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assemblePeopleAffinity,
  personFootprintNodeSize,
} from "../lib/civic-graph.ts";

const people = [
  { id: "ada", full_name: "Ada", photo_url: null },
  { id: "bea", full_name: "Bea", photo_url: null },
  { id: "cam", full_name: "Cam", photo_url: null },
  { id: "dee", full_name: "Dee", photo_url: null },
];

const boardsByPerson = new Map<string, Set<string>>([
  ["ada", new Set(["council", "planning"])],
  ["bea", new Set(["council"])],
  ["cam", new Set(["planning"])],
  ["dee", new Set(["rotary"])],
]);

const orgLabels = new Map([
  ["council", "City Council"],
  ["planning", "Planning Commission"],
  ["rotary", "Rotary"],
]);

test("people overview links people who share a board", () => {
  const graph = assemblePeopleAffinity(people, boardsByPerson, orgLabels, {
    currentOnly: true,
    minShared: 1,
    limitPeople: 40,
  });
  const keys = graph.edges
    .map((edge) => [edge.source, edge.target].sort().join("-"))
    .sort();
  assert.deepEqual(keys, ["ada-bea", "ada-cam"]);
  assert.equal(
    graph.edges.some((edge) => [edge.source, edge.target].includes("dee")),
    false
  );
});

test("people overview ranks and sizes by board footprint as area", () => {
  const graph = assemblePeopleAffinity(people, boardsByPerson, orgLabels, {
    currentOnly: true,
    minShared: 1,
    limitPeople: 40,
    footprintByPerson: new Map([
      ["ada", 5],
      ["bea", 1],
      ["cam", 2],
      ["dee", 8],
    ]),
  });
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["ada", "cam", "bea"]
  );
  assert.equal(graph.connected_count, 3);
  const ada = graph.nodes.find((node) => node.id === "ada");
  const bea = graph.nodes.find((node) => node.id === "bea");
  assert.equal(ada?.footprint, 5);
  assert.equal(ada?.size, personFootprintNodeSize(5, 5));
  assert.ok((ada?.size ?? 0) > (bea?.size ?? 0));
  assert.equal(
    graph.nodes.some((node) => node.id === "dee"),
    false
  );
});

test("has_seat uses existing seat holders only and does not invent commission seats", () => {
  const seated = assemblePeopleAffinity(people, boardsByPerson, orgLabels, {
    currentOnly: true,
    minShared: 1,
    limitPeople: 40,
    hasSeat: true,
    seatedIds: new Set(["ada", "bea"]),
  });
  assert.deepEqual(
    seated.nodes.map((node) => node.id).sort(),
    ["ada", "bea"]
  );
  assert.equal(
    seated.nodes.some((node) => node.id === "cam"),
    false
  );
  assert.equal(seated.has_seat, true);
});
