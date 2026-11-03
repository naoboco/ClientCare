import { StrictMode, useEffect, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Olimline from './Olimline.tsx'

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function Website() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash)
  const isOlimline = hash === '#/olimline' || hash.startsWith('#/olimline/')

  useEffect(() => {
    document.title = isOlimline ? 'Olimline — Les liens qui comptent' : 'Watchover — Your business. Your way.'
    document.documentElement.lang = isOlimline ? 'fr' : 'en'

    if (isOlimline) {
      const section = hash.split('/')[2]
      const target = section ? document.getElementById(`ol-${section}`) : null
      if (target) target.scrollIntoView({ block: 'start' })
      else window.scrollTo(0, 0)
    } else if (hash === '#top' || hash === '') {
      window.scrollTo(0, 0)
    }
  }, [hash, isOlimline])

  return isOlimline ? <Olimline /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Website />
  </StrictMode>,
)
