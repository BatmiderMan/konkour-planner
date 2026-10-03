import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/konkour-planner/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        name: 'برنامه‌ریز مطالعه روزانه کنکور',
        short_name: 'برنامه‌ریز کنکور',
        description: 'دفتر برنامه‌ریزی، گزارش کار و محاسبه درصد تست کنکور',
        theme_color: '#3e6690',
        background_color: '#efe6cf',
        display: 'standalone',
        orientation: 'portrait-primary',
        dir: 'rtl',
        lang: 'fa',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}']
      }
    })
  ],
  server: {
    port: 3000,
    open: true
  }
});


