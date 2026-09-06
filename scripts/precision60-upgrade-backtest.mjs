import fs from "node:fs/promises";
import path from "node:path";
import { looksLikeCorporateAction, simulateTwoTargetTrade, summarizeTrades } from "../lib/smart-money-backtest.mjs";
import { momentumInputs, zScoreRows, historicalFootprint } from "../lib/quality-momentum-pullback.mjs";
import { smaAt, wilsonLower } from "../lib/smart-money-strategy-tournament.mjs";
import { PRECISION60_FAMILIES, PRECISION60_MANAGEMENT, buildPrecision60Plans } from "../lib/precision60-upgrade.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CACHE = path.join(ROOT, ".cache", "smart-money-bhavcopy");
const START = process.env.BACKTEST_START || "2022-01-01";
const DOWNLOAD_START = process.env.BACKTEST_DOWNLOAD_START || "2020-12-01";
const END = process.env.BACKTEST_END || new Date().toISOString().slice(0, 10);
const FRICTION_PCT = .003, MAX_HOLD = 10;
const DEVELOPMENT = new Set(["2022", "2023", "2024"]), VALIDATION = new Set(["2025"]), HOLDOUT = new Set(["2026"]);
const MINIMUM = { development: 180, validation: 50 };
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharPrecision60Upgrade/1.0)", Accept: "text/csv,*/*" };
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const median = values => { const sorted = [...values].sort((a,b) => a-b); return sorted.length ? (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.ceil((sorted.length-1)/2)]) / 2 : NaN; };

function csvLine(line) { const values=[]; let value="", quoted=false; for (const char of line) { if (char==='"') quoted=!quoted; else if(char===","&&!quoted){values.push(value.trim());value="";} else value+=char;} values.push(value.trim()); return values; }
function parseBhavcopy(text) {
  const lines=text.trim().split(/\r?\n/); if(lines.length<2)return[];
  const header=csvLine(lines[0]),at=Object.fromEntries(header.map((name,index)=>[name.trim(),index]));
  return lines.slice(1).map(csvLine).filter(row=>row[at.SERIES]==="EQ").map(row=>{const close=Number(row[at.CLOSE_PRICE]),deliveryQty=Number(row[at.DELIV_QTY])||0;return{symbol:row[at.SYMBOL],date:new Date(`${row[at.DATE1]} UTC`).toISOString().slice(0,10),open:Number(row[at.OPEN_PRICE]),high:Number(row[at.HIGH_PRICE]),low:Number(row[at.LOW_PRICE]),close,volume:Number(row[at.TTL_TRD_QNTY]),deliveryQty,deliveryPct:Number(row[at.DELIV_PER])||0,deliverableValue:close*deliveryQty,turnoverCr:(Number(row[at.TURNOVER_LACS])||0)/100};}).filter(row=>row.symbol&&[row.open,row.high,row.low,row.close,row.volume].every(Number.isFinite));
}
function datesBetween(start,end){const dates=[],cursor=new Date(`${start}T00:00:00Z`),last=new Date(`${end}T00:00:00Z`);while(cursor<=last){if(![0,6].includes(cursor.getUTCDay()))dates.push(new Date(cursor));cursor.setUTCDate(cursor.getUTCDate()+1);}return dates;}
function archive(date){const dd=String(date.getUTCDate()).padStart(2,"0"),mm=String(date.getUTCMonth()+1).padStart(2,"0");return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${date.getUTCFullYear()}.csv`;}
async function loadDate(date){
  const key=date.toISOString().slice(0,10),file=path.join(CACHE,`${key}.csv`);
  try{return parseBhavcopy(await fs.readFile(file,"utf8"));}catch{}
  for(let attempt=0;attempt<4;attempt++){try{const response=await fetch(archive(date),{headers,signal:AbortSignal.timeout(45000)});if(response.status===404)return[];if(!response.ok)throw new Error(`${response.status}`);const text=await response.text(),rows=parseBhavcopy(text);if(rows.length<500)throw new Error(`unsafe row count ${rows.length}`);await fs.writeFile(file,text);return rows;}catch(error){if(attempt===3){console.warn(`download failed ${key}: ${error.message}`);return [];}await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));}}
}
async function mapLimit(items,limit,worker){const results=new Array(items.length);let cursor=0;async function run(){while(cursor<items.length){const index=cursor++;results[index]=await worker(items[index]);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return results;}

function simulatePeriod(signals,histories,management,years){
  const unavailable=new Map(),trades=[];
  for(const signal of signals.filter(item=>years.has(item.signalDate.slice(0,4))).sort((a,b)=>a.signalDate.localeCompare(b.signalDate)||a.symbol.localeCompare(b.symbol))){
    if(signal.barIndex<=(unavailable.get(signal.symbol)??-1))continue;
    const outcome=simulateTwoTargetTrade(histories.get(signal.symbol),signal.barIndex,signal,{...management,waitSessions:signal.waitSessions,maxHoldSessions:MAX_HOLD,frictionPct:FRICTION_PCT,orderType:signal.orderType});
    unavailable.set(signal.symbol,outcome.unavailableUntil??signal.barIndex);
    if(outcome.status==="entered")trades.push({...signal,...outcome,management:management.name});
  }
  return trades;
}

function score(dev,val){
  const worstExp=Math.min(dev.expectancyR,val.expectancyR),worstPf=Math.min(dev.profitFactor||0,val.profitFactor||0),worstWr=Math.min(dev.winRatePct,val.winRatePct);
  const instability=Math.abs(dev.expectancyR-val.expectancyR)*30+Math.abs(dev.winRatePct-val.winRatePct)*.2;
  return +(worstExp*120+worstPf*10+worstWr*.12+Math.min(dev.realizedPayoffRatio||0,val.realizedPayoffRatio||0)*5-instability).toFixed(3);
}
function compact(m){return `${m.trades} / ${m.winRatePct}% / ${m.expectancyR}R / ${m.profitFactor??"-"}`;}
function report(result){
  const f=result.frozenVariant;
  const rows=result.preHoldoutRankings.map((row,i)=>`| ${i+1} | ${row.family} | ${row.management} | ${compact(row.development)} | ${compact(row.validation)} | ${row.sampleSufficient?"Yes":"No"} | ${row.deployable?"Yes":"No"} |`).join("\n");
  return `# Precision60 RR2 Upgrade — 1 to 10 Session Backtest\n\nGenerated: ${result.meta.generatedAt}\n\n## Direct answer\n\n${result.deployableVariantFound?`The locked 2022-2025 gate selected **${f.family} + ${f.management}**. It is the single frozen candidate evaluated on 2026.`:`**No candidate passed the locked deployability gate.** The highest-ranked row below is a research comparator and must not be called a live-ready system.`}\n\nUntouched 2026: ${f.holdout.trades} trades, ${f.holdout.winRatePct}% profitable trades, ${f.holdout.expectancyR}R expectancy and ${f.holdout.profitFactor??"-"} profit factor. ${result.robust60Found?"It retained at least a 60% win rate and positive expectancy in every split.":"It did not establish a robust 60-70% win rate."}\n\n## What was tested\n\nTen bounded precision upgrades were tested around the already profitable Deep Leader Pullback. They vary only independent stock-selection, market-regime and entry-confirmation evidence. The previously selected 50% at 2R / 50% at 3R breakeven management was held constant, so the search cannot improve win rate by lowering the target.\n\n## Locked test protocol\n\n- Official NSE EQ daily archives; point-in-time daily universe\n- Development 2022-2024; validation 2025; untouched 2026 through ${result.meta.marketEnd}\n- Entry no earlier than the next session; maximum 10 sessions\n- 0.30% round-trip friction; gap fills and stop-first same-bar ambiguity\n- One open trade per stock; corporate-action discontinuities excluded\n- Minimum samples ${MINIMUM.development}/${MINIMUM.validation}\n- Deployable gate: positive expectancy and PF >= 1.10 in both development and validation\n- 2026 had zero influence on selection\n\n## Pre-holdout tournament\n\n| Rank | Entry family | Exit | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Gate passed |\n|---:|---|---|---:|---:|---:|---:|\n${rows}\n\n## Frozen result\n\n- Development: ${compact(f.development)}\n- Validation: ${compact(f.validation)}\n- Untouched 2026: ${compact(f.holdout)}\n- 2026 95% Wilson lower win-rate bound: ${f.holdout.wilsonLower95Pct}%\n- Average 2026 winner/loss: ${f.holdout.averageWinR}R / ${f.holdout.averageLossR}R\n- Average 2026 holding: ${f.holdout.averageHoldSessions} sessions\n\n## Interpretation\n\nA 2R target mechanically requires fewer than 50% winners to be profitable before costs, but real trades also include time exits, gaps and friction. Therefore win rate alone is not the approval metric. Permanent profit or a fixed 60-70% win rate cannot be guaranteed by any honest historical test.\n\nResearch only; position sizing and forward/paper validation remain mandatory before capital is exposed.\n`;
}

function precisionReport(result){
  const f=result.frozenVariant;
  const rows=result.preHoldoutRankings.map((row,i)=>`| ${i+1} | ${row.family} | ${compact(row.development)} | ${compact(row.validation)} | ${row.sampleSufficient?"Yes":"No"} | ${row.precision60?"Yes":"No"} |`).join("\n");
  const decision=result.precision60PreHoldoutFound
    ? `The 2022-2025 precision gate selected **${f.family}**.`
    : result.deployableVariantFound
      ? `No row reached 60% in both pre-2026 splits; **${f.family}** is only the strongest profitable comparator.`
      : "No candidate passed the profitability gate.";
  return `# Precision60 RR2 Upgrade - Backtest Report\n\nGenerated: ${result.meta.generatedAt}\n\n## Direct answer\n\n${decision}\n\nReused 2026 diagnostic: ${f.holdout.trades} trades, ${f.holdout.winRatePct}% win rate, ${f.holdout.expectancyR}R expectancy, PF ${f.holdout.profitFactor??"-"}. Because 2026 was reviewed in the earlier study, it is not an untouched holdout for this upgrade. ${result.robust60Found?"The rule exceeded 60% with positive expectancy in every split, but still lacks a genuinely fresh independent period.":"The upgrade did not establish a robust 60%+ win rate."}\n\n## Fixed constraints\n\n- T1 2R and T2 3R; 50/50 exit; breakeven runner after T1\n- Maximum 10 sessions; next-session execution; 0.30% friction\n- Official NSE EQ archives; stop-first same-bar policy\n- Minimum samples ${MINIMUM.development}/${MINIMUM.validation}\n- Precision gate: win rate >=60%, positive expectancy and PF >=1.10 in both 2022-24 and 2025\n\n## Pre-2026 comparison\n\n| Rank | Precision upgrade | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | 60% gate |\n|---:|---|---:|---:|---:|---:|\n${rows}\n\nNo threshold is approved merely because it reaches 60% in one slice. Research only.\n`;
}

async function main(){
  await Promise.all([fs.mkdir(CACHE,{recursive:true}),fs.mkdir(path.join(ROOT,"data"),{recursive:true}),fs.mkdir(path.join(ROOT,"reports"),{recursive:true})]);
  const files=await mapLimit(datesBetween(DOWNLOAD_START,END),12,loadDate);
  const sessions=files.filter(rows=>rows.length>=500).sort((a,b)=>a[0].date.localeCompare(b[0].date));
  if(sessions.length<1000)throw new Error(`Insufficient sessions ${sessions.length}`);
  const histories=new Map(),lastAction=new Map(),signals=[];let eligibleObservations=0,actionExcluded=0;
  for(let si=0;si<sessions.length;si++){
    const rows=sessions[si],date=rows[0].date;
    for(const row of rows){if(!histories.has(row.symbol))histories.set(row.symbol,[]);const bars=histories.get(row.symbol),previous=bars.at(-1);bars.push(row);if(previous&&looksLikeCorporateAction(previous,row))lastAction.set(row.symbol,bars.length-1);}
    if(date<START)continue;
    const eligible=[...histories.entries()].filter(([,bars])=>bars.length>=253&&bars.at(-1).date===date);
    const clean=eligible.filter(([symbol,bars])=>{const excluded=bars.length-1-(lastAction.get(symbol)??-9999)<253;if(excluded)actionExcluded++;return !excluded;});
    eligibleObservations+=clean.length;
    const momentum=zScoreRows(clean.map(([symbol,bars])=>({symbol,...momentumInputs(bars)})).filter(row=>row.ratio6m!=null));
    const breadth50=average(clean.map(([,bars])=>bars.at(-1).close>smaAt(bars.map(bar=>bar.close),50)))||0;
    const marketReturn20=median(clean.filter(([,bars])=>bars.length>=21).map(([,bars])=>bars.at(-1).close/bars.at(-21).close-1))||0;
    for(const [symbol,bars] of clean){
      const rank=momentum.get(symbol);if(!rank||rank.percentile<70||breadth50<.50||marketReturn20<-.01)continue;
      if(!historicalFootprint(bars.slice(0,-1))?.selected)continue;
      for(const plan of buildPrecision60Plans(bars,{momentum:rank,breadth50,marketReturn20}))signals.push({symbol,barIndex:bars.length-1,...plan});
    }
    if(si%100===0)console.log(`Replay ${date}: ${signals.length} signals`);
  }
  const tournament=[];
  for(const family of PRECISION60_FAMILIES){const familySignals=signals.filter(signal=>signal.family===family);for(const management of PRECISION60_MANAGEMENT){
    const development=summarizeTrades(simulatePeriod(familySignals,histories,management,DEVELOPMENT));
    const validation=summarizeTrades(simulatePeriod(familySignals,histories,management,VALIDATION));
    const sampleSufficient=development.trades>=MINIMUM.development&&validation.trades>=MINIMUM.validation;
    const deployable=sampleSufficient&&development.expectancyR>0&&validation.expectancyR>0&&development.profitFactor>=1.10&&validation.profitFactor>=1.10;
    const precision60=deployable&&development.winRatePct>=60&&validation.winRatePct>=60;
    tournament.push({family,management:management.name,managementDefinition:management,development,validation,sampleSufficient,deployable,precision60,selectionScore:score(development,validation)});
  }}
  const precision60=tournament.filter(row=>row.precision60),deployable=tournament.filter(row=>row.deployable),sufficient=tournament.filter(row=>row.sampleSufficient),pool=precision60.length?precision60:deployable.length?deployable:sufficient.length?sufficient:tournament;
  const frozen=[...pool].sort((a,b)=>b.selectionScore-a.selectionScore)[0];
  const frozenSignals=signals.filter(signal=>signal.family===frozen.family);
  const holdoutTrades=simulatePeriod(frozenSignals,histories,frozen.managementDefinition,HOLDOUT),base=summarizeTrades(holdoutTrades);
  const holdout={...base,wilsonLower95Pct:wilsonLower(base.wins,base.trades)};
  const result={
    meta:{name:"Precision60 RR2 Upgrade",generatedAt:new Date().toISOString(),source:"Official NSE security-wise EQ archives",downloadStart:DOWNLOAD_START,signalStart:START,marketEnd:sessions.at(-1)[0].date,sessions:sessions.length,symbols:histories.size,eligibleObservations,signals:signals.length,actionExcluded,candidateCount:tournament.length},
    methodology:{pointInTime:true,nextSessionExecution:true,maxHoldSessions:MAX_HOLD,frictionPct:FRICTION_PCT,sameBarPolicy:"stop-first",development:"2022-2024",validation:"2025",reusedDiagnostic:"2026",holdoutUsedInSelection:true,holdoutCaveat:"2026 was reviewed before this upgrade and is not untouched",minimumSamples:MINIMUM,firstTargetMinimumR:2,secondTargetR:3},
    signalCounts:Object.fromEntries(PRECISION60_FAMILIES.map(family=>[family,signals.filter(signal=>signal.family===family).length])),
    preHoldoutRankings:[...tournament].sort((a,b)=>(Number(b.precision60)-Number(a.precision60))||b.selectionScore-a.selectionScore).map(({managementDefinition,...row})=>row),precision60PreHoldoutFound:precision60.length>0,deployableVariantFound:deployable.length>0,
    frozenVariant:{...Object.fromEntries(Object.entries(frozen).filter(([key])=>key!=="managementDefinition")),holdout},
    robust60Found:frozen.sampleSufficient&&frozen.development.winRatePct>=60&&frozen.validation.winRatePct>=60&&holdout.winRatePct>=60&&frozen.development.expectancyR>0&&frozen.validation.expectancyR>0&&holdout.expectancyR>0
  };
  await fs.writeFile(path.join(ROOT,"data","precision60-upgrade.json"),JSON.stringify(result,null,2)+"\n");
  await fs.writeFile(path.join(ROOT,"reports","precision60-upgrade-report.md"),precisionReport(result));
  const columns=["symbol","signalDate","family","entryDate","exitDate","entryPrice","stop","t1","t2","exitReason","holdSessions","netReturnPct","netR","atrPct","momentumPercentile","footprintScore"];
  await fs.writeFile(path.join(ROOT,"reports","precision60-upgrade-2026-trades.csv"),[columns.join(","),...holdoutTrades.map(trade=>columns.map(column=>trade[column]??"").join(","))].join("\n")+"\n");
  console.log(JSON.stringify({meta:result.meta,signalCounts:result.signalCounts,precision60PreHoldoutFound:result.precision60PreHoldoutFound,deployableVariantFound:result.deployableVariantFound,frozenVariant:result.frozenVariant,robust60Found:result.robust60Found},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
