// next.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import bundleAnalyzer from '@next/bundle-analyzer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    // Ottimizzazioni per import di pacchetti
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-popover',
      'sonner',
      'react-window',
      'swr',
    ],
  },
  allowedDevOrigins: [
    'local-origin.dev',
    '*.local-origin.dev',
    '3000-idx-nuno-nextjs-starter-1742725615135.cluster-rz2e7e5f5ff7owzufqhsecxujc.cloudworkstations.dev',
  ],
  webpack: (config, { isServer, dev }) => {
    // Imposta gli alias una volta, applicabile sia al client che al server
    config.resolve.alias = {
      ...config.resolve.alias, // Mantiene qualsiasi alias preesistente (importante!)
      '@': path.resolve(__dirname, 'src'), // Definisce che '@/' punta a 'src/'
    };

    // Configurazioni specifiche per il server (come externals per better-sqlite3)
    if (isServer) {
      config.externals = [
        ...(config.externals || []), // Mantiene qualsiasi externals preesistente
        {
          'better-sqlite3': 'commonjs better-sqlite3',
        }
      ];
    }

    // Ottimizzazioni per il bundle (solo in produzione e lato client)
    if (!dev && !isServer) {
      // Tree shaking più aggressivo
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      
      // Splitting dei chunks più intelligente
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // Vendor chunk per librerie esterne
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
            reuseExistingChunk: true,
          },
          // Chunk separato per componenti UI
          ui: {
            test: /[\\/]src[\\/]components[\\/]ui[\\/]/,
            name: 'ui-components',
            chunks: 'all',
            priority: 20,
            reuseExistingChunk: true,
          },
          // Chunk separato per componenti auction
          auction: {
            test: /[\\/]src[\\/]components[\\/]auction[\\/]/,
            name: 'auction-components',
            chunks: 'all',
            priority: 15,
            reuseExistingChunk: true,
          },
          // Chunk separato per hook e utilities
          utils: {
            test: /[\\/]src[\\/](hooks|lib)[\\/]/,
            name: 'utils',
            chunks: 'all',
            priority: 12,
            reuseExistingChunk: true,
          },
        },
      };
    }

    return config;
  },

  // Ottimizzazioni per le immagini
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 giorni
  },

  // Compressione
  compress: true,

  // Headers per caching ottimale
  async headers() {
    return [
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];
  },

  // Ottimizzazioni output
  output: 'standalone',
  
  // Configurazione per ridurre il bundle size
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{member}}',
    },
  },
};

// Configurazione bundle analyzer
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer(nextConfig);