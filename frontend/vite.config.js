import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate AWS Amplify into its own chunk
          amplify: ['aws-amplify', '@aws-amplify/ui-react'],
          // Separate React ecosystem
          react: ['react', 'react-dom', 'react-router-dom'],
          // Separate GraphQL
          graphql: ['graphql', 'graphql-tag']
        }
      }
    },
    // Increase chunk size warning limit to 1000kb
    chunkSizeWarningLimit: 1000
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'aws-amplify',
      '@aws-amplify/ui-react',
      'react',
      'react-dom',
      'react-router-dom',
      'graphql',
      'graphql-tag'
    ]
  }
});