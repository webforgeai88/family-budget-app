import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Session} from '@supabase/supabase-js';
import {supabase,redirectUrl} from './lib/supabase';
const BudgetApp=React.lazy(()=>import('./app/budget-app'));
import './app/main.css';
import './app/demo-layout.css';
import './app/auth.css';

type Mode='login'|'signup'|'reset'|'password';
function explain(message:string){
 if(message.includes('Invalid login credentials'))return 'Неверная почта или пароль.';
 if(message.includes('Email not confirmed'))return 'Подтвердите почту по ссылке из письма.';
 if(message.includes('rate limit')||message.includes('security purposes'))return 'Слишком много попыток. Подождите немного и попробуйте снова.';
 if(message.includes('Email address not authorized'))return 'Отправка писем для этой почты ещё не настроена владельцем сайта.';
 if(message.includes('Failed to fetch'))return 'Нет связи с сервером. Проверьте интернет и повторите попытку.';
 return message;
}
function App(){
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[mode,setMode]=useState<Mode>('login');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.get('error_description'))setError(hash.get('error_description')!);
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{if(!active)return;setSession(s);setLoading(false);if(event==='PASSWORD_RECOVERY')setMode('password');});
  supabase.auth.getSession().then(({data,error})=>{if(active){if(error)setError(explain(error.message));setSession(data.session);setLoading(false);}});
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 function change(next:Mode){setMode(next);setError('');setNotice('');}
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setNotice('');setBusy(true);
  const f=new FormData(e.currentTarget),email=String(f.get('email')||'').trim(),password=String(f.get('password')||'');
  try{
   if(mode==='signup'){
    const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectUrl}});if(error)throw error;
    if(!data.session)setNotice('Проверьте почту: если адрес можно зарегистрировать, придёт письмо со ссылкой подтверждения. Затем войдите в аккаунт.');
   }else if(mode==='reset'){
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirectUrl});if(error)throw error;
    setNotice('Если аккаунт с такой почтой существует, на него придёт ссылка для смены пароля.');
   }else if(mode==='password'){
    const {error}=await supabase.auth.updateUser({password});if(error)throw error;change('login');
   }else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
  }catch(e){setError(explain((e as Error).message));}finally{setBusy(false);}
 }
 if(loading)return <div className="auth-loading"><span className="spinner"/>Проверяем вход…</div>;
 if(session&&mode!=='password')return <React.Suspense fallback={<div className="auth-loading">Загружаем бюджет…</div>}><BudgetApp key={session.user.id}/></React.Suspense>;
 return <main className="auth-shell"><section className="auth-story"><a className="brand" href="./"><span className="brand-mark"><i/><i/><i/></span><strong>лад<small>семейный бюджет</small></strong></a><div><p className="auth-eyebrow">Больше ясности. Меньше тревог.</p><h1>Всё важное —<br/>вместе.</h1><p>Доходы, расходы и понятная картина бюджета. Ваши записи доступны на любом устройстве после входа.</p><div className="auth-illustration" aria-hidden="true"><span>Наш бюджет</span><b>Планы становятся ближе</b><i/><i/><i/><i/><i/></div></div><small>Лад — когда в финансах всё понятно.</small></section><section className="auth-form-side"><div className="auth-card"><p className="page-context">Личный бюджет</p><h2>{mode==='signup'?'Создать аккаунт':mode==='reset'?'Восстановить доступ':mode==='password'?'Новый пароль':'Рады вас видеть'}</h2><p>{mode==='signup'?'Начните с чистого бюджета. Категории уже готовы.':mode==='reset'?'Отправим ссылку для смены пароля на вашу почту.':mode==='password'?'Придумайте пароль от 8 символов.':'Войдите по почте и паролю, чтобы продолжить.'}</p>
 {(mode==='login'||mode==='signup')&&<div className="auth-tabs"><button className={mode==='login'?'selected':''} onClick={()=>change('login')}>Войти</button><button className={mode==='signup'?'selected':''} onClick={()=>change('signup')}>Регистрация</button></div>}
 <form onSubmit={submit}>{mode!=='password'&&<label>Электронная почта<input type="email" name="email" autoComplete="email" placeholder="name@example.com" maxLength={254} required disabled={busy}/></label>}{mode!=='reset'&&<label>Пароль<input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:8} maxLength={128} required disabled={busy}/></label>}
 {error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status" className="auth-success">{notice}</p>}
 <button className="primary auth-submit" disabled={busy}>{busy?'Подождите…':mode==='signup'?'Создать аккаунт':mode==='reset'?'Отправить ссылку':mode==='password'?'Сохранить пароль':'Войти в бюджет'}</button></form>
 {mode==='login'?<button className="text-button" onClick={()=>change('reset')}>Забыли пароль?</button>:(mode==='reset'||mode==='password')&&<button className="text-button" onClick={()=>change('login')}>Вернуться ко входу</button>}
 <div className="auth-demo"><span>Хотите сначала посмотреть?</span><a href="https://webforgeai88.github.io/family-budget-demo/" target="_blank" rel="noreferrer">Открыть демо без регистрации ↗</a></div><p className="auth-privacy">У каждого аккаунта свой бюджет. ИИ-консультант пока отключён.</p></div></section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
