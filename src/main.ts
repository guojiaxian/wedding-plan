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
// 等首次路由守卫（登录态检查）完成后再挂载，避免未登录时闪现应用框架
router.isReady().then(() => app.mount('#app'))
