import assert from "node:assert/strict";
import { test } from "node:test";
import { PRIMARY_NAV } from "../lib/layout-ia.ts";
import {
  ballotLabel,
  buildElectionModel,
  extractStatement,
  formatUsdFromCents,
  isOutsideLafayette,
  previewText,
  stanceBucket,
  stripElectedParenthetical,
  toCents,
  type ElectionBuildInput,
  type ElectionCandidacyRow,
  type ElectionContributionRow,
  type ElectionMeasureRow,
  type ElectionStanceRow,
} from "../lib/election.ts";

const W_ID = "measure-w";
const RTM_ID = "measure-rtm";
const BUTLER_ID = "cand-butler";
const SCHWEPPE_ID = "cand-schweppe";
const COUNCIL_ID = "cand-council";

function measure(partial: Partial<ElectionMeasureRow> & Pick<ElectionMeasureRow, "id" | "short_code">): ElectionMeasureRow {
  return {
    title: partial.short_code || "Measure",
    summary: null,
    election_date: "2026-11-03",
    source_url: null,
    status: "on_ballot",
    ...partial,
  };
}

function contribution(
  partial: Partial<ElectionContributionRow> & Pick<ElectionContributionRow, "id" | "amount">
): ElectionContributionRow {
  return {
    filing_id: partial.id,
    direction: "received",
    counterparty_name: "Donor",
    counterparty_org_id: null,
    counterparty_person_id: null,
    counterparty_city: null,
    counterparty_zip: null,
    counterparty_committee_id: null,
    txn_date: "2026-10-01",
    measure_id: null,
    candidacy_id: null,
    mirror_of: null,
    source_url: null,
    filer_org_id: "org-filer",
    ...partial,
  };
}

function stance(
  partial: Partial<ElectionStanceRow> & Pick<ElectionStanceRow, "id" | "polarity">
): ElectionStanceRow {
  return {
    actor_type: "person",
    actor_id: partial.id,
    subject_type: "measure",
    subject_id: W_ID,
    evidence_quote: null,
    source_url: null,
    metadata: {},
    ...partial,
  };
}

function candidacy(
  partial: Partial<ElectionCandidacyRow> & Pick<ElectionCandidacyRow, "id" | "party_or_slate" | "status">
): ElectionCandidacyRow {
  return {
    person_id: partial.id,
    election_date: "2026-11-03",
    source_url: null,
    ...partial,
  };
}

function input(overrides: Partial<ElectionBuildInput> = {}): ElectionBuildInput {
  return {
    nowIso: "2026-10-16T12:00:00.000Z",
    measures: [
      measure({
        id: W_ID,
        short_code: "W",
        title: "Acalanes UHSD parcel tax ($168/parcel, 8 years)",
      }),
      measure({ id: RTM_ID, short_code: "RTM", title: "Regional Transit Measure" }),
    ],
    stances: [],
    candidacies: [
      candidacy({
        id: BUTLER_ID,
        status: "declared",
        party_or_slate:
          "Governing Board Member, Area 2 | Contra Costa County Board of Education | Nonpartisan; incumbent (elected); ON BALLOT | added 2026-10-15",
      }),
    ],
    people: [
      { id: BUTLER_ID, full_name: "Sarah Butler", website: null },
      { id: SCHWEPPE_ID, full_name: "Stacey Schweppe", website: null },
      { id: COUNCIL_ID, full_name: "Stella Wotherspoon", website: null },
      { id: "signer-for", full_name: "Ada For", website: null },
      { id: "signer-against", full_name: "Bea Against", website: null },
      { id: "endorser-no", full_name: "Chronicle", website: null },
    ],
    organizations: [{ id: "org-filer", name: "Yes on W" }],
    contributions: [],
    events: [],
    ...overrides,
  };
}

test("cents formatting matches the published NetFile totals", () => {
  assert.equal(toCents("124915.83") + toCents("12000.00"), 13691583);
  assert.equal(formatUsdFromCents(13691583), "$136,915.83");
  assert.equal(toCents("9850.00") + toCents("2000") + toCents(1000), 1285000);
  assert.equal(formatUsdFromCents(1285000), "$12,850.00");
  assert.equal(toCents(136915.83), 13691583);
});

