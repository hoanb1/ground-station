import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env variables based on mode
  // This automatically loads .env, .env.local, and .env.[mode] files

  return {
    plugins: [react()],

    // Define custom environment variables
    define: {
      // Allow using GS_BACKEND_PORT directly without VITE_ prefix
      'import.meta.env.GS_BACKEND_PORT': JSON.stringify(process.env.GS_BACKEND_PORT || '5000'),
      'import.meta.env.GS_BACKEND_HOST': JSON.stringify(process.env.GS_BACKEND_HOST || 'localhost'),
    },

    // Server configuration for development
    server: {
      port: 5173,
      strictPort: true,
      host: true, // Listen on all addresses
    },

    // Build configuration
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode !== 'production', // Generate sourcemaps except in production

      // Optimize chunks
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            // Add more manual chunks as needed
          },
        },
      },
    },

    // Resolve configuration
    resolve: {
      alias: {
        '@': '/src', // Allow using @ as an alias for /src directory
      },
    },
  };
});