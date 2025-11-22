import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import './styles.css'

const app = createApp(App)
app.use(createPinia())

document.documentElement.classList.add('dark')
document.body.classList.add('bg-background', 'text-foreground')

declare global {
  interface Window {
    aquarius: { version: string }
  }
}

window.aquarius = { version: '0.1.0' }

app.mount('#app')
