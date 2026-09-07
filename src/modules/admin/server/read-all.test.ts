import {expect,it} from 'vitest';
import {readAll} from './read-all';
it('reads beyond the API page limit without dropping economic records',async()=>{
 const records=Array.from({length:1201},(_,id)=>({id}));
 const result=await readAll({range:async(from,to)=>({data:records.slice(from,to+1),error:null})});
 expect(result.data).toEqual(records);
});
it('does not return partial totals after a failed page',async()=>{
 const result=await readAll({range:async(from)=>from?{data:null,error:{code:'network',message:'Failed'}}:{data:Array(500).fill(1),error:null}});
 expect(result.data).toBeNull();
 expect(result.error?.code).toBe('network');
});
