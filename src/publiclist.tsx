import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

// Opened from a text on the day-of-show lead's phone in the store — no sign-in. The link only reaches this one list.
type Item = { group: string | null; item: string }
type List = { title: string; items: Item[]; checked: Record<string, string>; shopper: string | null; event_date: string; show: string }

export function PublicList({ token }: { token: string }) {
  const [list, setList] = useState<List | null | undefined>(undefined)
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => { supabase!.rpc('shopping_list_by_token', { p_token: token }).then(({ data }) => setList((data as List) ?? null)) }, [token])
  const tick = async (i: number, done: boolean) => {
    setBusy(i)
    const { data } = await supabase!.rpc('shopping_list_tick', { p_token: token, p_index: i, p_done: done })
    if (data && list) setList({ ...list, checked: data as Record<string, string> })
    setBusy(null)
  }
  if (list === undefined) return <div className="plist"><p>Loading the list…</p></div>
  if (list === null) return <div className="plist"><h1>List not found</h1><p>Ask Rach for a new link.</p></div>
  const done = Object.keys(list.checked).length
  let lastGroup: string | null = null
  return <div className="plist">
    <img src="/brand/kentucky-opry-blue-gold.png" alt="Kentucky Opry Theater" className="plist-logo"/>
    <h1>{list.title}</h1>
    <p className="plist-sub">{list.show} · {new Date(list.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div className="plist-progress"><span style={{ width: `${list.items.length ? done / list.items.length * 100 : 0}%` }}/></div>
    <p className="plist-count">{done} of {list.items.length} in the cart</p>
    <ul>{list.items.map((it, i) => { const head = it.group && it.group !== lastGroup ? it.group : null; lastGroup = it.group
      const on = !!list.checked[String(i)]
      return <li key={i}>{head && <h2>{head}</h2>}
        <label className={on ? 'on' : ''}><input type="checkbox" checked={on} disabled={busy === i} onChange={e => tick(i, e.target.checked)}/> <span>{it.item}</span></label>
      </li> })}</ul>
    {done === list.items.length && list.items.length > 0 && <p className="plist-done">★ All done — thank you!</p>}
  </div>
}
