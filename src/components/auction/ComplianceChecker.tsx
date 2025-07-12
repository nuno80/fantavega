"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ComplianceCheckerProps {
  leagueId: number;
  userId: string;
  onComplianceChecked?: () => void;
  // Dati locali per calcolo immediato
  managerPlayers?: Array<{ role: string }>;
  leagueSlots?: {
    slots_P: number;
    slots_D: number;
    slots_C: number;
    slots_A: number;
  };
  activeAuctions?: Array<{ player_role: string; current_highest_bidder_id: string | null }>;
}

interface ComplianceResult {
  appliedPenaltyAmount: number;
  isNowCompliant: boolean;
  message: string;
  gracePeriodEndTime?: number;
  timeRemainingSeconds?: number;
}

export function ComplianceChecker({
  leagueId,
  userId,
  onComplianceChecked,
  managerPlayers = [],
  leagueSlots,
  activeAuctions = [],
}: ComplianceCheckerProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<ComplianceResult | null>(null);
  const [currentTimeRemaining, setCurrentTimeRemaining] = useState<number | null>(null);
  const [warningsShown, setWarningsShown] = useState<Set<number>>(new Set());

  // Format time remaining for display - only minutes and seconds
  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return "00:00";
    
    const totalMinutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    // Format as MM:SS with leading zeros
    return `${totalMinutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Determina il colore del timer basato sul tempo rimanente
  const getTimerColor = (seconds: number) => {
    if (seconds <= 0) return { bg: 'bg-red-500', text: 'text-white' };
    if (seconds <= 300) return { bg: 'bg-red-500', text: 'text-white' }; // Sotto 5 minuti: rosso
    if (seconds <= 1800) return { bg: 'bg-yellow-500', text: 'text-black' }; // Sotto 30 minuti: giallo
    return { bg: 'bg-green-500', text: 'text-white' }; // Sopra 30 minuti: verde
  };

  // Calcola conformità locale per UI immediata (solo indicativa)
  const calculateLocalCompliance = () => {
    if (!leagueSlots || !managerPlayers) return { isCompliant: true, missingSlots: [] };
    
    const getRoleCount = (role: string) => {
      const assignedCount = managerPlayers.filter(p => p.role.toUpperCase() === role.toUpperCase()).length;
      const activeAuctionCount = activeAuctions.filter(a => 
        a.player_role.toUpperCase() === role.toUpperCase() && 
        a.current_highest_bidder_id === userId
      ).length;
      return assignedCount + activeAuctionCount;
    };

    const roles = ['P', 'D', 'C', 'A'];
    const missingSlots: string[] = [];
    
    for (const role of roles) {
      const currentCount = getRoleCount(role);
      const requiredSlots = leagueSlots[`slots_${role}` as keyof typeof leagueSlots] || 0;
      const minRequired = Math.max(0, requiredSlots - 1); // N-1 rule
      
      if (currentCount < minRequired) {
        missingSlots.push(`${role}: ${currentCount}/${minRequired}`);
      }
    }
    
    return {
      isCompliant: missingSlots.length === 0,
      missingSlots
    };
  };

  const handleCheckCompliance = async (showToasts = true) => {
    if (!leagueId || !userId) {
      if (showToasts) {
        toast.error("Dati mancanti per il controllo di conformità");
      }
      return;
    }

    setIsChecking(true);
    
    try {
      const response = await fetch(`/api/leagues/${leagueId}/check-compliance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Errore di comunicazione" }));
        
        // Show specific error messages based on status code
        let userMessage = "";
        switch (response.status) {
          case 401:
            userMessage = "Non sei autorizzato. Effettua il login.";
            break;
          case 403:
            userMessage = "Non partecipi a questa lega.";
            break;
          case 404:
            userMessage = "Lega non trovata.";
            break;
          case 500:
            userMessage = "Errore del server. Riprova più tardi.";
            break;
          default:
            userMessage = errorData.error || "Errore nel controllo di conformità";
        }
        
        throw new Error(userMessage);
      }

      const result: ComplianceResult = await response.json();
      console.log("DEBUG ComplianceChecker API result:", result);
      setLastCheckResult(result);

      // Show appropriate toast based on result - SOLO quando si preme manualmente "Verifica"
      if (showToasts) {
        if (result.appliedPenaltyAmount > 0) {
          toast.error(`Penalità applicata: ${result.appliedPenaltyAmount} crediti`, {
            description: result.message,
            duration: 10000,
          });
        } else if (result.isNowCompliant) {
          toast.success("Rosa conforme ai requisiti", {
            description: result.message,
            duration: 6000,
          });
        } else {
          toast.warning("Rosa non conforme: riempi tutte le slot previste per evitare penalità!", {
            description: result.message,
            duration: 8000,
          });
        }
      }

      // NO automatic refresh - let user see the message first

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
      console.error("Error checking compliance:", {
        error,
        leagueId,
        userId,
        errorMessage
      });
      
      if (showToasts) {
        toast.error("Errore nel controllo di conformità", {
          description: errorMessage,
          duration: 8000,
        });
      }
      
      // Set error state for UI display
      setLastCheckResult({
        appliedPenaltyAmount: 0,
        isNowCompliant: false,
        message: `Errore: ${errorMessage}`
      });
    } finally {
      setIsChecking(false);
    }
  };

  // Auto-check compliance on component mount (SENZA toast)
  useEffect(() => {
    if (leagueId && userId) {
      handleCheckCompliance(false).catch(error => {
        console.error("Auto-check failed:", error);
      });
    }
  }, [leagueId, userId]);

  // Timer countdown effect con warning notifications
  useEffect(() => {
    console.log("DEBUG Timer useEffect:", { 
      timeRemainingSeconds: lastCheckResult?.timeRemainingSeconds,
      isNowCompliant: lastCheckResult?.isNowCompliant,
      lastCheckResult 
    });
    
    // Clear timer only if user is compliant OR if there's no timeRemainingSeconds data at all
    if (lastCheckResult?.isNowCompliant || (lastCheckResult?.timeRemainingSeconds === undefined && !lastCheckResult?.gracePeriodEndTime)) {
      console.log("DEBUG Timer: User compliant or no timer data, clearing timer");
      setCurrentTimeRemaining(null);
      setWarningsShown(new Set()); // Reset warnings quando non c'è timer
      return;
    }
    
    // If user is not compliant but timeRemainingSeconds is 0, show expired state
    if (lastCheckResult && !lastCheckResult.isNowCompliant && lastCheckResult.timeRemainingSeconds === 0) {
      console.log("DEBUG Timer: Grace period expired, showing expired state");
      setCurrentTimeRemaining(0);
      return;
    }
    
    // If no timeRemainingSeconds but user is not compliant, don't start timer
    if (!lastCheckResult?.timeRemainingSeconds) {
      console.log("DEBUG Timer: No timeRemainingSeconds data available");
      return;
    }

    // Initialize with the time from API
    console.log("DEBUG Timer: Starting timer with", lastCheckResult.timeRemainingSeconds, "seconds");
    setCurrentTimeRemaining(lastCheckResult.timeRemainingSeconds);

    // Update every second
    const interval = setInterval(() => {
      setCurrentTimeRemaining(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        
        const newTime = prev - 1;
        
        // Warning a 5 minuti (300 secondi)
        if (newTime === 300) {
          setWarningsShown(currentWarnings => {
            if (!currentWarnings.has(300)) {
              toast.warning("Attenzione: 5 minuti rimanenti!", {
                description: "Completa la tua rosa entro 5 minuti per evitare penalità.",
                duration: 8000,
              });
              return new Set(currentWarnings).add(300);
            }
            return currentWarnings;
          });
        }
        
        // Warning a 1 minuto (60 secondi)
        if (newTime === 60) {
          setWarningsShown(currentWarnings => {
            if (!currentWarnings.has(60)) {
              toast.error("URGENTE: 1 minuto rimanente!", {
                description: "Completa immediatamente la tua rosa! Penalità in arrivo.",
                duration: 10000,
              });
              return new Set(currentWarnings).add(60);
            }
            return currentWarnings;
          });
        }
        
        // Warning quando scade (0 secondi)
        if (newTime === 0) {
          setWarningsShown(currentWarnings => {
            if (!currentWarnings.has(0)) {
              toast.error("Periodo di grazia scaduto!", {
                description: "Penalità attive: 5 crediti ogni ora fino al completamento della rosa.",
                duration: 12000,
              });
              return new Set(currentWarnings).add(0);
            }
            return currentWarnings;
          });
        }
        
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lastCheckResult?.timeRemainingSeconds, lastCheckResult?.isNowCompliant]);

  const getComplianceIcon = () => {
    if (!lastCheckResult) return <Clock className="h-4 w-4" />;
    
    if (lastCheckResult.appliedPenaltyAmount > 0) {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
    
    if (lastCheckResult.isNowCompliant) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    
    return <Clock className="h-4 w-4 text-yellow-500" />;
  };

  const getComplianceStatus = () => {
    if (!lastCheckResult) return null;
    
    // Check if it's an error state
    if (lastCheckResult.message.startsWith("Errore:")) {
      return (
        <Badge variant="destructive" className="text-xs">
          Errore
        </Badge>
      );
    }
    
    if (lastCheckResult.appliedPenaltyAmount > 0) {
      return (
        <Badge variant="destructive" className="text-xs">
          Penalità: -{lastCheckResult.appliedPenaltyAmount}
        </Badge>
      );
    }
    
    if (lastCheckResult.isNowCompliant) {
      return (
        <Badge variant="default" className="text-xs bg-green-500">
          Conforme
        </Badge>
      );
    }
    
    return (
      <Badge variant="secondary" className="text-xs bg-yellow-500 text-yellow-900">
        Periodo di Grazia
      </Badge>
    );
  };

  const localCompliance = calculateLocalCompliance();
  
  // Usa solo i dati dell'API per il timer ufficiale
  const displayTimeRemaining = currentTimeRemaining;
  
  // Per il timer, usa priorità API. Se c'è un timer attivo, mostralo sempre
  const shouldShowTimer = displayTimeRemaining !== null && displayTimeRemaining > 0;
  const isCompliant = lastCheckResult?.isNowCompliant ?? localCompliance.isCompliant;
  
  // Determina colori del timer
  const timerColors = displayTimeRemaining !== null ? getTimerColor(displayTimeRemaining) : { bg: 'bg-yellow-500', text: 'text-black' };

  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs">
      {/* Timer sempre visibile se c'è un timer attivo dall'API */}
      {shouldShowTimer && (
        <div className={`flex items-center justify-center gap-1 mb-2 ${timerColors.bg} ${timerColors.text} px-2 py-1 rounded ${displayTimeRemaining <= 300 ? 'animate-pulse' : ''}`}>
          <Timer className="h-3 w-3" />
          <span className="font-mono font-bold">{formatTimeRemaining(displayTimeRemaining)}</span>
        </div>
      )}
      
      {/* Avviso tempo scaduto */}
      {displayTimeRemaining === 0 && lastCheckResult && !lastCheckResult.isNowCompliant && (
        <div className="flex items-center justify-center gap-1 mb-2 bg-red-500 text-white px-2 py-1 rounded">
          <AlertTriangle className="h-3 w-3" />
          <span className="font-bold">Penalità attive</span>
        </div>
      )}
      
      {/* Stato conforme */}
      {isCompliant && (
        <div className="flex items-center justify-center gap-1 mb-2 bg-green-500 text-white px-2 py-1 rounded">
          <CheckCircle className="h-3 w-3" />
          <span className="font-bold">Conforme</span>
        </div>
      )}
      
      {/* Debug info locale (solo se non abbiamo risultati API) */}
      {!lastCheckResult && !localCompliance.isCompliant && (
        <div className="text-xs text-yellow-400 mb-1">
          Mancanti: {localCompliance.missingSlots.join(', ')}
        </div>
      )}
      
      {/* Pulsante verifica */}
      <div className="flex items-center gap-1">
        <Button
          onClick={() => handleCheckCompliance(true)}
          disabled={isChecking}
          size="sm"
          variant="outline"
          className="flex-1 h-6 text-xs bg-gray-700 border-gray-500 text-white hover:bg-gray-600"
        >
          {isChecking ? "..." : "Verifica"}
        </Button>
        
        {lastCheckResult && (
          <Button
            onClick={() => window.location.reload()}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}