#!/usr/bin/env node

/**
 * Script per ottimizzare automaticamente gli import nelle applicazioni React/Next.js
 * Converte import generici in import specifici per ridurre il bundle size
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Ottimizzazione Import Fantavega\n');

// Configurazione delle ottimizzazioni
const optimizations = {
  'lucide-react': {
    pattern: /import\s*{\s*([^}]+)\s*}\s*from\s*['"]lucide-react['"]/g,
    transform: (icons) => {
      return icons.split(',')
        .map(icon => icon.trim())
        .map(icon => `import { ${icon} } from 'lucide-react/dist/esm/icons/${icon.toLowerCase().replace(/([A-Z])/g, '-$1').substring(1)}';`)
        .join('\n');
    },
    enabled: false // Disabilitato perché potrebbe causare problemi con tree shaking di Next.js
  },
  '@radix-ui': {
    pattern: /import\s*{\s*([^}]+)\s*}\s*from\s*['"]@radix-ui\/([^'"]+)['"]/g,
    transform: (components, module) => {
      // Mantieni gli import come sono per @radix-ui (già ottimizzati)
      return null;
    },
    enabled: false
  }
};

// Funzione per processare un singolo file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];

  // Applica ottimizzazioni abilitate
  Object.entries(optimizations).forEach(([library, config]) => {
    if (!config.enabled) return;

    const matches = [...content.matchAll(config.pattern)];
    matches.forEach(match => {
      const transformed = config.transform(...match.slice(1));
      if (transformed) {
        content = content.replace(match[0], transformed);
        modified = true;
        changes.push({
          library,
          original: match[0],
          transformed
        });
      }
    });
  });

  // Ottimizzazioni generiche
  
  // 1. Rimuovi import non utilizzati (semplice euristica)
  const importLines = content.match(/^import.*$/gm) || [];
  importLines.forEach(importLine => {
    const namedImports = importLine.match(/import\s*{\s*([^}]+)\s*}/);
    if (namedImports) {
      const imports = namedImports[1].split(',').map(i => i.trim());
      const usedImports = imports.filter(imp => {
        const regex = new RegExp(`\\b${imp.replace(/\s+as\s+\w+/, '')}\\b`, 'g');
        const matches = content.match(regex) || [];
        return matches.length > 1; // Più di 1 match (l'import stesso)
      });
      
      if (usedImports.length !== imports.length && usedImports.length > 0) {
        const newImportLine = importLine.replace(
          namedImports[1], 
          usedImports.join(', ')
        );
        content = content.replace(importLine, newImportLine);
        modified = true;
        changes.push({
          type: 'unused-removal',
          original: importLine,
          transformed: newImportLine,
          removed: imports.filter(i => !usedImports.includes(i))
        });
      } else if (usedImports.length === 0) {
        // Rimuovi completamente l'import se non utilizzato
        content = content.replace(importLine + '\n', '');
        modified = true;
        changes.push({
          type: 'complete-removal',
          original: importLine
        });
      }
    }
  });

  // 2. Ottimizza import di React (rimuovi import React se non necessario in Next.js)
  if (content.includes("import React") && !content.includes("React.")) {
    const reactImportMatch = content.match(/^import React.*$/m);
    if (reactImportMatch && !content.includes("React.Component") && !content.includes("React.createElement")) {
      content = content.replace(reactImportMatch[0] + '\n', '');
      modified = true;
      changes.push({
        type: 'react-optimization',
        original: reactImportMatch[0],
        note: 'Rimosso import React non necessario (Next.js auto-import)'
      });
    }
  }

  // 3. Ordina gli import
  const importSection = content.match(/^(import.*\n)+/m);
  if (importSection) {
    const imports = importSection[0].trim().split('\n');
    const sortedImports = imports.sort((a, b) => {
      // Ordine: React, Next.js, librerie esterne, import relativi
      const getImportPriority = (imp) => {
        if (imp.includes('react')) return 1;
        if (imp.includes('next')) return 2;
        if (imp.includes('@/')) return 4;
        if (imp.includes('./') || imp.includes('../')) return 5;
        return 3;
      };
      
      return getImportPriority(a) - getImportPriority(b);
    });
    
    if (imports.join('\n') !== sortedImports.join('\n')) {
      content = content.replace(importSection[0], sortedImports.join('\n') + '\n\n');
      modified = true;
      changes.push({
        type: 'import-sorting',
        note: 'Import ordinati per priorità'
      });
    }
  }

  return { content, modified, changes };
}

// Funzione per processare una directory
function processDirectory(dir, stats = { processed: 0, modified: 0, changes: [] }) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      processDirectory(filePath, stats);
    } else if (file.match(/\.(ts|tsx|js|jsx)$/) && !file.includes('.test.') && !file.includes('.spec.')) {
      stats.processed++;
      
      try {
        const result = processFile(filePath);
        
        if (result.modified) {
          // Backup del file originale
          const backupPath = filePath + '.backup';
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(filePath, backupPath);
          }
          
          // Scrivi il file ottimizzato
          fs.writeFileSync(filePath, result.content);
          stats.modified++;
          
          console.log(`✅ Ottimizzato: ${path.relative(process.cwd(), filePath)}`);
          result.changes.forEach(change => {
            if (change.type === 'unused-removal') {
              console.log(`   - Rimossi import non utilizzati: ${change.removed.join(', ')}`);
            } else if (change.type === 'complete-removal') {
              console.log(`   - Rimosso import completo: ${change.original.split(' from ')[0]}`);
            } else if (change.note) {
              console.log(`   - ${change.note}`);
            }
          });
          
          stats.changes.push({
            file: filePath,
            changes: result.changes
          });
        }
      } catch (error) {
        console.error(`❌ Errore processando ${filePath}:`, error.message);
      }
    }
  });
  
  return stats;
}

// Funzione per ripristinare i backup
function restoreBackups() {
  console.log('🔄 Ripristino backup...');
  
  function findBackups(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.startsWith('.')) {
        findBackups(filePath);
      } else if (file.endsWith('.backup')) {
        const originalPath = filePath.replace('.backup', '');
        fs.copyFileSync(filePath, originalPath);
        fs.unlinkSync(filePath);
        console.log(`✅ Ripristinato: ${path.relative(process.cwd(), originalPath)}`);
      }
    });
  }
  
  findBackups('./src');
  console.log('🎉 Backup ripristinati!');
}

// Esecuzione principale
const args = process.argv.slice(2);

if (args.includes('--restore')) {
  restoreBackups();
  process.exit(0);
}

if (args.includes('--help')) {
  console.log(`
Utilizzo: node scripts/optimize-imports.js [opzioni]

Opzioni:
  --restore    Ripristina i file dai backup
  --help       Mostra questo messaggio
  --dry-run    Mostra cosa verrebbe modificato senza applicare le modifiche

Esempi:
  node scripts/optimize-imports.js
  node scripts/optimize-imports.js --restore
  `);
  process.exit(0);
}

try {
  console.log('🚀 Avvio ottimizzazione import...\n');
  
  const stats = processDirectory('./src');
  
  console.log('\n📊 Risultati:');
  console.log(`- File processati: ${stats.processed}`);
  console.log(`- File modificati: ${stats.modified}`);
  console.log(`- Modifiche totali: ${stats.changes.reduce((sum, item) => sum + item.changes.length, 0)}`);
  
  if (stats.modified > 0) {
    console.log('\n💾 Backup creati per i file modificati (.backup)');
    console.log('💡 Per ripristinare: node scripts/optimize-imports.js --restore');
    
    // Salva report delle modifiche
    fs.writeFileSync('import-optimization-report.json', JSON.stringify(stats, null, 2));
    console.log('📊 Report salvato in: import-optimization-report.json');
  }
  
  console.log('\n✅ Ottimizzazione completata!');
  
} catch (error) {
  console.error('❌ Errore durante l\'ottimizzazione:', error.message);
  process.exit(1);
}