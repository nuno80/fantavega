"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type BidRecord } from "@/lib/db/services/bid.service";

interface BidHistoryProps {
  bids: BidRecord[];
  currentUserId?: string;
}

export function BidHistory({ bids, currentUserId }: BidHistoryProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getBidTypeColor = (type: string) => {
    switch (type) {
      case "manual":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "auto":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "quick":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  if (!bids || bids.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cronologia Offerte</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-muted-foreground">
            Nessuna offerta ancora
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cronologia Offerte</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {(bids || []).map((bid, index) => (
              <div
                key={bid.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  bid.user_id === currentUserId
                    ? "border-primary/20 bg-primary/10"
                    : "bg-muted/50"
                } ${index === 0 ? "ring-2 ring-primary/50" : ""}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {bid.bidder_username || bid.user_id}
                    </span>
                    {bid.user_id === currentUserId && (
                      <Badge variant="outline" className="text-xs">
                        Tu
                      </Badge>
                    )}
                    {index === 0 && <Badge className="text-xs">Migliore</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatTime(bid.bid_time)}
                    </span>
                    <Badge
                      className={`text-xs ${getBidTypeColor(bid.bid_type)}`}
                      variant="outline"
                    >
                      {bid.bid_type}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold">{bid.amount}</span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    crediti
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
