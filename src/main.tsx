import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './Auth'
import { initTextSize } from './chrome'
import { PublicList } from './publiclist'
import './styles.css'
import './opry-theme.css'
import './facelift.css'
import './props.css'
import './rooms.css'
import './backstage.css'
// The Opry Ops type set (Google Fonts, bundled so it always loads)
import '@fontsource/alfa-slab-one/latin-400.css'
import '@fontsource-variable/bitter/index.css'
import '@fontsource-variable/bitter/wght-italic.css'
import '@fontsource-variable/atkinson-hyperlegible-next/index.css'
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css'

initTextSize()
// /list/<token> is the Walmart checklist the day-of-show lead opens on her phone — no sign-in, one list only.
const listToken = window.location.pathname.match(/^\/list\/([0-9a-f]{32})$/)?.[1]
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{listToken ? <PublicList token={listToken}/> : <App/>}</React.StrictMode>)
