import fs from "node:fs/promises";
import path from "node:path";
import { looksLikeCorporateAction, simulateTwoTargetTrade, summarizeTrades } from "../lib/smart-money-backtest.mjs";
import { momentumInputs, zScoreRows, historicalFootprint } from "../lib/quality-momentum-pullback.mjs";
import { smaAt, wilsonLower } from "../lib/smart-money-strategy-tournament.mjs";
import { RR2_FAMILIES, RR2_MANAGEMENT, buildRr2Plans } from "../lib/institutional-fast-mover-rr2.mjs";
import { INSTITUTIONAL_VARIANTS, institutionalFeatures, parseInstitutionalHoldingsXbrl, variantSignals } from "../lib/institutional-confirmation.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CACHE = path.join(ROOT, ".cache", "smart-money-bhavcopy");
const INSTITUTION_CACHE = path.join(ROOT, ".cache", "institutional-confirmation");
const START = process.env.BACKTEST_START || "2022-01-01";
const DOWNLOAD_START = process.env.BACKTEST_DOWNLOAD_START || "2020-12-01";
const END = process.env.BACKTEST_END || new Date().toISOString().slice(0, 10);
const FRICTION_PCT = .003, MAX_HOLD = 10;
const DEVELOPMENT = new Set(["2022", "2023", "2024"]), VALIDATION = new Set(["2025"]), HOLDOUT = new Set(["2026"]);
const MINIMUM = { development: 180, validation: 50 };
const MANAGEMENT = RR2_MANAGEMENT.find(item => item.name === "50% at 2R / 50% at 3R; BE");
const headers = { "User-Agent": "Mozilla/5.0 (compatible; TusharInstitutionalEngine/1.0)", Accept: "text/csv,*/*" };
const nseHeaders = { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*", Referer: "https://www.nseindia.com/" };
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

function addUtcDays(iso, days) { const date=new Date(`${iso}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10); }
function nseDate(value) {
  if (!value) return null;
  const match=String(value).toUpperCase().match(/(\d{1,2})-([A-Z]{3})-(\d{4})/); if(!match)return null;
  const month={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11}[match[2]];
  if(month==null)return null;return new Date(Date.UTC(Number(match[3]),month,Number(match[1]))).toISOString().slice(0,10);
}
function monthsBetween(start,end){const out=[],cursor=new Date(`${start.slice(0,7)}-01T00:00:00Z`),last=new Date(`${end.slice(0,7)}-01T00:00:00Z`);while(cursor<=last){out.push(new Date(cursor));cursor.setUTCMonth(cursor.getUTCMonth()+1);}return out;}
function monthKey(date){return date.toISOString().slice(0,7);}
function apiRange(date){const y=date.getUTCFullYear(),m=date.getUTCMonth(),first=`01-${String(m+1).padStart(2,"0")}-${y}`,lastDate=new Date(Date.UTC(y,m+1,0)),last=`${String(lastDate.getUTCDate()).padStart(2,"0")}-${String(m+1).padStart(2,"0")}-${y}`;return{first,last};}
async function cachedJson(kind,key,url){
  const dir=path.join(INSTITUTION_CACHE,kind),file=path.join(dir,`${key}.json`);await fs.mkdir(dir,{recursive:true});
  try{return JSON.parse(await fs.readFile(file,"utf8"));}catch{}
  for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(url,{headers:nseHeaders,signal:AbortSignal.timeout(45000)});if(!response.ok)throw new Error(`${response.status}`);const json=await response.json();await fs.writeFile(file,JSON.stringify(json));return json;}catch(error){if(attempt===2)throw new Error(`${kind} ${key}: ${error.message}`);await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));}}
}
async function shareholdingMetadata(){
  const months=monthsBetween("2021-01-01",END),pages=await mapLimit(months,4,async date=>{const {first,last}=apiRange(date);return cachedJson("shareholding-meta",monthKey(date),`https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&from_date=${first}&to_date=${last}`);});
  return pages.flatMap(page=>Array.isArray(page)?page:(page?.data||[])).map(row=>{const filed=nseDate(row.broadcastDate||row.submissionDate);return{symbol:row.symbol,quarterEnd:nseDate(row.date),availableDate:filed?addUtcDays(filed,1):null,xbrl:row.xbrl,recordId:String(row.recordId||"")};}).filter(row=>row.symbol&&row.quarterEnd&&row.availableDate&&/^https:\/\//.test(row.xbrl||""));
}
async function loadXbrl(record){
  const dir=path.join(INSTITUTION_CACHE,"shareholding-xbrl"),key=(record.xbrl.split("/").at(-1)||record.recordId).replace(/[^a-z0-9_.-]/gi,"_"),file=path.join(dir,key);await fs.mkdir(dir,{recursive:true});
  let xml;try{xml=await fs.readFile(file,"utf8");}catch{for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(record.xbrl,{headers:{...nseHeaders,Accept:"application/xml,text/xml,*/*"},signal:AbortSignal.timeout(45000)});if(!response.ok)throw new Error(`${response.status}`);xml=await response.text();if(xml.length<500)throw new Error("short XBRL");await fs.writeFile(file,xml);break;}catch(error){if(attempt===2)return null;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}}}
  const parsed=parseInstitutionalHoldingsXbrl(xml);return parsed?{...record,...parsed}:null;
}
function requiredFilings(metadata,signals){
  const bySymbol=new Map();for(const row of metadata){if(!bySymbol.has(row.symbol))bySymbol.set(row.symbol,[]);bySymbol.get(row.symbol).push(row);}
  const required=new Map();
  for(const signal of signals){const known=(bySymbol.get(signal.symbol)||[]).filter(row=>row.availableDate<=signal.signalDate);const byQuarter=new Map();for(const row of known){const current=byQuarter.get(row.quarterEnd);if(!current||row.availableDate>current.availableDate)byQuarter.set(row.quarterEnd,row);}const rows=[...byQuarter.values()].sort((a,b)=>a.quarterEnd.localeCompare(b.quarterEnd)).slice(-3);for(const row of rows)required.set(row.xbrl,row);}
  return [...required.values()];
}
async function holdingsBySymbol(signals){
  const metadata=await shareholdingMetadata(),required=requiredFilings(metadata,signals);console.log(`Institutional filings required: ${required.length}`);
  const parsed=(await mapLimit(required,10,loadXbrl)).filter(Boolean),bySymbol=new Map();for(const row of parsed){if(!bySymbol.has(row.symbol))bySymbol.set(row.symbol,[]);bySymbol.get(row.symbol).push(row);}return{bySymbol,metadataRows:metadata.length,required:required.length,parsed:parsed.length};
}
async function bulkDeals(){
  const months=monthsBetween("2021-10-01",END),requests=months.flatMap(date=>["bulk_deals","block_deals"].map(type=>({date,type}))),pages=await mapLimit(requests,4,async({date,type})=>{const {first,last}=apiRange(date);return cachedJson(type,monthKey(date),`https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=${type}&from=${first}&to=${last}`);});
  return pages.flatMap(page=>Array.isArray(page)?page:(page?.data||[])).map(row=>({date:nseDate(row.BD_DT_DATE),symbol:row.BD_SYMBOL,client:String(row.BD_CLIENT_NAME||"").trim().toUpperCase(),signedQty:(String(row.BD_BUY_SELL||"").toUpperCase().startsWith("B")?1:-1)*(Number(row.BD_QTY_TRD)||0)})).filter(row=>row.date&&row.symbol&&row.client&&row.signedQty);
}
function largeDealRatio(deals,signal,history){
  const start=addUtcDays(signal.signalDate,-90),clientNet=new Map();for(const deal of deals){if(deal.symbol!==signal.symbol||deal.date>=signal.signalDate||deal.date<start)continue;clientNet.set(deal.client,(clientNet.get(deal.client)||0)+deal.signedQty);}const netBuy=[...clientNet.values()].filter(value=>value>0).reduce((sum,value)=>sum+value,0);const avgVolume=average(history.slice(Math.max(0,signal.barIndex-20),signal.barIndex).map(bar=>bar.volume));return avgVolume>0?netBuy/avgVolume:0;
}

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
  const rows=result.pre2026Rankings.map((row,i)=>`| ${i+1} | ${row.variant} | ${compact(row.development)} | ${compact(row.validation)} | ${row.sampleSufficient?"Yes":"No"} | ${row.precision60?"Yes":"No"} |`).join("\n");
  const decision=result.acceptedUpgrade?`**${f.variant}** passed the locked improvement gate and is the accepted institutional layer.`:`**No institutional filter earned promotion.** The existing Deep Leader Pullback remains the production candidate; ${f.variant} is only the strongest research comparator.`;
  return `# Institutional Confirmation Engine — Point-in-Time Backtest\n\nGenerated: ${result.meta.generatedAt}\n\n## Direct answer\n\n${decision}\n\nReused 2026 diagnostic: ${f.holdout.trades} trades, ${f.holdout.winRatePct}% win rate, ${f.holdout.expectancyR}R expectancy and PF ${f.holdout.profitFactor??"-"}. It is not an untouched holdout because 2026 was already inspected in earlier system development. ${result.robust60Found?"The selected row exceeded 60% in all three slices, but still needs a new future sample.":"A robust 60%+ win rate was not established."}\n\n## Fixed trading rules\n\n- Existing Deep Leader Pullback entry only; no new chart setup\n- 50% exit at 2R, remaining 50% at 3R, breakeven stop after T1\n- Maximum 10 sessions, next-session execution, 0.30% friction, conservative stop-first same-bar handling\n- Development 2022-2024; validation 2025; 2026 reused diagnostic only\n\n## Institutional evidence tested\n\nQuarterly mutual-fund and FPI percentages came from NSE shareholding XBRL filings. A filing became usable only on the calendar day after its NSE broadcast, so quarter-end data could not leak into an earlier signal. Bulk-deal buys and sells were netted by client before aggregation; deals on the signal date were excluded. Market-wide FII/DII flow was deliberately excluded because it is not stock-level and can be distorted by hedging.\n\n## Pre-2026 comparison\n\n| Rank | Variant | Development trades / WR / Exp / PF | Validation trades / WR / Exp / PF | Sample OK | 60% gate |\n|---:|---|---:|---:|---:|---:|\n${rows}\n\n## Selected comparator\n\n- Development: ${compact(f.development)}\n- Validation: ${compact(f.validation)}\n- Reused 2026: ${compact(f.holdout)}\n- Reused-2026 95% Wilson lower win-rate bound: ${f.holdout.wilsonLower95Pct}%\n- Disclosure coverage: ${result.coverage.coveredSignals}/${result.coverage.baseSignals} signals (${result.coverage.coveragePct}%)\n\n## Decision rule\n\nAn upgrade required adequate samples, positive expectancy and PF >=1.10 in both pre-2026 splits, at least 60% win rate in both, and no deterioration versus the locked baseline's worst-split expectancy. Missing institutional disclosure was never interpreted as buying or selling. Historical results are research evidence, not a promise of permanent profit.\n`;
}

async function main(){
  await Promise.all([fs.mkdir(CACHE,{recursive:true}),fs.mkdir(path.join(ROOT,"data"),{recursive:true}),fs.mkdir(path.join(ROOT,"reports"),{recursive:true})]);
  const files=await mapLimit(datesBetween(DOWNLOAD_START,END),12,loadDate);
  const sessions=files.filter(rows=>rows.length>=500).sort((a,b)=>a[0].date.localeCompare(b[0].date));
  if(sessions.length<1000)throw new Error(`Insufficient sessions ${sessions.length}`);
  const histories=new Map(),lastAction=new Map(),baseSignals=[];let eligibleObservations=0,actionExcluded=0;
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
      for(const plan of buildRr2Plans(bars,{momentum:rank,breadth50,marketReturn20}))if(plan.family==="Deep leader pullback")baseSignals.push({symbol,barIndex:bars.length-1,...plan});
    }
    if(si%100===0)console.log(`Replay ${date}: ${baseSignals.length} base signals`);
  }
  const [holdings, deals]=await Promise.all([holdingsBySymbol(baseSignals),bulkDeals()]);
  const dealsBySymbol=new Map();for(const deal of deals){if(!dealsBySymbol.has(deal.symbol))dealsBySymbol.set(deal.symbol,[]);dealsBySymbol.get(deal.symbol).push(deal);}
  const signals=baseSignals.map(signal=>({...signal,...institutionalFeatures(holdings.bySymbol.get(signal.symbol)||[],signal.signalDate,largeDealRatio(dealsBySymbol.get(signal.symbol)||[],signal,histories.get(signal.symbol)))}));
  const tournament=[];
  for(const variant of INSTITUTIONAL_VARIANTS){const selected=variantSignals(signals,variant);
    const development=summarizeTrades(simulatePeriod(selected,histories,MANAGEMENT,DEVELOPMENT));
    const validation=summarizeTrades(simulatePeriod(selected,histories,MANAGEMENT,VALIDATION));
    const sampleSufficient=development.trades>=MINIMUM.development&&validation.trades>=MINIMUM.validation;
    const deployable=sampleSufficient&&development.expectancyR>0&&validation.expectancyR>0&&development.profitFactor>=1.10&&validation.profitFactor>=1.10;
    const precision60=deployable&&development.winRatePct>=60&&validation.winRatePct>=60;
    tournament.push({variant:variant.name,development,validation,sampleSufficient,deployable,precision60,selectionScore:score(development,validation)});
  }
  const baseline=tournament.find(row=>row.variant==="Locked baseline"),eligible=tournament.filter(row=>row.variant!=="Locked baseline"&&row.precision60&&Math.min(row.development.expectancyR,row.validation.expectancyR)>=Math.min(baseline.development.expectancyR,baseline.validation.expectancyR));
  const deployable=tournament.filter(row=>row.variant!=="Locked baseline"&&row.deployable),sufficient=tournament.filter(row=>row.variant!=="Locked baseline"&&row.sampleSufficient),pool=eligible.length?eligible:deployable.length?deployable:sufficient.length?sufficient:[baseline];
  const frozen=[...pool].sort((a,b)=>b.selectionScore-a.selectionScore)[0];
  const chosenVariant=INSTITUTIONAL_VARIANTS.find(item=>item.name===frozen.variant),frozenSignals=variantSignals(signals,chosenVariant);
  const holdoutTrades=simulatePeriod(frozenSignals,histories,MANAGEMENT,HOLDOUT),base=summarizeTrades(holdoutTrades);
  const holdout={...base,wilsonLower95Pct:wilsonLower(base.wins,base.trades)};
  const coveredSignals=signals.filter(signal=>signal.disclosureCovered).length;
  const result={
    meta:{name:"Institutional Confirmation Engine",generatedAt:new Date().toISOString(),source:"Official NSE EQ archives, shareholding-pattern XBRL filings and bulk-deal archive",downloadStart:DOWNLOAD_START,signalStart:START,marketEnd:sessions.at(-1)[0].date,sessions:sessions.length,symbols:histories.size,eligibleObservations,signals:signals.length,actionExcluded,candidateCount:tournament.length,shareholdingMetadataRows:holdings.metadataRows,requiredFilings:holdings.required,parsedFilings:holdings.parsed,bulkDealRows:deals.length},
    methodology:{pointInTime:true,filingLag:"usable from calendar day after NSE broadcast",bulkDeals:"client-netted; signal-date deals excluded",marketWideFiiDiiExcluded:true,nextSessionExecution:true,maxHoldSessions:MAX_HOLD,frictionPct:FRICTION_PCT,sameBarPolicy:"stop-first",development:"2022-2024",validation:"2025",reusedDiagnostic:"2026",holdoutUsedInSelection:true,holdoutCaveat:"2026 was reviewed before this upgrade and is not untouched",minimumSamples:MINIMUM,t1R:2,t2R:3},
    coverage:{baseSignals:signals.length,coveredSignals,coveragePct:+(coveredSignals/signals.length*100).toFixed(2)},
    pre2026Rankings:[...tournament].sort((a,b)=>(Number(b.precision60)-Number(a.precision60))||b.selectionScore-a.selectionScore),acceptedUpgrade:eligible.length>0,deployableVariantFound:deployable.length>0,
    frozenVariant:{...frozen,holdout},baseline,
    robust60Found:frozen.sampleSufficient&&frozen.development.winRatePct>=60&&frozen.validation.winRatePct>=60&&holdout.winRatePct>=60&&frozen.development.expectancyR>0&&frozen.validation.expectancyR>0&&holdout.expectancyR>0
  };
  await fs.writeFile(path.join(ROOT,"data","institutional-confirmation-backtest.json"),JSON.stringify(result,null,2)+"\n");
  await fs.writeFile(path.join(ROOT,"reports","institutional-confirmation-backtest-report.md"),report(result));
  const columns=["symbol","signalDate","entryDate","exitDate","entryPrice","stop","t1","t2","exitReason","holdSessions","netReturnPct","netR","mfPct","fpiPct","totalDeltaPct","previousTotalDeltaPct","largeDealNetBuyRatio","institutionalScore"];
  await fs.writeFile(path.join(ROOT,"reports","institutional-confirmation-2026-trades.csv"),[columns.join(","),...holdoutTrades.map(trade=>columns.map(column=>trade[column]??"").join(","))].join("\n")+"\n");
  console.log(JSON.stringify({meta:result.meta,coverage:result.coverage,acceptedUpgrade:result.acceptedUpgrade,baseline:result.baseline,frozenVariant:result.frozenVariant,robust60Found:result.robust60Found},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
