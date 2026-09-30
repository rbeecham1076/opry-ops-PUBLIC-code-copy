import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { Dashboard } from './App'
import { StarLights } from './starlights'

type AccessState = 'checking' | 'admin' | 'denied'

export function App(){
 if(!supabase) return <Centered><h1>Setup needed</h1><p>Add the Supabase URL and publishable key to <code>.env</code> (see README), then restart.</p></Centered>
 return <AuthGate/>
}

function AuthGate(){
 const [session,setSession]=useState<Session|null|undefined>(undefined)
 const [access,setAccess]=useState<AccessState>('checking')

 useEffect(()=>{
  supabase!.auth.getSession().then(({data})=>setSession(data.session))
  const {data:sub}=supabase!.auth.onAuthStateChange((_event,s)=>setSession(s))
  return ()=>sub.subscription.unsubscribe()
 },[])

 useEffect(()=>{
  if(!session){setAccess('checking');return}
  let cancelled=false
  supabase!.rpc('is_ops_admin').then(({data,error})=>{if(!cancelled)setAccess(!error&&data===true?'admin':'denied')})
  return ()=>{cancelled=true}
 },[session?.user.id])

 const signOut=()=>{supabase!.auth.signOut()}

 if(session===undefined) return <Centered><p>Loading Opry Ops…</p></Centered>
 if(!session) return <SignIn/>
 if(access==='checking') return <Centered><p>Checking access…</p></Centered>
 if(access==='denied') return <Centered>
  <h1>Access not enabled</h1>
  <p>You're signed in as <b>{session.user.email}</b>, but this account hasn't been added to Opry Ops yet.</p>
  <button className="primary" onClick={signOut}>Sign out</button>
 </Centered>
 return <Dashboard onSignOut={signOut}/>
}

function SignIn(){
 const [email,setEmail]=useState(''); const [password,setPassword]=useState('')
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState<{kind:'error'|'info',text:string}|null>(null)

 async function withPassword(e:FormEvent){
  e.preventDefault(); setBusy(true); setMessage(null)
  const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password})
  if(error) setMessage({kind:'error',text:'That email and password didn’t match. Try again, or email yourself a sign-in link.'})
  setBusy(false)
 }

 async function withLink(){
  if(!email.trim()){setMessage({kind:'error',text:'Enter your email first.'});return}
  setBusy(true); setMessage(null)
  const {error}=await supabase!.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:window.location.origin}})
  setMessage(error?{kind:'error',text:'Couldn’t send a link to that email.'}:{kind:'info',text:'Check your email for a sign-in link.'})
  setBusy(false)
 }

 return <Centered>
  <div className="signin-photowrap"><img className="signin-photo" src="/photos/theater-front.jpg" alt="The Kentucky Opry theater in Benton"/>
   <StarLights size={54} count={18} className="signin-star"/></div>
  <div className="brand signin-brand"><img className="brandlogo" src="/brand/kentucky-opry-blue-gold.png" alt="Kentucky Opry Theater"/><div className="brandsub"><strong>OPRY OPS</strong><small>The office behind the stage · Benton, Kentucky</small></div></div>
  <form className="signin" onSubmit={withPassword}>
   <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button className="primary" type="submit" disabled={busy||!password}>Sign in</button>
   <button className="linkish" type="button" disabled={busy} onClick={withLink}>Email me a sign-in link instead</button>
   {message&&<p className={'msg '+message.kind} role="status">{message.text}</p>}
  </form>
 </Centered>
}

function Centered({children}:{children:React.ReactNode}){return <div className="centered"><div className="centered-card">{children}</div></div>}
