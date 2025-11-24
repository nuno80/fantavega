#!/usr/bin/env node
// Script per monitorare l'uso di memoria del server Socket.IO

const formatBytes = (bytes) => {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
};

const logMemoryUsage = () => {
  const usage = process.memoryUsage();

  console.log('\n=== Memory Usage ===');
  console.log(`RSS (Resident Set Size):     ${formatBytes(usage.rss)}`);
  console.log(`Heap Total:                  ${formatBytes(usage.heapTotal)}`);
  console.log(`Heap Used:                   ${formatBytes(usage.heapUsed)}`);
  console.log(`External:                    ${formatBytes(usage.external)}`);
  console.log(`Array Buffers:               ${formatBytes(usage.arrayBuffers)}`);
  console.log('===================\n');
};

// Log iniziale
console.log('🔍 Monitoring Socket.IO server memory usage...');
logMemoryUsage();

// Log ogni 10 secondi
setInterval(logMemoryUsage, 10000);

// Importa e avvia il server Socket.IO
import('./socket-server.ts').catch(err => {
  console.error('Failed to start socket server:', err);
  process.exit(1);
});
