# Guida Completa a Gemini CLI

Questa guida fornisce una panoramica completa e strutturata per installare, configurare e utilizzare Gemini CLI, includendo le sue funzionalità più potenti come le **Estensioni** e i **Server MCP (Model Context Protocol)**.

- **Parte 1: Installazione e Configurazione di Base**: Impara a installare la CLI, autenticarti e configurare le impostazioni essenziali tramite variabili d'ambiente e `settings.json`.
- **Parte 2: Comandi Essenziali**: Una panoramica dei comandi più utili per interagire con la CLI.
- **Parte 3: Gestione delle Estensioni**: Impara a creare e gestire estensioni per separare contesti di lavoro (es. frontend, backend).
- **Parte 4: Configurazione dei Server MCP**: Scopri come collegare Gemini a server locali o remoti per estendere le sue funzionalità con strumenti personalizzati.
- **Parte 5: Sviluppo e Contribuzione**: Comandi e pratiche per chi vuole contribuire al progetto.

---

## Parte 1: Installazione e Configurazione di Base

### Installazione

Per iniziare, assicurati di avere **Node.js 18+** installato. Puoi eseguire Gemini CLI in due modi:

1.  **Esecuzione Diretta (Senza Installazione)**:

    ```bash
    npx https://github.com/google-gemini/gemini-cli
    ```

2.  **Installazione Globale**:
    ```bash
    npm install -g @google/gemini-cli
    ```

### Autenticazione

Per un uso avanzato e limiti di richieste più alti, è necessaria una chiave API o l'autenticazione OAuth.

1.  **OAuth (Consigliato)**: Esegui `/auth` per avviare il flusso di autenticazione OAuth.
2.  **Chiave API**:
    - Genera una chiave API da **Google AI Studio**.
    - Imposta la chiave come variabile d'ambiente:
    ```bash
    export GEMINI_API_KEY="LA_TUA_CHIAVE_API"
    ```
    Per renderla permanente, aggiungi questa linea al tuo file di profilo della shell (es. `~/.bashrc`, `~/.zshrc`).

### Configurazione Principale

La configurazione avviene tramite variabili d'ambiente o file `settings.json`.

#### Variabili d'Ambiente Principali

| Variabile              | Descrizione                                                 | Esempio                                     |
| :--------------------- | :---------------------------------------------------------- | :------------------------------------------ |
| `GEMINI_API_KEY`       | La tua chiave API per l'API Gemini.                         | `export GEMINI_API_KEY="YOUR_API_KEY"`      |
| `GEMINI_MODEL`         | Specifica il modello Gemini predefinito da usare.           | `export GEMINI_MODEL="gemini-1.5-flash"`    |
| `GOOGLE_CLOUD_PROJECT` | ID del tuo progetto Google Cloud, necessario per Vertex AI. | `export GOOGLE_CLOUD_PROJECT="your-gcp-id"` |
| `GEMINI_SANDBOX`       | Abilita la sandbox per l'esecuzione di comandi.             | `export GEMINI_SANDBOX=docker`              |
| `NO_COLOR`             | Disabilita l'output colorato nella CLI.                     | `export NO_COLOR=1`                         |

#### File `settings.json`

Puoi definire configurazioni a livello di progetto o globali.

- **Workspace (Progetto-Specifico)**: `<project-root>/.gemini/settings.json`
- **Home (Globale, Consigliato per impostazioni personali)**: `~/.gemini/settings.json`

_Le configurazioni nel workspace sovrascrivono sempre quelle nella home._

**Esempio di `settings.json` (consigliato):**

Questo esempio mostra una configurazione completa che puoi usare come punto di partenza nel tuo file `~/.gemini/settings.json`.

```json


  {
  "theme": "Dracula",
  "selectedAuthType": "oauth-personal",
  "checkpointing": {
    "enabled": true
  },
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "taskmaster-ai": {
      "command": "npx",
      "args": ["-y", "--package=task-master-ai", "task-master-ai"],
      "env": {
        "ANTHROPIC_API_KEY": "YOUR_ANTHROPIC_API_KEY_HERE",
        "PERPLEXITY_API_KEY": "YOUR_PERPLEXITY_API_KEY_HERE",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY_HERE",
        "GOOGLE_API_KEY": "AIzaSyCjqqjx0FSqZLTHhnJ1uKm4ZveycVGoecU",
        "MISTRAL_API_KEY": "YOUR_MISTRAL_KEY_HERE",
        "OPENROUTER_API_KEY": "YOUR_OPENROUTER_KEY_HERE",
        "XAI_API_KEY": "YOUR_XAI_KEY_HERE",
        "AZURE_OPENAI_API_KEY": "YOUR_AZURE_KEY_HERE"
      },
      "type": "stdio"
    }
  }
}

```

### Funzionalità di Checkpointing

