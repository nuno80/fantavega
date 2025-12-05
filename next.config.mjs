// next.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    reactCompiler: true,
  },
  allowedDevOrigins: [
    'local-origin.dev',
    '*.local-origin.dev',
    '3000-idx-nuno-nextjs-starter-1742725615135.cluster-rz2e7e5f5ff7owzufqhsecxujc.cloudworkstations.dev',
  ],
  webpack: (config, { isServer }) => {
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
      // L'alias specifico 'better-sqlite3': 'better-sqlite3' non è solitamente necessario qui
      // se l'obiettivo è solo usare il pacchetto da node_modules.
      // La parte 'externals' è quella che gestisce come better-sqlite3 viene pacchettizzato (o non pacchettizzato) per il server.
    }

    return config;
  },
};

export default nextConfig;
