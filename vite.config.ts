import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/konkour-planner/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'planex-icon.png', 'planex-wordmark.png', 'planex-wordmark-dark.png'],
      manifest: {
        name: 'Planex — برنامه‌ریز مطالعه',
        short_name: 'Planex',
        description: 'برنامه‌ریز مطالعه، گزارش کار، آزمون‌ها و برنامه‌ی آزمون‌های کنکور',
        theme_color: '#2f5a83',
        background_color: '#efe6cf',
        display: 'standalone',
        orientation: 'portrait-primary',
        dir: 'rtl',
        lang: 'fa',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
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


