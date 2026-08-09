import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  ;(async () => {
    try {
      await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      const registration = await navigator.serviceWorker.ready
      registration.active?.postMessage({ type: 'WARM_FFMPEG_CORE' })
    } catch (error) {
      console.warn('Offline cache registration failed:', error)
    }
  })()
}
