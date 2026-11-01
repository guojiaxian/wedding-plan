import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 本项目专用端口，避免与同机其他 Node/Web 应用冲突：
//   生产后端 19002（与 server/index.js 默认一致，可用 API_TARGET 覆盖）
//   开发前端 8301（strictPort：被占用时报错而不是悄悄换端口）
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 8301,
    strictPort: true,
    proxy: {
      '/api': process.env.API_TARGET || 'http://localhost:19002'
    }
  }
})
