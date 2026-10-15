import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/FreeDOM/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const qa=JSON.parse(fs.readFileSync(new URL('../qa/credentials.json',import.meta.url),'utf8'));
const uiComment='Проверка формы UI '+Date.now();
const base=process.env.TEST_URL||'http://127.0.0.1:5175/';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
fs.mkdirSync(new URL('../qa/screenshots/',import.meta.url),{recursive:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.getByRole('heading',{name:'Рады вас видеть'}).waitFor();
 for(const width of [390,768,1024,1366,1920,2560]){await page.setViewportSize({width,height:width===390?844:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:fileURLToPath(new URL('../qa/screenshots/auth-'+width+'.png',import.meta.url)) ,fullPage:true});}
 await page.getByRole('button',{name:'Регистрация',exact:true}).click();await page.getByRole('heading',{name:'Создать аккаунт'}).waitFor();
 await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByRole('button',{name:'Забыли пароль?'}).click();await page.getByRole('heading',{name:'Восстановить доступ'}).waitFor();await page.getByRole('button',{name:'Вернуться ко входу'}).click();
 await page.getByLabel('Электронная почта').fill(qa.users[0].email);await page.getByLabel('Пароль',{exact:true}).fill(qa.password);await page.getByRole('button',{name:'Войти в бюджет'}).click();await page.getByRole('heading',{name:'Картина вашего бюджета'}).waitFor();await page.getByText('Загружаем ваш бюджет…').waitFor({state:'hidden'});assert.equal(await page.getByText('Не удалось загрузить бюджет').count(),0);console.log('PASS real UI sign in and auth screens');
 await page.getByRole('button',{name:'Добавить операцию',exact:true}).first().click();await page.locator('input[name=amount]').fill('999,99');await page.locator('textarea[name=comment]').fill(uiComment);await page.getByRole('button',{name:'Сохранить операцию'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('Изменения сохранены в облаке').waitFor();
 await page.getByRole('button',{name:'Операции',exact:true}).first().click();await page.getByText(uiComment,{exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Картина вашего бюджета'}).waitFor();await page.getByRole('button',{name:'Операции',exact:true}).first().click();await page.getByText(uiComment,{exact:true}).waitFor();console.log('PASS save form and reload persistence');
 for(const width of [390,768,1024,1366,1920,2560]){
  await page.setViewportSize({width,height:width===390?844:1000});await page.getByRole('button',{name:'Аналитика',exact:true}).first().click();await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'dashboard overflow '+width);await page.screenshot({path:fileURLToPath(new URL('../qa/screenshots/budget-'+width+'.png',import.meta.url)),fullPage:true});
  await page.getByRole('button',{name:'Добавить операцию',exact:true}).first().click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'form overflow '+width);await page.screenshot({path:fileURLToPath(new URL('../qa/screenshots/form-'+width+'.png',import.meta.url)),fullPage:true});await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 }
 console.log('PASS six widths: auth, budget, modal; screenshots saved');
 await page.getByRole('button',{name:'Категории',exact:true}).click();await page.getByRole('button',{name:'Резервные копии и восстановление'}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать текущий бюджет'}).click();const file=await download;const json=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.equal(json.currency,'RUB');assert.ok(json.operations.some(o=>o.comment===uiComment));await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.getByRole('heading',{name:'Рады вас видеть'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Рады вас видеть'}).waitFor();assert.deepEqual(errors,[]);console.log('PASS JSON export and logout; no browser exceptions');
}finally{await browser.close();}
