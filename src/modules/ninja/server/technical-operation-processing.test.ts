import { afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({upserts:[] as any[][],rows:[] as any[],prior:null as any,priorReads:[] as any[][],inventory:null as any}));
vi.mock("./automatic-operation-processing",()=>({persistAutomaticOperationBatches:async()=>({persistedBatches:0})}));
vi.mock("./transition-processing",()=>({processNinjaOperationBurns:async()=>undefined}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({from:(table:string)=>{
  const rows=()=>table==="ninja_account_links"?[{connection_name:"c",external_account_name:"LFE050123"}]:[];
  const filters:any[]=[];
  const q:any={select:()=>q,eq:(...v:any[])=>{filters.push(v);return q;},in:()=>q,is:()=>q,not:()=>q,lte:()=>q,
    lt:(...v:any[])=>{filters.push(v);return q;},gte:(...v:any[])=>{filters.push(v);return q;},
    or:()=>q,order:()=>q,limit:()=>q,
    maybeSingle:async()=>{
      if(table==="ninja_trade_telemetry_events"){mocks.priorReads.push(filters);return {data:mocks.prior,error:null};}
      return {data:table==="ninja_inventory_snapshots"?mocks.inventory:null,error:null};
    },range:async()=>({data:mocks.rows,error:null}),
    upsert:async(values:any[])=>{mocks.upserts.push(values);return{error:null};},
    then:(resolve:any,reject:any)=>Promise.resolve({data:rows(),error:null}).then(resolve,reject)};
  return q;
}})}));
import {refreshNinjaTechnicalOperations} from "./technical-operation-processing";
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();mocks.prior=null;mocks.inventory=null;mocks.priorReads.length=0;});
it("reconstructs separate physical observations before grouping accounting destinations",async()=>{
  vi.useFakeTimers({toFake:["Date"]});
  vi.setSystemTime(new Date("2026-11-13T12:00:20Z"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.invalid");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","fixture");
  mocks.upserts.length=0;
  mocks.rows=["pc1","pc2"].flatMap((physical,index)=>{
    const row=(id:number,time:string,event_type:string,payload:any)=>({id:id+index*100,physical_connector_id:physical,
      occurred_at:`2026-11-13T${time}Z`,event_type,payload,instrument:event_type==="balance"?null:"NQ DEC26",connection_name:"c",account_name:"LFE050123"});
    const result=20+10*index;
    return [row(1,"11:59:55.000","balance",{cashValue:10000,netLiquidation:10000,realizedProfitLoss:0}),
      row(2,"12:00:00.000","execution",{orderAction:"Buy",quantity:1,price:100}),
      row(3,"12:00:00.001","position",{marketPosition:"Long",quantity:1}),
      row(4,"12:00:02.000","execution",{orderAction:"Sell",quantity:1,price:101}),
      row(5,"12:00:02.010","position",{marketPosition:"Flat",quantity:0}),
      row(6,"12:00:02.020","balance",{cashValue:10000+result,netLiquidation:10000+result,realizedProfitLoss:result})];
  });
  await refreshNinjaTechnicalOperations("accounting-destination");
  expect(mocks.upserts.flat().map(row=>({source:row.physical_connector_id,result:row.result,verified:row.result_verified})))
    .toEqual([{source:"pc1",result:20,verified:true},{source:"pc2",result:30,verified:true}]);
});

it.each([
  { priorPnl: -626.9, verified: true, conflict: false },
  { priorPnl: null, verified: false, conflict: false },
  { priorPnl: -926.9, verified: false, conflict: true },
])("checks a bounded P&L reference outside the reconstruction window: $priorPnl", async ({priorPnl,verified,conflict})=>{
  vi.useFakeTimers({toFake:["Date"]});
  vi.setSystemTime(new Date("2026-11-18T17:24:30Z"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","fixture");
  mocks.upserts.length=0;
  const row=(id:number,time:string,event_type:string,payload:any)=>({
    id,physical_connector_id:"installation",occurred_at:`2026-11-18T${time}Z`,event_type,payload,
    instrument:event_type==="balance"?null:"MNQ DEC26",connection_name:"c",account_name:"LFE050123",
  });
  mocks.inventory={accounts:[{connectionName:"c",accountName:"LFE050123",cashValue:10916.7}],observed_at:"2026-11-18T17:11:56Z"};
  mocks.prior=priorPnl===null?null:row(1,"17:11:56.000","balance",{cashValue:10916.7,realizedProfitLoss:priorPnl});
  mocks.rows=[
    row(2,"17:20:07.096","execution",{orderAction:"SellShort",quantity:1,price:27164}),
    row(3,"17:20:07.096","execution",{orderAction:"SellShort",quantity:3,price:27164}),
    row(4,"17:20:07.098","execution",{orderAction:"SellShort",quantity:1,price:27164}),
    row(5,"17:20:12.196","position",{marketPosition:"Short",quantity:5}),
    row(6,"17:23:40.651","execution",{orderAction:"BuyToCover",quantity:1,price:27202.5}),
    row(7,"17:23:40.651","execution",{orderAction:"BuyToCover",quantity:4,price:27202.75}),
    row(8,"17:23:45.166","position",{marketPosition:"Flat",quantity:0}),
    row(9,"17:23:47.233","balance",{cashValue:10520.3,netLiquidation:10520.3,realizedProfitLoss:-1023.3,unrealizedProfitLoss:0}),
  ];
  await refreshNinjaTechnicalOperations("destination");
  expect(mocks.upserts.at(-1)?.[0]).toMatchObject({status:"closed",result:-396.4,result_verified:verified,result_conflict:conflict});
  expect(mocks.priorReads).toEqual([expect.arrayContaining([
    ["connector_id","destination"],["physical_connector_id","installation"],["connection_name","c"],["account_name","LFE050123"],
    ["occurred_at","2026-11-18T00:00:00.000Z"],["occurred_at","2026-11-18T17:20:07.096Z"],
  ])]);
});
it("keeps the rebuild pending until a flat final packet has passed its quiet window",async()=>{
  vi.useFakeTimers({toFake:["Date"]});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.invalid");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","fixture");
  mocks.upserts.length=0;
  const row=(id:number,time:string,event_type:string,payload:any)=>({id,physical_connector_id:"installation",occurred_at:`2026-11-13T${time}Z`,event_type,payload,instrument:event_type==="balance"?null:"NQ DEC26",connection_name:"c",account_name:"LFE050123"});
  mocks.rows=[row(1,"11:59:55.000","balance",{cashValue:10000,netLiquidation:10000,realizedProfitLoss:0}),
    row(2,"12:00:00.000","execution",{orderAction:"Buy",quantity:1,price:100}),
    row(3,"12:00:00.001","position",{marketPosition:"Long",quantity:1}),
    row(4,"12:00:02.000","execution",{orderAction:"Sell",quantity:1,price:101}),
    row(5,"12:00:02.010","position",{marketPosition:"Flat",quantity:0}),
    row(6,"12:00:02.020","balance",{cashValue:10020,netLiquidation:10020,realizedProfitLoss:20})];
  vi.setSystemTime(new Date("2026-11-13T12:00:05Z"));
  const first=await refreshNinjaTechnicalOperations("connector");
  expect(first).toMatchObject({replayPending:true,replaySince:"2026-11-13T12:00:00.000Z"});
  expect(mocks.upserts.at(-1)?.[0].status).toBe("settling");
  vi.setSystemTime(new Date("2026-11-13T12:00:20Z"));
  const later=await refreshNinjaTechnicalOperations("connector");
  expect(later).toMatchObject({replayPending:false,replaySince:null});
  expect(mocks.upserts.at(-1)?.[0]).toMatchObject({status:"closed",result:20,result_verified:true});
});