test("donation totals exclude mirrors and stay inside one measure or candidacy", () => {
  const model = buildElectionModel(
    input({
      contributions: [
        contribution({ id: "w-received", amount: "124915.83", measure_id: W_ID, counterparty_name: "Parents Club" }),
        contribution({
          id: "w-orinda",
          amount: "12000.00",
          measure_id: W_ID,
          direction: "made",
          counterparty_name: "Yes on W",
        }),
        contribution({
          id: "w-mirror",
          amount: "12000.00",
          measure_id: W_ID,
          direction: "made",
          mirror_of: "w-received",
          counterparty_name: "Yes on W mirror",
        }),
        contribution({ id: "butler-self", amount: "9850.00", candidacy_id: BUTLER_ID, counterparty_name: "Sarah Butler", counterparty_person_id: BUTLER_ID }),
        contribution({ id: "butler-ibew", amount: "2000.00", candidacy_id: BUTLER_ID, counterparty_name: "IBEW 302" }),
        contribution({ id: "butler-iaff", amount: "1000.00", candidacy_id: BUTLER_ID, counterparty_name: "IAFF 1230" }),
        contribution({ id: "moraga", amount: "15000.00", counterparty_name: "Camino Pablo PTA" }),
        contribution({ id: "rtm-only", amount: "10.00", measure_id: RTM_ID, counterparty_name: "Someone" }),
      ],
    })
  );

  const w = model.donations.measures.find((row) => row.key === "measure:W");
  const rtm = model.donations.measures.find((row) => row.key === "measure:RTM");
  const butler = model.donations.candidacies.find((row) => row.key === "candidacy:Sarah Butler");
  assert.ok(w);
  assert.ok(rtm);
  assert.ok(butler);
  assert.equal(w.totalLabel, "$136,915.83");
  assert.equal(w.lines.length, 2);
  assert.equal(w.lines.some((line) => line.counterpartyName.includes("mirror")), false);
  assert.equal(rtm.totalLabel, "$10.00");
  assert.equal(butler.totalLabel, "$12,850.00");
  assert.equal(butler.lines.length, 3);
  assert.equal(model.donations.untagged?.totalLabel, "$15,000.00");
  assert.equal(model.donations.excludedMirrors.length, 1);
  assert.equal(model.donations.sharedLineCount, 0);
  assert.equal("totalCents" in model.donations, false);
  assert.notEqual(w.totalCents + rtm.totalCents, w.totalCents);
  const nameOnly = w.lines.find((line) => line.counterpartyName === "Parents Club");
  const linked = butler.lines.find((line) => line.counterpartyName === "Sarah Butler");
  assert.equal(nameOnly?.nameOnly, true);
  assert.equal(linked?.nameOnly, false);
  assert.equal(linked?.linkedPersonId, BUTLER_ID);
});

test("quoted opposition and oppose endorsements stay in different buckets", () => {
  assert.equal(
    stanceBucket({ polarity: "oppose", kind: "endorsement", quote: null }),
    "oppose-endorsement"
  );
  assert.equal(
    stanceBucket({ polarity: "oppose", kind: "ballot_argument_signer", quote: "Vote no." }),
    "quoted-oppose"
  );
  assert.equal(
    stanceBucket({ polarity: "oppose", kind: "endorsement", quote: "Vote no." }),
    "quoted-oppose"
  );

  const model = buildElectionModel(
    input({
      stances: [
        stance({
          id: "q",
          polarity: "oppose",
          actor_id: "signer-against",
          evidence_quote: "This tax costs too much.",
          metadata: { kind: "ballot_argument_signer" },
        }),
        stance({
          id: "e",
          polarity: "oppose",
          actor_id: "endorser-no",
          actor_type: "organization",
          evidence_quote: null,
          metadata: { kind: "endorsement" },
        }),
        stance({
          id: "s",
          polarity: "support",
          actor_id: "signer-for",
          evidence_quote: "Vote yes.",
          metadata: { kind: "ballot_argument_signer" },
        }),
      ],
      organizations: [
        { id: "org-filer", name: "Yes on W" },
        { id: "endorser-no", name: "East Bay Times" },
      ],
    })
  );
  const w = model.localMeasures.find((row) => row.shortCode === "W");
  assert.ok(w);
  assert.equal(w.quotedOppose.length, 1);
  assert.equal(w.quotedOppose[0].signers[0].name, "Bea Against");
  assert.equal(w.opposeEndorsements.length, 1);
  assert.equal(w.opposeEndorsements[0].name, "East Bay Times");
  assert.equal(w.quotedSupport[0].signers[0].name, "Ada For");
  assert.equal(
    w.opposeEndorsements.some((person) => person.name === "Bea Against"),
    false
  );
});

