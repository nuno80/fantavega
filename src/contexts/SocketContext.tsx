"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Socket, io } from "socket.io-client";

interface SocketContextType { socket: Socket | null; isConnected: boolean; }
const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });
export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { userId, getToken } = useAuth();

  useEffect(() => {
    let disposed = false;
    let activeSocket: Socket | null = null;
    if (!userId) { setSocket(null); setIsConnected(false); return; }

    void (async () => {
      const token = await getToken();
      if (disposed || !token) return;
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
      const newSocket = io(socketUrl, { transports: ["websocket", "polling"], auth: { token } });
      activeSocket = newSocket;
      setSocket(newSocket);
      const onConnect = () => { setIsConnected(true); newSocket.emit("join-user-room"); };
      const onDisconnect = () => setIsConnected(false);
      newSocket.on("connect", onConnect);
      newSocket.on("disconnect", onDisconnect);
      newSocket.on("connect_error", onDisconnect);
      newSocket.on("connect", () => { void getToken().then((freshToken) => { if (freshToken) newSocket.auth = { token: freshToken }; }); });
    })();

    return () => { disposed = true; activeSocket?.disconnect(); setSocket(null); setIsConnected(false); };
  }, [userId, getToken]);

  return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
};
