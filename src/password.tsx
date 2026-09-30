import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import { DetailPopup } from './popup'

// Set (or change) a password so you can sign in with email + password instead of waiting for a sign-in link.
export function SetPassword({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState(''); const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const tooShort = pw.length > 0 && pw.length < 8, mismatch = again.length > 0 && again !== pw
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!supabase || pw.length < 8 || pw !== again) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: /reauth|recent/i.test(error.message)
      ? 'For safety, sign out, sign back in with an email link, then set your password right away.'
      : `Couldn’t save the password: ${error.message}` })
    else { setMsg({ kind: 'info', text: 'Saved. Next time, sign in with your email and this password.' }); setPw(''); setAgain('') }
  }
  return <DetailPopup title="Set a password" kicker="YOUR SIGN-IN" onClose={onClose}>
    <form className="signin setpw" onSubmit={save}>
      <p className="note">Then you can sign in with your email and password. The email link still works if you forget it.</p>
      <label>New password<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required/></label>
      {tooShort && <small className="msg error">At least 8 characters.</small>}
      <label>Type it again<input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} required/></label>
      {mismatch && <small className="msg error">These don’t match yet.</small>}
      <button className="primary" type="submit" disabled={busy || pw.length < 8 || pw !== again}>{busy ? 'Saving…' : 'Save password'}</button>
      {msg && <p className={'msg ' + msg.kind} role="status">{msg.text}</p>}
    </form>
  </DetailPopup>
}
