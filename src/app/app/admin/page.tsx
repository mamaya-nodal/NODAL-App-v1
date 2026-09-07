import { loadDesks } from '@/modules/admin/server/load-desks';
import { DeskPanel } from './desk-panel';
type Props={searchParams:Promise<{mode?:string;period?:string}>};
export default async function AdminPage({searchParams}:Props){
  const params=await searchParams;
  return <DeskPanel data={await loadDesks(params.mode==='practice'?'practice':'real',params.period)} />;
}
