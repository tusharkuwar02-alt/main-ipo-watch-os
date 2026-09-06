import { atrAt, smaAt } from "./smart-money-strategy-tournament.mjs";
import { historicalFootprint } from "./quality-momentum-pullback.mjs";
import { rsiAt } from "./smart-money-triple-confirm-swing.mjs";

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const maximum = values => values.length ? Math.max(...values) : NaN;
const minimum = values => values.length ? Math.min(...values) : NaN;
const round = (value, digits=3) => Number.isFinite(value) ? +value.toFixed(digits) : null;

// Locked, theory-led precision tests. The 2R/3R exit is held constant so the
// search measures stock selection and entry quality, not target dilution.
export const PRECISION60_CONFIGS = [
  { name:"M90 leader", momentum:90 },
  { name:"M90 bull regime", momentum:90, breadth:.55, marketReturn:0 },
  { name:"M90 RSI10", momentum:90, rsiMax:10 },
  { name:"M90 deeper 6-12%", momentum:90, pullbackMax:-.06 },
  { name:"M85 breadth60", momentum:85, breadth:.60, marketReturn:0 },
  { name:"M90 gradual trend", momentum:90, positiveDays:.54 },
  { name:"M85 confirmed rebound", momentum:85, entryType:"stop" },
  { name:"M90 confirmed bull regime", momentum:90, breadth:.55, marketReturn:0, entryType:"stop" },
  { name:"M90 bullish rejection", momentum:90, bullishRejection:true, rsiMax:20 },
  { name:"M95 precision", momentum:95, rsiMax:10, breadth:.55, marketReturn:0 }
];
export const PRECISION60_FAMILIES = PRECISION60_CONFIGS.map(config=>config.name);
export const PRECISION60_MANAGEMENT = [
  { name:"50% at 2R / 50% at 3R; BE", t1R:2, t2R:3, t1ExitPct:.5, afterT1Stop:"breakeven" }
];

export function buildPrecision60Plans(bars, context) {
  if (bars.length < 253 || !context?.momentum) return [];
  const latest=bars.at(-1), closes=bars.map(bar=>bar.close), atr=atrAt(bars,14), atrPct=atr/latest.close*100;
  const sma50=smaAt(closes,50), sma50Past=smaAt(closes,50,closes.length-20);
  const high252=maximum(bars.slice(-252).map(bar=>bar.high)), low5=minimum(bars.slice(-5).map(bar=>bar.low));
  const avgVolume20=average(bars.slice(-21,-1).map(bar=>bar.volume));
  const volumeRatio=avgVolume20>0?latest.volume/avgVolume20:0;
  const pullback3=latest.close/bars.at(-4).close-1, rsi2=rsiAt(closes,2);
  const closeLocation=latest.high===latest.low?.5:(latest.close-latest.low)/(latest.high-latest.low);
  const returns126=bars.slice(-127).slice(1).map((bar,index)=>bar.close/bars.slice(-127)[index].close-1);
  const positiveDays=returns126.filter(value=>value>0).length/returns126.length;
  const footprint=historicalFootprint(bars.slice(0,-1));
  const common=footprint?.selected&&latest.close>=20&&atrPct>=2.5&&atrPct<=8&&latest.close>sma50&&sma50>sma50Past&&latest.close>=high252*.80&&volumeRatio<=1.2;
  if(!common)return [];
  const plans=[];
  for(const config of PRECISION60_CONFIGS){
    const pass=context.momentum.percentile>=config.momentum&&context.breadth50>=(config.breadth??.50)&&context.marketReturn20>=(config.marketReturn??-.01)&&
      rsi2<=(config.rsiMax??15)&&pullback3>=-.12&&pullback3<=(config.pullbackMax??-.04)&&positiveDays>=(config.positiveDays??0)&&
      (!config.bullishRejection||(latest.close>latest.open&&closeLocation>=.60));
    if(!pass)continue;
    const entry=config.entryType==="stop"?latest.high*1.001:latest.close;
    const stopLoss=Math.min(low5*.998,entry-atr*1.25),riskPct=(entry-stopLoss)/entry*100;
    if(!(entry>stopLoss)||riskPct<1.25||riskPct>8)continue;
    plans.push({strategy:"Precision60 RR2 Upgrade",family:config.name,signalDate:latest.date,entry,stopLoss,
      orderType:config.entryType??"limit",waitSessions:2,atrValue:atr,riskPct:round(riskPct,2),atrPct:round(atrPct,2),
      rsi2:round(rsi2,2),pullback3Pct:round(pullback3*100,2),positiveDays126Pct:round(positiveDays*100,2),
      momentumPercentile:round(context.momentum.percentile,1),return6mPct:round(context.momentum.return6m*100,2),
      return12mPct:round(context.momentum.return12m*100,2),footprintScore:footprint.score,volumeRatio:round(volumeRatio),
      breadth50Pct:round(context.breadth50*100,2),marketReturn20Pct:round(context.marketReturn20*100,2)});
  }
  return plans;
}
