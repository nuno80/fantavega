"use client";

import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Lazy load dei componenti modali pesanti
const ResponseActionModal = lazy(() => import("./ResponseActionModal").then(module => ({ default: module.ResponseActionModal })));
const StandardBidModal = lazy(() => import("./StandardBidModal").then(module => ({ default: module.StandardBidModal })));
const AutoBidModal = lazy(() => import("./AutoBidModal").then(module => ({ default: module.AutoBidModal })));
const BidHistory = lazy(() => import("./BidHistory").then(module => ({ default: module.BidHistory })));

// Skeleton per i modali durante il caricamento
function ModalSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </div>
      </div>
    </div>
  );
}

// Skeleton per BidHistory
function BidHistorySkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-6 w-1/3" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center p-3 border rounded">
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Wrapper per ResponseActionModal con lazy loading
interface LazyResponseActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  currentBid: number;
  timeRemaining: number;
  leagueId: number;
  playerId: number;
  onCounterBid: () => void;
}

export function LazyResponseActionModal(props: LazyResponseActionModalProps) {
  if (!props.isOpen) return null;

  return (
    <Suspense 
      fallback={
        <Dialog open={props.isOpen} onOpenChange={props.onClose}>
          <DialogContent>
            <ModalSkeleton />
          </DialogContent>
        </Dialog>
      }
    >
      <ResponseActionModal {...props} />
    </Suspense>
  );
}

// Wrapper per StandardBidModal con lazy loading
interface LazyStandardBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  playerRole: string;
  playerTeam: string;
  playerId: number;
  leagueId: number;
  currentBid?: number;
  isNewAuction?: boolean;
  onBidSuccess?: () => void;
  title?: string;
  existingAutoBid?: {
    max_amount: number;
    is_active: boolean;
  } | null;
}

export function LazyStandardBidModal(props: LazyStandardBidModalProps) {
  if (!props.isOpen) return null;

  return (
    <Suspense 
      fallback={
        <Dialog open={props.isOpen} onOpenChange={props.onClose}>
          <DialogContent>
            <ModalSkeleton />
          </DialogContent>
        </Dialog>
      }
    >
      <StandardBidModal {...props} />
    </Suspense>
  );
}

// Wrapper per AutoBidModal con lazy loading
interface LazyAutoBidModalProps {
  currentBid: number;
  userBudget: number;
  lockedCredits: number;
  playerId: number;
  leagueId: number;
  playerName: string;
  existingAutoBid?: {
    max_amount: number;
    is_active: boolean;
  } | null;
  onAutoBidSet?: () => void;
  trigger: React.ReactNode;
}

export function LazyAutoBidModal(props: LazyAutoBidModalProps) {
  return (
    <Suspense fallback={props.trigger}>
      <AutoBidModal {...props} />
    </Suspense>
  );
}

// Wrapper per BidHistory con lazy loading
interface LazyBidHistoryProps {
  bids: any[];
  currentUserId?: string;
}

export function LazyBidHistory(props: LazyBidHistoryProps) {
  return (
    <Suspense fallback={<BidHistorySkeleton />}>
      <BidHistory {...props} />
    </Suspense>
  );
}