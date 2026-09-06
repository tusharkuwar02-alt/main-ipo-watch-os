import fs from "node:fs/promises";
import path from "node:path";
import { looksLikeCorporateAction, simulateTwoTargetTrade, summarizeTrades } from "../lib/smart-money-backtest.mjs";
import { momentumInputs, zScoreRows, historicalFootprint } from "../lib/quality-momentum-pullback.mjs";
import { smaAt, wilsonLower } from "../lib/smart-money-strategy-tournament.mjs";
import { SWING_CONFIGS, SWING_MANAGEMENT, buildTripleConfirmPlan } from "../lib/smart-money-triple-confirm-swing.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CACHE = path.join(ROOT, ".cache", "smart-money-bhavcopy");
const START = process.env.BACKTEST_START || "2022-01-01";
const DOWNLOAD_START = process.env.BACKTEST_DOWNLOAD_START || "2020-12-01";
const END = process.env.BACKTEST_END || new Date().toISOString().slice(0, 10);
const FRICTION_PCT = .003, MAX_HOLD = 10;
const DEVELOPMENT = new Set(["2022", "2023", "2024"]), VALIDATION = new Set(["2025"]), HOLDOUT = new Set(["2026"]);
const MINIMUM = { development: 200, validation: 60 };
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharTripleConfirmSwing/1.0)", Accept: "text/csv,*/*" };
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const median = values => { const sorted = [...values].sort((a,b) => a-b); return sorted.length ? (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.ceil((sorted.length-1)/2)]) / 2 : NaN; };

function csvLine(line) {
  const values=[]; let value="", quoted=false;
  for (const char of line) { if (char === '"') quoted=!quoted; else if (char === "," && !quoted) { values.push(value.trim()); value=""; } else value += char; }
  values.push(value.trim()); return values;
}

function parseBhavcopy(text) {
  const lines=text.trim().split(/\r?\n/); if(lines.length<2) return [];
  const header=csvLine(lines[0]), at=Object.fromEntries(header.map((name,index)=>[name.trim(),index]));
  return lines.slice(1).map(csvLine).filter(row=>row[at.SERIES]==="EQ").map(row=>{
    const close=Number(row[at.CLOSE_PRICE]), deliveryQty=Number(row[at.DELIV_QTY])||0;
    return { symbol:row[at.SYMBOL], date:new Date(`${row[at.DATE1]} UTC`).toISOString().slice(0,10), open:Number(row[at.OPEN_PRICE]), high:Number(row[at.HIGH_PRICE]), low:Number(row[at.LOW_PRICE]), close, volume:Number(row[at.TTL_TRD_QNTY]), deliveryQty, deliveryPct:Number(row[at.DELIV_PER])||0, deliverableValue:close*deliveryQty, turnoverCr:(Number(row[at.TURNOVER_LACS])||0)/100 };
  }).filter(row=>row.symbol && [row.open,row.high,row.low,row.close,row.volume].every(Number.isFinite));
}

function datesBetween(start,end){ const dates=[], cursor=new Date(`${start}T00:00:00Z`), last=new Date(`${end}T00:00:00Z`); while(cursor<=last){ if(![0,6].includes(cursor.getUTCDay())) dates.push(new Date(cursor)); cursor.setUTCDate(cursor.getUTCDate()+1); } return dates; }
function archive(date){ const dd=String(date.getUTCDate()).padStart(2,"0"), mm=String(date.getUTCMonth()+1).padStart(2,"0"); return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${date.getUTCFullYear()}.csv`; }

async function loadDate(date){
  const key=date.toISOString().slice(0,10), file=path.join(CACHE,`${key}.csv`);
  try{return parseBhavcopy(await fs.readFile(file,"utf8"));}catch{}
  for(let attempt=0;attempt<4;attempt++){
    try{ const response=await fetch(archive(date),{headers,signal:AbortSignal.timeout(45000)}); if(response.status===404)return[]; if(!response.ok)throw new Error(`${response.status}`); const text=await response.text(),rows=parseBhavcopy(text); if(rows.length<500)throw new Error(`unsafe row count ${rows.length}`); await fs.writeFile(file,text); return rows; }
    catch(error){ if(attempt===3){console.warn(`download failed ${key}: ${error.message}`);return [];} await new Promise(resolve=>setTimeout(resolve,600*(attempt+1))); }
  }
}

async function mapLimit(items,limit,worker){ const results=new Array(items.length); let cursor=0; async function run(){while(cursor<items.length){const index=cursor++;results[index]=await worker(items[index]);}} await Promise.all(Array.from({length:Math.min(limit,items.length)},run)); return results; }

function simulatePeriod(signals,histories,management,years){
  const unavailable=new Map(), trades=[];
  for(const signal of signals.filter(item=>years.has(item.signalDate.slice(0,4))).sort((a,b)=>a.signalDate.localeCompare(b.signalDate)||a.symbol.localeCompare(b.symbol))){
    if(signal.barIndex <= (unavailable.get(signal.symbol)??-1)) continue;
    const outcome=simulateTwoTargetTrade(histories.get(signal.symbol),signal.barIndex,signal,{...management,waitSessions:2,maxHoldSessions:MAX_HOLD,frictionPct:FRICTION_PCT,orderType:signal.orderType});
    unavailable.set(signal.symbol,outcome.unavailableUntil??signal.barIndex);
    if(outcome.status==="entered") trades.push({...signal,...outcome,management:management.name});
  }
  return trades;
}

function score(dev,val){
  const worstExp=Math.min(dev.expectancyR,val.expectancyR), worstPf=Math.min(dev.profitFactor||0,val.profitFactor||0), worstWr=Math.min(dev.winRatePct,val.winRatePct);
  const instability=Math.abs(dev.expectancyR-val.expectancyR)*25+Math.abs(dev.winRatePct-val.winRatePct)*.15;
  return +(worstExp*100+worstPf*8+worstWr*.15+Math.min(dev.realizedPayoffRatio||0,val.realizedPayoffRatio||0)*4-instability).toFixed(3);
}

function compact(m){return `${m.trades} / ${m.winRatePct}% / ${m.expectancyR}R / ${m.profitFactor??"-"}`;}
function report(result){
  const f=result.frozenVariant;
  const rows=result.preHoldoutRankings.map((row,i)=>`| ${i+1} | ${row.variant} | ${row.management} | ${compact(row.development)} | ${compact(row.validation)} | ${row.sampleSufficient?"Yes":"No"} | ${row.deployable?"Yes":"No"} |`).join("\n");
  return `# Smart Money Triple-Confirm Swing - 2 to 10 Day Backtest\n\nGenerated: ${result.meta.generatedAt}\n\n## Direct decision\n\n${result.deployableVariantFound?`The locked pre-holdout gate selected **${f.variant} + ${f.management}** as deployable.`:`**No calibration passed the locked pre-holdout deployability gate.** The frozen row is a research comparator, not a live signal.`} Untouched 2026: ${f.holdout.trades} trades, ${f.holdout.winRatePct}% win rate, ${f.holdout.expectancyR}R expectancy, ${f.holdout.profitFactor??"-"} profit factor. ${result.robust60Found?"The frozen rule maintained at least 60% win rate and positive expectancy in all three periods.":"It did not establish a robust 60-70% win rate."}\n\n## Three core indicators\n\n1. Volatility-adjusted 6/12-month relative momentum rank.\n2. RSI(2) oversold pullback.\n3. ATR(14) as a fast-movement filter.\n\nSmart Money Footprint is prior stock-selection evidence, not a fourth timing trigger. Additional controls: price above a rising SMA50, near the 52-week high, liquid turnover, subdued pullback volume, and non-hostile broad-market regime.\n\n## Locked execution\n\n- Official NSE EQ daily archives; point-in-time universe\n- Development 2022-2024; validation 2025; untouched 2026 through ${result.meta.marketEnd}\n- Next-session entry; maximum 10 sessions; 0.30% round-trip friction\n- T1 never below 1.5R; T2 2.5R; conservative stop-first same-bar handling\n- Minimum samples ${MINIMUM.development}/${MINIMUM.validation}; deployable requires expectancy > 0 and PF > 1 in both development and validation\n\n## All pre-holdout calibrations\n\n| Rank | Entry calibration | Management | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | Deployable |\n|---:|---|---|---:|---:|---:|---:|\n${rows}\n\n## Frozen result\n\n- Development: ${compact(f.development)}\n- Validation: ${compact(f.validation)}\n- Untouched 2026: ${compact(f.holdout)}; Wilson lower 95% win-rate bound ${f.holdout.wilsonLower95Pct}%\n\nResearch only; no future return is guaranteed.\n`;
}

async function main(){
  await Promise.all([fs.mkdir(CACHE,{recursive:true}),fs.mkdir(path.join(ROOT,"data"),{recursive:true}),fs.mkdir(path.join(ROOT,"reports"),{recursive:true})]);
  const files=await mapLimit(datesBetween(DOWNLOAD_START,END),12,loadDate);
  const sessions=files.filter(rows=>rows.length>=500).sort((a,b)=>a[0].date.localeCompare(b[0].date));
  if(sessions.length<1000)throw new Error(`Insufficient sessions ${sessions.length}`);
  const histories=new Map(), lastAction=new Map(), signals=[]; let eligibleObservations=0,actionExcluded=0;
  for(let si=0;si<sessions.length;si++){
    const rows=sessions[si],date=rows[0].date;
    for(const row of rows){if(!histories.has(row.symbol))histories.set(row.symbol,[]);const bars=histories.get(row.symbol),previous=bars.at(-1);bars.push(row);if(previous&&looksLikeCorporateAction(previous,row))lastAction.set(row.symbol,bars.length-1);}
    if(date<START)continue;
    const eligible=[...histories.entries()].filter(([,bars])=>bars.length>=253&&bars.at(-1).date===date);
    const clean=eligible.filter(([symbol,bars])=>{const excluded=bars.length-1-(lastAction.get(symbol)??-9999)<253;if(excluded)actionExcluded++;return !excluded;});
    eligibleObservations+=clean.length;
    const momentum=zScoreRows(clean.map(([symbol,bars])=>({symbol,...momentumInputs(bars)})).filter(row=>row.ratio6m!=null));
    const breadth50=average(clean.map(([,bars])=>bars.at(-1).close>smaAt(bars.map(bar=>bar.close),50)))||0;
    const marketReturn20=median(clean.map(([,bars])=>bars.at(-1).close/bars.at(-21).close-1))||0;
    for(const [symbol,bars] of clean){
      const rank=momentum.get(symbol); if(!rank||rank.percentile<80||breadth50<.50||marketReturn20<-.01)continue;
      if(!historicalFootprint(bars.slice(0,-1))?.selected)continue;
      for(const config of SWING_CONFIGS){const plan=buildTripleConfirmPlan(bars,{momentum:rank,breadth50,marketReturn20},config);if(plan)signals.push({symbol,barIndex:bars.length-1,...plan});}
    }
    if(si%100===0)console.log(`Replay ${date}: ${signals.length} signals`);
  }
  const rows=[];
  for(const config of SWING_CONFIGS){const setupSignals=signals.filter(signal=>signal.variant===config.name);for(const management of SWING_MANAGEMENT){
    const development=summarizeTrades(simulatePeriod(setupSignals,histories,management,DEVELOPMENT));
    const validation=summarizeTrades(simulatePeriod(setupSignals,histories,management,VALIDATION));
    const sampleSufficient=development.trades>=MINIMUM.development&&validation.trades>=MINIMUM.validation;
    const deployable=sampleSufficient&&development.expectancyR>0&&validation.expectancyR>0&&development.profitFactor>1&&validation.profitFactor>1;
    rows.push({variant:config.name,management:management.name,managementDefinition:management,development,validation,sampleSufficient,deployable,selectionScore:score(development,validation)});
  }}
  const deployable=rows.filter(row=>row.deployable),sufficient=rows.filter(row=>row.sampleSufficient),pool=deployable.length?deployable:sufficient.length?sufficient:rows;
  const frozen=[...pool].sort((a,b)=>b.selectionScore-a.selectionScore)[0];
  const frozenSignals=signals.filter(signal=>signal.variant===frozen.variant),holdoutTrades=simulatePeriod(frozenSignals,histories,frozen.managementDefinition,HOLDOUT),holdoutBase=summarizeTrades(holdoutTrades);
  const holdout={...holdoutBase,wilsonLower95Pct:wilsonLower(holdoutBase.wins,holdoutBase.trades)};
  const result={
    meta:{name:"Smart Money Triple-Confirm Swing",generatedAt:new Date().toISOString(),source:"Official NSE security-wise EQ archives",downloadStart:DOWNLOAD_START,signalStart:START,marketEnd:sessions.at(-1)[0].date,sessions:sessions.length,symbols:histories.size,eligibleObservations,signals:signals.length,actionExcluded},
    methodology:{threeCoreIndicators:["6/12-month volatility-adjusted relative momentum","RSI(2)","ATR(14) percent"],pointInTime:true,nextSessionExecution:true,maxHoldSessions:MAX_HOLD,frictionPct:FRICTION_PCT,sameBarPolicy:"stop-first",development:"2022-2024",validation:"2025",untouchedHoldout:"2026",holdoutUsedInSelection:false,minimumSamples:MINIMUM,t1R:1.5,t2R:2.5},
    preHoldoutRankings:[...rows].sort((a,b)=>b.selectionScore-a.selectionScore).map(({managementDefinition,...row})=>row),deployableVariantFound:deployable.length>0,
    frozenVariant:{...Object.fromEntries(Object.entries(frozen).filter(([key])=>key!=="managementDefinition")),holdout},
    robust60Found:frozen.sampleSufficient&&frozen.development.winRatePct>=60&&frozen.validation.winRatePct>=60&&holdout.winRatePct>=60&&frozen.development.expectancyR>0&&frozen.validation.expectancyR>0&&holdout.expectancyR>0
  };
  await fs.writeFile(path.join(ROOT,"data","smart-money-triple-confirm-swing.json"),JSON.stringify(result,null,2)+"\n");
  await fs.writeFile(path.join(ROOT,"reports","smart-money-triple-confirm-swing-report.md"),report(result));
  const columns=["symbol","signalDate","variant","rsi2","atrPct","momentumPercentile","footprintScore","entryDate","exitDate","entryPrice","stop","t1","t2","exitReason","holdSessions","netReturnPct","netR"];
  await fs.writeFile(path.join(ROOT,"reports","smart-money-triple-confirm-swing-2026-trades.csv"),[columns.join(","),...holdoutTrades.map(trade=>columns.map(column=>trade[column]??"").join(","))].join("\n")+"\n");
  console.log(JSON.stringify({meta:result.meta,deployableVariantFound:result.deployableVariantFound,frozenVariant:result.frozenVariant,robust60Found:result.robust60Found},null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
