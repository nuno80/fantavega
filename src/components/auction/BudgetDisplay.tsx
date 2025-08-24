"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface BudgetDisplayProps {
  totalBudget: number;
  currentBudget: number;
  lockedCredits: number;
  teamName?: string;
  leagueId?: number;
  userId?: string;
  onBudgetUpdate?: () => void;
}

export function BudgetDisplay({
  totalBudget,
  currentBudget,
  lockedCredits,
  teamName,
  leagueId: _leagueId,
  userId: _userId,
  onBudgetUpdate: _onBudgetUpdate,
}: BudgetDisplayProps) {
  // Validazioni per prevenire valori negativi
  const displayLockedCredits = Math.max(0, lockedCredits);
  const availableBudget = Math.max(0, currentBudget - lockedCredits);
  const spentBudget = Math.max(0, totalBudget - currentBudget);
  const budgetUsedPercentage =
    totalBudget > 0 ? (spentBudget / totalBudget) * 100 : 0;
  const lockedPercentage =
    totalBudget > 0 ? (displayLockedCredits / totalBudget) * 100 : 0;

  const getBudgetStatus = () => {
    const percentage = budgetUsedPercentage;
    if (percentage < 50) return { color: "text-green-600", status: "Ottimo" };
    if (percentage < 75)
      return { color: "text-yellow-600", status: "Attenzione" };
    return { color: "text-red-600", status: "Critico" };
  };

  const status = getBudgetStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Budget</span>
          {teamName && (
            <Badge variant="outline" className="text-xs">
              {teamName}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available Budget - Main Display */}
        <div className="rounded-lg bg-primary/10 p-4 text-center">
          <p className="mb-1 text-sm text-muted-foreground">Disponibile</p>
          <p className="text-3xl font-bold text-primary">
            {availableBudget.toString()}
          </p>
          <p className="text-sm text-muted-foreground">crediti</p>
        </div>

        {/* Budget Breakdown */}
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Budget totale:</span>
            <span className="font-semibold">{totalBudget}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Budget attuale:</span>
            <span className="font-semibold">{currentBudget}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Crediti bloccati:</span>
            <span className="font-semibold text-yellow-600">
              {displayLockedCredits}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Spesi:</span>
            <span className="font-semibold text-red-600">{spentBudget}</span>
          </div>
        </div>

        {/* Budget Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Utilizzo Budget</span>
            <span>{budgetUsedPercentage.toFixed(1)}%</span>
          </div>
          <Progress value={budgetUsedPercentage} className="h-2" />
          {displayLockedCredits > 0 && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Crediti Bloccati</span>
                <span>{lockedPercentage.toFixed(1)}%</span>
              </div>
              <Progress value={lockedPercentage} className="h-1 opacity-60" />
            </>
          )}
        </div>

        {/* Budget Status */}
        <div className="flex items-center justify-between rounded bg-muted p-2">
          <span className="text-sm">Stato Budget:</span>
          <Badge className={status.color} variant="outline">
            {status.status}
          </Badge>
        </div>

        {/* Warnings */}
        {availableBudget < 50 && (
          <div className="rounded bg-yellow-100 p-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            ⚠️ Budget disponibile basso
          </div>
        )}

        {displayLockedCredits > availableBudget && (
          <div className="rounded bg-red-100 p-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
            🚨 Crediti bloccati superiori al disponibile
          </div>
        )}
      </CardContent>
    </Card>
  );
}
