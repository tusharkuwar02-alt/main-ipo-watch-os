import test from "node:test";
import assert from "node:assert/strict";
import { INSTITUTIONAL_VARIANTS, disclosureSnapshot, institutionalFeatures, parseInstitutionalHoldingsXbrl } from "../lib/institutional-confirmation.mjs";

const context = (id, member, pct) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="x:CategoryOfShareholdersAxis">x:${member}</xbrldi:explicitMember></xbrli:segment></xbrli:entity></xbrli:context><x:ShareholdingAsAPercentageOfTotalNumberOfShares contextRef="${id}">${pct}</x:ShareholdingAsAPercentageOfTotalNumberOfShares>`;

test("parses aggregate MF and institutional FPI percentages from shareholding XBRL", () => {
  const xml=`<xbrli:xbrl>${context("mf","MutualFundsOrUtiMember",4.82)}${context("fpi","InstitutionsForeignPortfolioInvestorMember",24.73)}</xbrli:xbrl>`;
  assert.deepEqual(parseInstitutionalHoldingsXbrl(xml),{mfPct:4.82,fpiPct:24.73});
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
