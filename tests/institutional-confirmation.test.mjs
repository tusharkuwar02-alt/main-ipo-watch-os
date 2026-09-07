import test from "node:test";
import assert from "node:assert/strict";
import { INSTITUTIONAL_VARIANTS, disclosureSnapshot, institutionalFeatures, institutionalPresentation, parseInstitutionalHoldingsXbrl } from "../lib/institutional-confirmation.mjs";

const context = (id, member, pct) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="x:CategoryOfShareholdersAxis">x:${member}</xbrldi:explicitMember></xbrli:segment></xbrli:entity></xbrli:context><x:ShareholdingAsAPercentageOfTotalNumberOfShares contextRef="${id}">${pct}</x:ShareholdingAsAPercentageOfTotalNumberOfShares>`;

test("parses aggregate MF and institutional FPI percentages from shareholding XBRL", () => {
  const xml=`<xbrli:xbrl>${context("mf","MutualFundsOrUtiMember",4.82)}${context("fpi","InstitutionsForeignPortfolioInvestorMember",24.73)}</xbrli:xbrl>`;
  assert.deepEqual(parseInstitutionalHoldingsXbrl(xml),{mfPct:4.82,fpiPct:24.73});
});

test("sums post-2022 FPI category one and two, including NSE taxonomy typo", () => {
  const xml=`<xbrli:xbrl>${context("mf","MutualFundsOrUTIMember",9.14)}${context("one","InstitutionsForeignPortfolioInvestorCatergoryOneMember",18.37)}${context("two","InstitutionsForeignPortfolioInvestorCategoryTwoMember",.7)}${context("legacy","ForeignPortfolioInvestorMember",0)}</xbrli:xbrl>`;
  assert.deepEqual(parseInstitutionalHoldingsXbrl(xml),{mfPct:9.14,fpiPct:19.07});
});

test("a filing cannot affect a signal before its availability date", () => {
  const records=[
    {quarterEnd:"2022-03-31",availableDate:"2022-04-15",mfPct:2,fpiPct:3},
    {quarterEnd:"2022-06-30",availableDate:"2022-07-15",mfPct:2.5,fpiPct:3.25}
  ];
  assert.equal(disclosureSnapshot(records,"2022-07-14").disclosureCovered,false);
  assert.equal(disclosureSnapshot(records,"2022-07-15").totalDeltaPct,.75);
});

test("later revision replaces the same quarter only after publication", () => {
  const records=[
    {quarterEnd:"2022-03-31",availableDate:"2022-04-15",mfPct:2,fpiPct:3},
    {quarterEnd:"2022-06-30",availableDate:"2022-07-15",mfPct:2.5,fpiPct:3.25},
    {quarterEnd:"2022-06-30",availableDate:"2022-08-01",mfPct:2.7,fpiPct:3.4}
  ];
  assert.equal(disclosureSnapshot(records,"2022-07-31").totalDeltaPct,.75);
  assert.equal(disclosureSnapshot(records,"2022-08-01").totalDeltaPct,1.1);
});

test("institutional score rewards independent confirmations without changing 2R/3R exits", () => {
  const rows=[
    {quarterEnd:"2021-12-31",availableDate:"2022-01-15",mfPct:1,fpiPct:2},
    {quarterEnd:"2022-03-31",availableDate:"2022-04-15",mfPct:1.1,fpiPct:2.1},
    {quarterEnd:"2022-06-30",availableDate:"2022-07-15",mfPct:1.3,fpiPct:2.4}
  ];
  assert.ok(institutionalFeatures(rows,"2022-08-01",.4).institutionalScore>=3);
  assert.equal(INSTITUTIONAL_VARIANTS.length,10);
});

test("presentation keeps institutional evidence as confirmation instead of an entry signal", () => {
  const strong = institutionalPresentation({
    disclosureCovered: true, institutionalScore: 3, totalDeltaPct: .4, filingAvailableDate: "2026-07-20"
  }, "2026-09-04");
  assert.equal(strong.institutionalStatus, "Strong confirmation");
  assert.equal(strong.institutionalQualified, true);
  assert.equal(strong.institutionalDirection, "Net accumulation");
  assert.equal(strong.filingFreshness, "Current quarterly filing");

  const conflict = institutionalPresentation({
    disclosureCovered: true, institutionalScore: 1, totalDeltaPct: -.3, filingAvailableDate: "2025-10-01"
  }, "2026-09-04");
  assert.equal(conflict.institutionalStatus, "Conflict");
  assert.equal(conflict.institutionalQualified, false);
  assert.equal(conflict.filingFreshness, "Stale filing");
  assert.equal(institutionalPresentation({}, "2026-09-04").institutionalStatus, "Insufficient disclosure");
});
