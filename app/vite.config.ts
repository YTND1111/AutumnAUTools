import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    // 本地开发：把 /api 转发到用户后端（backend/ 目录下的 wrangler dev，默认 127.0.0.1:8787），
    // 这样前端始终以同源 /api 访问，无需配置 VITE_BACKEND_BASE_URL，也不涉及跨域。
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
