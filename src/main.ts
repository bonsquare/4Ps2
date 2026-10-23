import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './refresh.css'
import './auth-pages.css'
import './concerns.css'
import './reports.css'

createApp(App).mount('#app')

// Production only: the dev server must never be served from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
