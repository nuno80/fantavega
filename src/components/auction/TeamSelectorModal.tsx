"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeamSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  managers: { user_id: string; manager_team_name: string }[];
  onSelectTeam: (userId: string) => void;
  onShowAllTeams: () => void;
}

export function TeamSelectorModal({
  isOpen,
  onClose,
  managers,
  onSelectTeam,
  onShowAllTeams,
}: TeamSelectorModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="border-gray-700 bg-gray-800 text-white">
        <DialogHeader>
          <DialogTitle>Seleziona una squadra</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col space-y-2">
          {managers.map((manager) => (
            <Button
              key={manager.user_id}
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                onSelectTeam(manager.user_id);
                onClose();
              }}
            >
              {manager.manager_team_name}
            </Button>
          ))}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              onShowAllTeams();
              onClose();
            }}
          >
            Mostra tutte le squadre
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
