**Guida Introduttiva a Drizzle ORM con SQLite (Utilizzando `better-sqlite3`)**

Questa guida illustra come configurare un progetto Drizzle ORM con SQLite, utilizzando la libreria `better-sqlite3`. Presuppone familiarità con `dotenv` e con l'esecuzione di script TypeScript (con `tsx` o `bun`).

**Struttura del Progetto e Creazione File:**

```bash
mkdir -p src/db
mkdir -p drizzle
touch src/db/schema.ts src/index.ts .env drizzle.config.ts tsconfig.json package.json
```
```
📦 <project root>
 ├ 📂 drizzle
 ├ 📂 src
 │   ├ 📂 db
 │   │  └ 📜 schema.ts
 │   └ 📜 index.ts
 ├ 📜 .env
 ├ 📜 drizzle.config.ts
 ├ 📜 package.json
 └ 📜 tsconfig.json
```

**Passaggi:**

1.  **Installazione Pacchetti:**

    ```bash
    bun add drizzle-orm better-sqlite3
    bun add -D drizzle-kit @types/better-sqlite3
    ```

2.  **Configurazione Variabili d'Ambiente (`.env`):**

    ```
    DATABASE_URL=sqlite.db
    ```

3.  **Connessione al Database (`src/index.ts`):**

    ```typescript
    import 'dotenv/config';
    import { drizzle } from 'drizzle-orm/better-sqlite3';
    import Database from 'better-sqlite3';

    // Inizializzazione con istanza Database (consigliato):
    const sqlite = new Database('sqlite.db'); // o il nome del tuo file
    const db = drizzle(sqlite);

    export { db };
    ```

4.  **Definizione dello Schema (`src/db/schema.ts`):**

    ```typescript
    import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

    export const usersTable = sqliteTable("users_table", {
      id: int("id").primaryKey({ autoIncrement: true }),
      name: text("name").notNull(),
      age: int("age").notNull(),
      email: text("email").notNull().unique(),
    });
    ```

5.  **Configurazione Drizzle Kit (`drizzle.config.ts`):**

    ```typescript
    import 'dotenv/config';
    import { defineConfig } from 'drizzle-kit';

    export default defineConfig({
      out: './drizzle',
      schema: './src/db/schema.ts',
      dialect: 'sqlite',
      dbCredentials: {
          url: process.env.DATABASE_URL!,
      },
    });
    ```

6.  **Applicazione delle Modifiche allo Schema:**

    *   Sviluppo (push): `npx drizzle-kit push`
    *   Migrazioni (generate + migrate): `npx drizzle-kit generate`, poi `npx drizzle-kit migrate`

7.  **Esempio di Query (`src/index.ts`):**

    ```typescript
    // ... (codice precedente da src/index.ts: import, connessione) ...
    import { eq } from 'drizzle-orm';

    async function main() {
        const user: typeof usersTable.$inferInsert = {
            name: 'John',
            age: 30,
            email: 'john@example.com',
        };
        try {
            await db.insert(usersTable).values(user);
            console.log('New user created!');

            const users = await db.select().from(usersTable);
            console.log('Getting all users: ', users);

            await db
                .update(usersTable)
                .set({ age: 31 })
                .where(eq(usersTable.email, user.email));
            console.log('User updated!');

            await db.delete(usersTable).where(eq(usersTable.email, user.email));
            console.log('User deleted!');

        } catch (error) {
            console.error("Errore:", error);
        }
    }
    main();

    ```

8.  **Esecuzione dello Script:**

    ```bash
    bun tsx src/index.ts
    ```
    oppure
    ```
    bun src/index.ts
    ```


