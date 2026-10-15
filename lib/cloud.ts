import { supabase } from './supabase';
import { applyAction, validateData, type DemoData } from './actions';
import { today } from './budget';
type CloudData = DemoData & {revision:number};
let current:CloudData|null=null;
let owner:string|null=null;
function failure(error:{message:string;code?:string}) {
 if(error.code==='40001')return new Error(error.message);
 if(error.message.includes('JWT')||error.code==='PGRST301')return new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
 return new Error(error.message||'Не удалось связаться с базой. Проверьте интернет.');
}
export async function readCloud():Promise<CloudData>{
 const requestedOwner=(await supabase.auth.getSession()).data.session?.user.id;
 if(!requestedOwner)throw new Error('Войдите в аккаунт.');
 const {data,error}=await supabase.rpc('lad_read');if(error)throw failure(error);
 if((await supabase.auth.getSession()).data.session?.user.id!==requestedOwner)throw new Error('Аккаунт изменился. Обновите страницу.');
 owner=requestedOwner;
 current=data as CloudData;return current!;
}
async function commit(data:DemoData){
 if(!current)throw new Error('Сначала загрузите бюджет.');
 if((await supabase.auth.getSession()).data.session?.user.id!==owner){current=null;throw new Error('Аккаунт изменился. Обновите страницу.');}
 const {data:result,error}=await supabase.rpc('lad_commit',{p_revision:current.revision,p_data:data});
 if(error)throw failure(error);current=result as CloudData;return current;
}
export async function mutateCloud(body:Record<string,unknown>){if(!current)await readCloud();return commit(applyAction(current!,body));}
export async function restoreCloud(raw:unknown){
 const b=raw as Record<string,unknown>;
 if(b?.version!==1||b.currency!=='RUB'||b.amountUnit!=='kopecks')throw new Error('Выберите JSON-копию бюджета Лад.');
 return commit(validateData(raw));
}
export async function backupDates(){const {data,error}=await supabase.from('lad_backups').select('date').order('date',{ascending:false});if(error)throw failure(error);return (data||[]).map(b=>b.date as string);}
export async function downloadBackup(date?:string){
 let data:DemoData;
 if(date){const {data:row,error}=await supabase.from('lad_backups').select('snapshot').eq('date',date).single();if(error)throw failure(error);data=row.snapshot as DemoData;}else data=await readCloud();
 const {user,categories,operations,messages,consent}=data;
 const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,currency:'RUB',amountUnit:'kopecks',createdAt:new Date().toISOString(),user,categories,operations,messages,consent},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='lad-budget-'+(date||today())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
supabase.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(owner&&session?.user.id!==owner)){current=null;owner=null;}});
