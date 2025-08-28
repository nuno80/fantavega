// src/components/debug/SocketDebugger.tsx
"use client";

import { useEffect, useState } from "react";

import { useSocket } from "@/contexts/SocketContext";

interface SocketEvent {
  timestamp: Date;
  event: string;
  data: any;
}

export function SocketDebugger({ leagueId }: { leagueId: number }) {
  const { socket, isConnected } = useSocket();
  const [events, setEvents] = useState<SocketEvent[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Don't join room - just listen to events that are already being received
    // Room joining is handled by main components
    
    const eventTypes = [
      "auction-update",
      "auction-created", 
      "auction-closed-notification",
      "bid-surpassed-notification",
      "auto-bid-activated-notification"
    ];

    const handleEvent = (eventType: string) => (data: any) => {
      const now = new Date();
      const eventData = {
        timestamp: now,
        event: eventType,
        data
      };
      
      // Check for duplicates in recent events
      const isDuplicate = events.some(event => 
        event.event === eventType &&
        JSON.stringify(event.data) === JSON.stringify(data) &&
        (now.getTime() - event.timestamp.getTime()) < 5000 // Within 5 seconds
      );
      
      console.log(`[SOCKET DEBUG] ${eventType}${isDuplicate ? ' (DUPLICATE)' : ''}:`, data);
      
      setEvents(prev => [eventData, ...prev.slice(0, 19)]); // Keep last 20 events
    };

    // Register listeners for all event types
    eventTypes.forEach(eventType => {
      socket.on(eventType, handleEvent(eventType));
    });

    return () => {
      eventTypes.forEach(eventType => {
        socket.off(eventType, handleEvent(eventType));
      });
    };
  }, [socket, isConnected, leagueId]);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-blue-600 text-white px-3 py-2 rounded text-sm z-50"
      >
        Socket Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border shadow-lg rounded-lg p-4 max-w-md max-h-96 overflow-y-auto z-50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold">Socket Events</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>
      
      <div className="mb-2 text-sm">
        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events yet...</p>
      ) : (
        <div className="space-y-2">
          {events.map((event, index) => (
            <div key={index} className="border-b pb-2 last:border-b-0">
              <div className="text-xs text-gray-500">
                {event.timestamp.toLocaleTimeString('en-GB', { 
                  hour12: false, 
                  timeZone: 'Europe/Rome'
                })}.{event.timestamp.getMilliseconds().toString().padStart(3, '0')} 
                <span className="text-gray-400">(UTC: {event.timestamp.toISOString().split('T')[1].split('.')[0]})</span>
              </div>
              <div className="font-mono text-xs">
                <span className={`${event.event === 'auction-created' ? 'text-green-600 font-bold' : 'text-blue-600'}`}>
                  {event.event}
                </span>
                {/* Check for duplicates in visible events */}
                {(() => {
                  const duplicateCount = events.slice(0, index).filter(e => 
                    e.event === event.event &&
                    JSON.stringify(e.data) === JSON.stringify(event.data)
                  ).length;
                  return duplicateCount > 0 ? (
                    <span className="text-red-600 font-bold ml-2">(DUPLICATE #{duplicateCount + 1})</span>
                  ) : null;
                })()}
                {event.data && Object.keys(event.data).length > 0 && (
                  <pre className="text-gray-600 mt-1 whitespace-pre-wrap">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}