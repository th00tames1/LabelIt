import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main/index.ts'),
      },
      // No sourcemaps in production — reduces bundle size, protects source
      sourcemap: isProd ? false : 'inline',
      minify: isProd,
    },
    resolve: {
      alias: {
        '@main': resolve('electron/main'),
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts'),
      },
      sourcemap: isProd ? false : 'inline',
      minify: isProd,
    },
  },

  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: resolve('src/index.html'),
        output: {
          // Deterministic chunk names for better caching
          manualChunks: {
            react: ['react', 'react-dom'],
            konva: ['konva', 'react-konva'],
            zustand: ['zustand', 'immer'],
          },
        },
      },
      sourcemap: isProd ? false : true,
      // Remove console.* in production builds (Electron DevTools logs)
      minify: isProd ? 'esbuild' : false,
      ...(isProd && {
        esbuildOptions: {
          drop: ['console', 'debugger'],
        },
      }),
    },
    resolve: {
      alias: {
        '@renderer': resolve('src'),
        '@': resolve('src'),
      },
    },
    plugins: [react()],
  },
})
