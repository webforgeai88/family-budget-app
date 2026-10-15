import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const config=fs.readFileSync(new URL('../lib/supabase.ts',import.meta.url),'utf8');
const [,url,key]=config.match(/createClient\('([^']+)',"([^"]+)"\)/);
const qa=JSON.parse(fs.readFileSync(new URL('../qa/credentials.json',import.meta.url),'utf8'));
const clients=qa.users.map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}));
for(let i=0;i<2;i++){const {error}=await clients[i].auth.signInWithPassword({email:qa.users[i].email,password:qa.password});assert.equal(error,null,'real Auth password login');}
const [a,b]=clients;
const rpc=async(client,name,args)=>{const r=await client.rpc(name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const initial=await rpc(a,'lad_read');assert.equal(initial.categories.length,11);assert.equal(initial.operations.length,0);
let saved=await rpc(a,'lad_commit',{p_revision:initial.revision,p_data:{...initial,operations:[{id:'qa-operation',kind:'expense',categoryId:'food',amount:12345,date:'2026-10-15',comment:'Проверка облака'}]}});
assert.equal(saved.operations[0].amount,12345);console.log('PASS real sign-in, initial categories and kopecks persistence');
assert.equal((await rpc(b,'lad_read')).operations.length,0);
assert.equal((await b.from('lad_operations').select('*').eq('owner_id',qa.users[0].id)).data.length,0);
assert.ok((await b.from('lad_categories').insert({owner_id:qa.users[0].id,id:'attack',name:'attack',kind:'expense',color:'#123456',icon:'x'})).error);
const foreign=await b.from('lad_operations').update({comment:'attack'}).eq('owner_id',qa.users[0].id).select();assert.deepEqual(foreign.data,[]);
assert.equal((await rpc(a,'lad_read')).operations[0].comment,'Проверка облака');console.log('PASS two accounts: cross-user read, insert and update blocked');
assert.ok((await a.rpc('lad_commit',{p_revision:initial.revision,p_data:saved})).error);console.log('PASS stale revision cannot overwrite another device');
const invalids=[{...saved,operations:[{...saved.operations[0],amount:1.5}]},{...saved,operations:[{...saved.operations[0],amount:-1}]},{...saved,operations:[{...saved.operations[0],date:'2026-02-30'}]},{...saved,operations:[{...saved.operations[0],kind:'income'}]},{...saved,categories:[]},{...saved,categories:[...saved.categories,saved.categories[0]]}];
for(const candidate of invalids){assert.ok((await a.rpc('lad_commit',{p_revision:saved.revision,p_data:candidate})).error);assert.deepEqual(await rpc(a,'lad_read'),saved);}
console.log('PASS six invalid imports roll back without losing budget or revision');
const backups=await a.from('lad_backups').select('*');assert.equal(backups.error,null);assert.equal(backups.data.length,1);assert.equal(backups.data[0].snapshot.operations.length,0);
assert.equal((await b.from('lad_backups').select('*').eq('owner_id',qa.users[0].id)).data.length,0);console.log('PASS private daily snapshot');
const guest=createClient(url,key,{auth:{persistSession:false}});assert.ok((await guest.rpc('lad_read')).error);assert.ok((await guest.from('lad_operations').select('*')).error);console.log('PASS unauthenticated budget access denied');
const second=createClient(url,key,{auth:{persistSession:false}});assert.equal((await second.auth.signInWithPassword({email:qa.users[0].email,password:qa.password})).error,null);assert.deepEqual((await rpc(second,'lad_read')).operations,saved.operations);console.log('PASS fresh device sees cloud data');
await second.auth.signOut();for(const c of clients)await c.auth.signOut();
