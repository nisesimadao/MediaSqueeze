import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installSmartMediaEngine } from './smartMediaEngine'
import { getLocale, setLocale } from './i18n'
import './styles.css'
import './customMode.css'

setLocale(getLocale())
installSmartMediaEngine()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  const warmOfflineRuntime = (worker) => {
    worker?.postMessage({ type: 'WARM_FFMPEG_CORE' })
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    warmOfflineRuntime(navigator.serviceWorker.controller)
  })

  ;(async () => {
    try {
      await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      const registration = await navigator.serviceWorker.ready
      warmOfflineRuntime(registration.active)
    } catch (error) {
      console.warn('Offline cache registration failed:', error)
    }
  })()
}
