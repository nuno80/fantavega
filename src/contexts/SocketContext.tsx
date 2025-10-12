// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

"use client";

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { useAuth } from "@clerk/nextjs";
import { Socket, io } from "socket.io-client";

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// src/contexts/SocketContext.tsx v.1.0
// Definisce un React Context per gestire la connessione Socket.IO in tutta l'applicazione.

// 3. Definizione del tipo per il nostro Context
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

// 4. Creazione del Context con un valore di default
const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

// 5. Creazione di un hook personalizzato per usare facilmente il context
export const useSocket = () => {
  return useContext(SocketContext);
};

// 6. Definizione del Provider del Context
interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { userId } = useAuth(); // Recuperiamo l'ID utente da Clerk

  useEffect(() => {
    // Stabiliamo la connessione solo se abbiamo un userId
    if (!userId) {
      // Se l'utente fa logout, disconnettiamo il socket esistente
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Inizializziamo la connessione al nostro server socket
    // NOTA: In produzione, questo URL dovrebbe essere una variabile d'ambiente
    const newSocket = io("http://localhost:3001");

    // Salviamo l'istanza del socket nello stato
    setSocket(newSocket);

    // Gestori di eventi per lo stato della connessione
    const onConnect = () => {
      console.log("✅ Socket.IO: Connesso al server.");
      setIsConnected(true);
      // Appena connessi, ci uniamo alla nostra stanza personale per le notifiche dirette
      newSocket.emit("join-user-room", userId);
    };

    const onDisconnect = () => {
      console.log("❌ Socket.IO: Disconnesso dal server.");
      setIsConnected(false);
    };

    // Colleghiamo i gestori di eventi al socket
    newSocket.on("connect", onConnect);
    newSocket.on("disconnect", onDisconnect);

    // Funzione di pulizia che viene eseguita quando il componente si smonta
    // o quando l'userId cambia, per chiudere la connessione precedente.
    return () => {
      console.log("🔌 Socket.IO: Disconnessione in corso...");
      newSocket.off("connect", onConnect);
      newSocket.off("disconnect", onDisconnect);
      newSocket.disconnect();
    };
  }, [userId]); // L'effetto si riesegue se l'userId cambia (login/logout)

  const value = { socket, isConnected };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};
