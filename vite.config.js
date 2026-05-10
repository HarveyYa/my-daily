import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',
    server: {
        proxy: {
            '/richcalendar': {
                target: 'https://cn.bing.com',
                changeOrigin: true
            }
        }
    }
})