L'opzione `checkpointing` è una potente funzionalità di sicurezza che, se abilitata, salva automaticamente lo stato dei file del tuo progetto _prima_ che uno strumento esegua una modifica.

```json
"checkpointing": {
  "enabled": true
}
```

**Come funziona?**

1.  **Abilitazione**: Impostando `"enabled": true` nel tuo `settings.json`.
2.  **Salvataggio Automatico**: Ogni volta che un tool tenta di modificare un file, Gemini CLI crea un "checkpoint" dello stato attuale.
3.  **Ripristino**: Se non sei soddisfatto delle modifiche, puoi usare il comando `/restore [tool_call_id]` per annullare l'operazione e riportare i file al loro stato precedente. Se eseguito senza un ID, `/restore` ti mostrerà una lista dei checkpoint disponibili.

Questa funzionalità è essenziale per sperimentare in sicurezza, sapendo di poter annullare facilmente qualsiasi modifica imprevista.

---

## Parte 2: Comandi Essenziali

| Comando         | Alias    | Descrizione                                                                 |
| :-------------- | :------- | :-------------------------------------------------------------------------- |
| `/help`         | `/?`     | Mostra la guida dei comandi.                                                |
| `/clear`        | `Ctrl+L` | Pulisce la schermata del terminale.                                         |
| `/bug <titolo>` |          | Apre una segnalazione di bug nel repository GitHub.                         |
| `/memory`       |          | Gestisce il contesto della memoria (`GEMINI.md`). `add`, `show`, `refresh`. |
| `/tools`        |          | Lista gli strumenti disponibili per il modello.                             |
| `/auth`         |          | Apre un dialogo per cambiare il metodo di autenticazione.                   |
| `/restore`      |          | Ripristina i file a un checkpoint precedente (richiede `checkpointing`).    |
| `! <comando>`   |          | Esegue un comando shell direttamente. `!ls -la`.                            |
| `@<file>`       |          | Include il contenuto di un file o di una directory nel prompt.              |

---

## Parte 3: Gestione delle Estensioni

### Introduzione alle Estensioni

Le estensioni permettono di definire contesti di lavoro specifici all'interno di un progetto. Sono ideali per gestire configurazioni separate, come in un monorepo con un frontend e un backend, mantenendo tutto versionato con Git.

### Struttura di un'Estensione

Ogni estensione risiede in una sua cartella dedicata in `.gemini/extensions/`.

```
.gemini/
└── extensions/
    └── nome-estensione/
        ├── gemini-extension.json  # File di configurazione (obbligatorio)
        └── GEMINI.md              # File di contesto (opzionale)
```

### File Obbligatorio: `gemini-extension.json`

```json
{
  "name": "nome-estensione",
  "version": "1.0.0",
  "contextFileName": "GEMINI.md"
}
```

- `name`: Deve corrispondere al nome della cartella.
- `version`: Versione semantica.
- `contextFileName`: Nome del file di contesto (default: `GEMINI.md`).

---

## Parte 4: Configurazione dei Server MCP

### Introduzione ai Server MCP

I Server MCP (Model Context Protocol) estendono le capacità di Gemini CLI fornendo strumenti (`tools`) aggiuntivi, sia locali che remoti.

### Configurazione in `settings.json`

Aggiungi la configurazione dei tuoi server in `settings.json`.

**Esempio di Server Remoto (Context7):**

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", " @upstash/context7-mcp"]
    }
  }
}
```

- `command`: Esegue un comando `npx` per avviare il server MCP di Context7.
- `args`: Gli argomenti `-y` e `@upstash/context7-mcp` vengono passati a `npx`.

### Verifica e Troubleshooting

Usa il comando `/mcp` per verificare lo stato dei server connessi. Se un server non si connette, prova a eseguire il comando manualmente e controlla i log.

---

## Parte 5: Sviluppo e Contribuzione

Se desideri contribuire allo sviluppo di Gemini CLI, ecco alcuni comandi utili.

1.  **Clona il Repository**:

    ```bash
    git clone https://github.com/google-gemini/gemini-cli.git
    cd gemini-cli
    ```

2.  **Installa le Dipendenze**:

    ```bash
    npm install
    ```

3.  **Esegui i Controlli di Qualità (Linting, Test, etc.)**:

    ```bash
    npm run preflight
    ```

4.  **Esegui i Test**:

    ```bash
    npm run test      # Unit test
    npm run test:e2e  # Test end-to-end
    ```

5.  **Avvia in Modalità Debug**:
    ```bash
    npm run debug
    ```

### Troubleshooting

- **Aggiornare la CLI**:
  ```bash
  npm install -g @google/gemini-cli@latest
  ```
- **Errori di Moduli non Trovati**:
  Assicurati di aver installato le dipendenze e compilato il progetto.
  ```bash
  npm install
  npm run build
  ```
