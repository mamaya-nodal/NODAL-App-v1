import { describe, it, expect } from "vitest";
import { verifiesNinjaSessionResult } from "./result-evidence";
import type { NinjaTelemetryRow } from "./operation-probe";
const time=(n:number)=>`2026-11-13T15:00:${String(n).padStart(2,"0")}Z`;
const balance=(id:number,realized:number):NinjaTelemetryRow=>({id,event_type:"balance",occurred_at:time(id),
  account_name:"b",connection_name:"c",instrument:null,payload:{cashValue:1000+realized,realizedProfitLoss:realized}});
const execution=(id:number):NinjaTelemetryRow=>({...balance(id,0),event_type:"execution",instrument:"MNQ DEC26",payload:{quantity:1}});
const rows=[balance(0,50),execution(1),execution(10),balance(11,40)];
describe("independent session result",()=>{
  it("verifies a net loss independently of the expected accounting balance",()=>{
    expect(verifiesNinjaSessionResult(rows,time(1),time(21),-10)).toBe(true);
  });
  it("never verifies a deposit included in the cash difference as profit",()=>{
    expect(verifiesNinjaSessionResult(rows,time(1),time(21),490)).toBe(false);
  });
  it("requires prior and final realized readings and executions",()=>{
    expect(verifiesNinjaSessionResult(rows.slice(1),time(1),time(21),-10)).toBe(false);
    expect(verifiesNinjaSessionResult(rows.filter(r=>r.event_type==='balance'),time(1),time(21),-10)).toBe(false);
    expect(verifiesNinjaSessionResult(rows,time(1),null,-10)).toBe(false);
  });
});
