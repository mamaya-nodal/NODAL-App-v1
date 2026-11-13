import { afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({upserts:[] as any[][],rows:[] as any[]}));
vi.mock("./automatic-operation-processing",()=>({persistAutomaticOperationBatches:async()=>({persistedBatches:0})}));
vi.mock("./transition-processing",()=>({processNinjaOperationBurns:async()=>undefined}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({from:(table:string)=>{
  const rows=()=>table==="ninja_account_links"?[{connection_name:"c",external_account_name:"LFE050123"}]:[];
  const q:any={select:()=>q,eq:()=>q,in:()=>q,is:()=>q,not:()=>q,lte:()=>q,gte:()=>q,or:()=>q,order:()=>q,limit:()=>q,
    maybeSingle:async()=>({data:null,error:null}),range:async()=>({data:mocks.rows,error:null}),
    upsert:async(values:any[])=>{mocks.upserts.push(values);return{error:null};},
    then:(resolve:any,reject:any)=>Promise.resolve({data:rows(),error:null}).then(resolve,reject)};
  return q;
}})}));
import {refreshNinjaTechnicalOperations} from "./technical-operation-processing";
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it("keeps the rebuild pending until a flat final packet has passed its quiet window",async()=>{
  vi.useFakeTimers({toFake:["Date"]});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.invalid");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","fixture");
  mocks.upserts.length=0;
  const row=(id:number,time:string,event_type:string,payload:any)=>({id,occurred_at:`2026-11-13T${time}Z`,event_type,payload,instrument:event_type==="balance"?null:"NQ DEC26",connection_name:"c",account_name:"LFE050123"});
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
