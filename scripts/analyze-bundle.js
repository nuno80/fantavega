#!/usr/bin/env node

/**
 * Script per analizzare il bundle e identificare ottimizzazioni
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Analisi Bundle Fantavega\n');

// Funzione per analizzare i file TypeScript/JavaScript
function analyzeImports(dir, results = { unusedImports: [], largeFiles: [], duplicateImports: {} }) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      analyzeImports(filePath, results);
    } else if (file.match(/\.(ts|tsx|js|jsx)$/)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileSize = stat.size;
      
      // Identifica file grandi (>50KB)
      if (fileSize > 50000) {
        results.largeFiles.push({
          path: filePath,
          size: Math.round(fileSize / 1024) + 'KB'
        });
      }
      
      // Analizza import
      const imports = content.match(/^import.*from.*$/gm) || [];
      imports.forEach(importLine => {
        const match = importLine.match(/from ['"](.+)['"]/);
        if (match) {
          const module = match[1];
          if (!results.duplicateImports[module]) {
            results.duplicateImports[module] = [];
          }
          results.duplicateImports[module].push(filePath);
        }
      });
      
      // Cerca import potenzialmente non utilizzati
      const unusedPatterns = [
        /import\s+\*\s+as\s+\w+\s+from/g, // import * as
        /import\s+{\s*[^}]{50,}\s*}/g,    // import con molti named imports
      ];
      
      unusedPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          matches.forEach(match => {
            results.unusedImports.push({
              file: filePath,
              import: match.trim()
            });
          });
        }
      });
    }
  });
  
  return results;
}

// Funzione per analizzare le dipendenze del package.json
function analyzeDependencies() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  console.log('📦 Analisi Dipendenze:');
  console.log(`- Totale dipendenze: ${Object.keys(dependencies).length}`);
  
  // Identifica dipendenze potenzialmente pesanti
  const heavyDeps = [
    '@radix-ui', 'lucide-react', 'socket.io', 'better-sqlite3', 
    'next', 'react', 'webpack-bundle-analyzer'
  ];
  
  const foundHeavyDeps = Object.keys(dependencies).filter(dep => 
    heavyDeps.some(heavy => dep.includes(heavy))
  );
  
  console.log(`- Dipendenze pesanti identificate: ${foundHeavyDeps.length}`);
  foundHeavyDeps.forEach(dep => console.log(`  • ${dep}: ${dependencies[dep]}`));
  console.log();
}

// Funzione per suggerire ottimizzazioni
function suggestOptimizations(results) {
  console.log('💡 Suggerimenti di Ottimizzazione:\n');
  
  // File grandi
  if (results.largeFiles.length > 0) {
    console.log('📄 File Grandi (>50KB):');
    results.largeFiles.forEach(file => {
      console.log(`  • ${file.path} (${file.size})`);
    });
    console.log('  → Considera di dividere questi file in componenti più piccoli\n');
  }
  
  // Import duplicati
  const duplicates = Object.entries(results.duplicateImports)
    .filter(([_, files]) => files.length > 3)
    .slice(0, 10);
    
  if (duplicates.length > 0) {
    console.log('🔄 Moduli Importati Frequentemente:');
    duplicates.forEach(([module, files]) => {
      console.log(`  • ${module} (${files.length} file)`);
    });
    console.log('  → Considera di creare barrel exports o hook condivisi\n');
  }
  
  // Import potenzialmente problematici
  if (results.unusedImports.length > 0) {
    console.log('⚠️  Import Potenzialmente Problematici:');
    results.unusedImports.slice(0, 5).forEach(item => {
      console.log(`  • ${path.relative(process.cwd(), item.file)}`);
      console.log(`    ${item.import}`);
    });
    console.log('  → Verifica se questi import sono necessari\n');
  }
}

// Funzione per generare report di ottimizzazione
function generateOptimizationReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      largeFiles: results.largeFiles.length,
      duplicateImports: Object.keys(results.duplicateImports).length,
      potentialIssues: results.unusedImports.length
    },
    details: results,
    recommendations: [
      'Implementare lazy loading per componenti grandi',
      'Utilizzare dynamic imports per route non critiche',
      'Ottimizzare import di librerie esterne (es. lucide-react)',
      'Considerare code splitting per componenti auction',
      'Verificare utilizzo effettivo di tutte le dipendenze'
    ]
  };
  
  fs.writeFileSync('bundle-analysis-report.json', JSON.stringify(report, null, 2));
  console.log('📊 Report salvato in: bundle-analysis-report.json\n');
}

// Esecuzione principale
try {
  console.log('🚀 Avvio analisi...\n');
  
  // Analizza dipendenze
  analyzeDependencies();
  
  // Analizza codice sorgente
  console.log('🔍 Analisi codice sorgente...');
  const results = analyzeImports('./src');
  
  // Mostra risultati
  suggestOptimizations(results);
  
  // Genera report
  generateOptimizationReport(results);
  
  console.log('✅ Analisi completata!');
  console.log('\n💡 Per analizzare il bundle webpack, esegui: pnpm run build:analyze');
  
} catch (error) {
  console.error('❌ Errore durante l\'analisi:', error.message);
  process.exit(1);
}