import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { applyTheme, currentTheme } from './theme'
import './styles/main.css'

applyTheme(currentTheme()) // 挂载前应用主题，避免闪色

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
