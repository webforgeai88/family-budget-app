import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,validateData,type DemoData} from '../lib/actions.ts';
const empty:DemoData={user:'user',categories:[{id:'food',name:'Продукты',kind:'expense',color:'#e79a45',icon:'🥑',archived:0},{id:'other',name:'Прочее',kind:'expense',color:'#8493a7',icon:'📦',archived:0}],operations:[],messages:[],consent:false};
test('money input and category transfer preserve integer kopecks',()=>{let d=applyAction(empty,{action:'saveOperation',kind:'expense',categoryId:'food',amount:'123,45',date:'2026-10-15',comment:'Test'});assert.equal(d.operations[0].amount,12345);d=applyAction(d,{action:'deleteCategory',id:'food',targetId:'other'});assert.equal(d.operations[0].categoryId,'other');assert.equal(empty.operations.length,0);});
test('archived category is unavailable for new operation',()=>{const d=applyAction(empty,{action:'archiveCategory',id:'food',archived:true});assert.throws(()=>applyAction(d,{action:'saveOperation',kind:'expense',categoryId:'food',amount:'1',date:'2026-10-15'}));});
test('invalid imports are rejected',()=>{assert.throws(()=>validateData({...empty,categories:[...empty.categories,empty.categories[0]]}));assert.throws(()=>validateData({...empty,operations:[{id:'x',categoryId:'missing',kind:'expense',amount:1,date:'2026-10-15',comment:''}]}));});
