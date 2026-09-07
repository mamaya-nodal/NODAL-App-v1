type Page<T>={data:T[]|null;error:{code:string;message:string}|null};
/** The caller supplies a stable unique order. Never silently truncate monetary totals. */
export async function readAll<T>(query:{range(from:number,to:number):PromiseLike<Page<T>>}):Promise<Page<T>>{
  const data:T[]=[];
  for(let from=0;;from+=500){
    const page=await query.range(from,from+499);
    if(page.error)return {data:null,error:page.error};
    data.push(...(page.data??[]));
    if((page.data?.length??0)<500)return {data,error:null};
  }
}