test("candidate statements truncate and Area 1 is outside Lafayette", () => {
  const long = "Lafayette schools need steady funding. ".repeat(20);
  const slate = `Governing Board Member Area 1 | Acalanes Union High School District | Nonpartisan; ON BALLOT | 2026-10-15 candidate statement (source: https://example.test; ballot designation: Teacher.): "${long}" | 2026-10-15 NOT A LAFAYETTE CONTEST: Area 1 has 0.00% overlap`;
  const extracted = extractStatement(slate);
  assert.ok(extracted.text);
  assert.equal(extracted.text.includes("NOT A LAFAYETTE CONTEST"), false);
  const preview = previewText(extracted.text);
  assert.equal(preview.truncated, true);
  assert.ok(preview.preview.endsWith("…"));
  assert.ok(preview.preview.length < extracted.text.length);
  assert.equal(isOutsideLafayette(slate), true);

  const model = buildElectionModel(
    input({
      candidacies: [
        candidacy({ id: SCHWEPPE_ID, status: "declared", party_or_slate: slate }),
        candidacy({
          id: COUNCIL_ID,
          status: "elected",
          party_or_slate:
            "City Council (full 4-year term) | City of Lafayette | Nonpartisan; incumbent; uncontested — appointed 2026-08-20 | NOT on 8/27 Contests On Ballot",
        }),
        candidacy({
          id: BUTLER_ID,
          status: "declared",
          party_or_slate:
            'Governing Board Member, Area 2 | Contra Costa County Board of Education | Nonpartisan; incumbent (elected); ON BALLOT | 2026-10-15 candidate statement (source: https://example.test): "I teach."',
        }),
      ],
    })
  );

  assert.equal(model.outside.length, 1);
  assert.equal(model.outside[0].candidates[0].name, "Stacey Schweppe");
  assert.equal(model.outside[0].candidates[0].ballotLabel, "On a ballot outside Lafayette");
  assert.equal(model.outside[0].candidates[0].statementTruncated, true);
  assert.equal(
    model.contests.some((contest) => contest.candidates.some((row) => row.name === "Stacey Schweppe")),
    false
  );

  const council = model.offBallot.flatMap((contest) => contest.candidates).find((row) => row.name === "Stella Wotherspoon");
  assert.ok(council);
  assert.equal(council.ballotLabel, "Not on this ballot");
  assert.equal(/elected/i.test(council.ballotLabel), false);
  assert.equal(/elected/i.test(council.party), false);

  const butler = model.contests.flatMap((contest) => contest.candidates).find((row) => row.name === "Sarah Butler");
  assert.ok(butler);
  assert.equal(butler.ballotLabel, "On the ballot");
  assert.equal(butler.statement, "I teach.");
  assert.equal(/elected/i.test(butler.party), false);
  assert.equal(stripElectedParenthetical("incumbent (elected)"), "incumbent");
});

test("ballot labels never say elected", () => {
  for (const status of ["elected", "declared", "qualified", "lost", "withdrawn"]) {
    const label = ballotLabel({
      outsideLafayette: false,
      notOnBallot: status === "elected",
      status,
    });
    assert.equal(/elected/i.test(label), false);
  }
});

test("Nov 3 is in the primary nav", () => {
  assert.ok(PRIMARY_NAV.some((item) => item.href === "/election" && item.label === "Nov 3"));
});
