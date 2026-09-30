import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { NeonStar } from './neon'

// Mail as mail: each email is a small envelope — back flap, a stamp with the Opry star, a postmark that says how
// urgent it is (word + color), a red "new" wax seal on unread mail, and the next step written on the front.
const POSTMARK: Record<string, [string, string]> = {
  URGENT: ['Urgent', 'urgent'], TODAY: ['Reply today', 'today'], THIS_WEEK: ['This week', 'week'], FYI: ['Just so you know', 'fyi'],
}

export function Envelope({ subject, from, when, urgency, reason, next, show, unread, href, children }: {
  subject: string | null; from: string | null; when?: string | null; urgency?: string | null; reason?: string | null; next?: string | null
  show?: string | null; unread?: boolean | null; href?: string | null; children?: ReactNode
}) {
  const [label, tone] = POSTMARK[urgency ?? ''] ?? ['Mail', 'fyi']
  const face = <>
    <span className="env-flap" aria-hidden="true"/>
    {unread && <span className="env-seal" title="New — not opened yet">New</span>}
    <span className="env-stamp" aria-hidden="true"><NeonStar size={22} lit={false}/></span>
    <span className={'env-postmark ' + tone}><b>{label}</b>{when && <small>{when}</small>}</span>
    <span className="env-from">From <b>{from ?? 'unknown sender'}</b></span>
    <strong className="env-subject">{subject || '(no subject)'}</strong>
    {show && <small className="env-show">About: {show}</small>}
    {reason && <small className="env-reason">{reason}</small>}
    {next && <span className="env-next">Next: {next}</span>}
  </>
  if (children) return <article className={'envelope ' + tone}>{face}<div className="env-actions">{children}</div></article>
  return <a className={'envelope mailrow ' + tone} href={href ?? undefined} target="_blank" rel="noreferrer"
    aria-label={`${label}: ${subject ?? 'no subject'} from ${from ?? 'unknown'}. Opens in Gmail.`}>
    {face}<span className="env-open">Open in Gmail <ExternalLink size={14}/></span></a>
}
