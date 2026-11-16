import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Seção 11: aplicativo instalável; as telas ficam guardadas no aparelho e abrem sem servidor.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Apontamento de Produção',
        short_name: 'Apontamento',
        description: 'Apontamento de produção para tablet e PC, com trabalho sem conexão.',
        lang: 'pt-BR',
        start_url: '/apontamento',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#1c5d99',
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icone.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        // A API nunca vai para o cache do navegador: dados offline ficam no banco local (IndexedDB).
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': { target: process.env.VITE_PROXY_API ?? 'http://localhost:3000', changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: process.env.VITE_PROXY_API ?? 'http://localhost:3000', changeOrigin: true } },
  },
});
