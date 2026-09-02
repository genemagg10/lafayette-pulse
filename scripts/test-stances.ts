import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCoStanceMatrix,
  buildConflictRibbon,
  countPolarities,
  polarityColor,
  polarityDashed,
  STANCE_GOLD,
  STANCE_TEAL,
  STANCE_VERMILLION,
  type LabeledStance,
} from "../lib/stances.ts";

function stance(
  partial: Partial<LabeledStance> & Pick<LabeledStance, "id" | "actor_id" | "polarity">
): LabeledStance {
  return {
    actor_type: "organization",
    subject_type: "measure",
    subject_id: "m-2018",
    subject_label: "Measure L 2018",
    subject_title: "L · Deer Hill 2018",
    actor_label: partial.actor_id,
    confidence: 0.9,
    evidence_quote: "The council supports Measure L.",
    source_url: "https://example.test",
    as_of: "2018-06-01",
    ...partial,
  };
}

test("empty stances produce an empty co-stance matrix", () => {
  const matrix = buildCoStanceMatrix([], { actor: "organization", minShared: 2 });
  assert.equal(matrix.cells.length, 0);
  assert.equal(matrix.nodes.length, 0);
  assert.equal(matrix.label, "Co-stance");
  assert.equal(matrix.opposed_label, "Opposed on issues");
});

test("conflict ribbon is readable with 2 support and 1 oppose", () => {
  const stances: LabeledStance[] = [
    stance({
      id: "s1",
      actor_id: "org-a",
      actor_label: "City Council",
      polarity: "support",
    }),
    stance({
      id: "s2",
      actor_id: "org-b",
      actor_label: "Planning Commission",
      polarity: "support",
      confidence: 0.85,
    }),
    stance({
      id: "s3",
      actor_id: "org-c",
      actor_label: "Neighborhood group",
      polarity: "oppose",
      evidence_quote: "We oppose Measure L as written.",
    }),
  ];
  const counts = countPolarities(stances);
  assert.equal(counts.support, 2);
  assert.equal(counts.oppose, 1);
  const ribbon = buildConflictRibbon(
    { id: "m-2018", title: "Homes at Deer Hill", short_code: "L" },
    stances
  );
  assert.equal(ribbon.nodes.length, 4);
  assert.ok(ribbon.nodes.some((n) => n.column === "support"));
  assert.ok(ribbon.nodes.some((n) => n.column === "oppose"));
  const opposeEdge = ribbon.edges.find((e) => e.polarity === "oppose");
  const supportEdge = ribbon.edges.find((e) => e.polarity === "support");
  assert.ok(opposeEdge);
  assert.ok(supportEdge);
  assert.equal(opposeEdge?.dashed, true);
  assert.equal(opposeEdge?.color, STANCE_VERMILLION);
  assert.equal(supportEdge?.dashed, false);
  assert.equal(supportEdge?.color, STANCE_TEAL);
  assert.equal(polarityDashed("oppose"), true);
  assert.equal(polarityColor("endorse"), STANCE_GOLD);
});

test("co-stance vs opposed on issues uses min_shared and never says allies", () => {
  const stances: LabeledStance[] = [
    stance({ id: "a1", actor_id: "org-a", actor_label: "A", polarity: "support", subject_id: "m1", subject_title: "M1" }),
    stance({ id: "b1", actor_id: "org-b", actor_label: "B", polarity: "support", subject_id: "m1", subject_title: "M1" }),
    stance({ id: "a2", actor_id: "org-a", actor_label: "A", polarity: "support", subject_id: "m2", subject_title: "M2" }),
    stance({ id: "b2", actor_id: "org-b", actor_label: "B", polarity: "support", subject_id: "m2", subject_title: "M2" }),
    stance({ id: "c1", actor_id: "org-c", actor_label: "C", polarity: "oppose", subject_id: "m1", subject_title: "M1" }),
    stance({ id: "a3", actor_id: "org-a", actor_label: "A", polarity: "support", subject_id: "m3", subject_title: "M3" }),
    stance({ id: "c3", actor_id: "org-c", actor_label: "C", polarity: "oppose", subject_id: "m3", subject_title: "M3" }),
  ];
  const matrix = buildCoStanceMatrix(stances, { actor: "organization", minShared: 2 });
  const ab = matrix.cells.find(
    (cell) =>
      (cell.source === "org-a" && cell.target === "org-b") ||
      (cell.source === "org-b" && cell.target === "org-a")
  );
  const ac = matrix.cells.find(
    (cell) =>
      (cell.source === "org-a" && cell.target === "org-c") ||
      (cell.source === "org-c" && cell.target === "org-a")
  );
  const bc = matrix.cells.find(
    (cell) =>
      (cell.source === "org-b" && cell.target === "org-c") ||
      (cell.source === "org-c" && cell.target === "org-b")
  );
  assert.ok(ab);
  assert.equal(ab?.kind, "co-stance");
  assert.equal(ab?.label, "Co-stance");
  assert.equal(ab?.co_stance, 2);
  assert.ok(ac);
  assert.equal(ac?.kind, "opposed-on-issues");
  assert.equal(ac?.label, "Opposed on issues");
  assert.ok(bc);
  assert.equal(bc?.kind, "insufficient");
  assert.equal(bc?.label, "Insufficient overlap");
  assert.ok(!JSON.stringify(matrix).toLowerCase().includes("allies"));
  assert.ok(!JSON.stringify(matrix).toLowerCase().includes("faction"));
  assert.ok(!JSON.stringify(matrix).toLowerCase().includes("influence"));
});
