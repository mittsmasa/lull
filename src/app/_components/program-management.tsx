"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusLabels, statusVariants } from "@/lib/event-status";
import type {
  MemberOption,
  ProgramWithPerformers,
} from "@/lib/queries/programs";
import {
  deleteProgram,
  reorderPrograms,
} from "../(main)/events/[eventId]/programs/_actions";
import { ProgramForm } from "./program-form";
import { ProgramList } from "./program-list";

type ProgramManagementProps = {
  event: {
    id: string;
    name: string;
    status: EventStatus;
  };
  programs: ProgramWithPerformers[];
  members: MemberOption[];
  currentUserRole: MemberRole;
};

export function ProgramManagement({
  event,
  programs,
  members,
  currentUserRole,
}: ProgramManagementProps) {
  const [editingProgram, setEditingProgram] =
    useState<ProgramWithPerformers | null>(null);

  const canModify =
    event.status !== "finished" &&
    (currentUserRole === "organizer" || currentUserRole === "performer");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-light tracking-wide">プログラム管理</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-muted-foreground">{event.name}</span>
          <Badge variant={statusVariants[event.status]}>
            {statusLabels[event.status]}
          </Badge>
        </div>
      </div>

      <ProgramList
        eventId={event.id}
        programs={programs}
        canModify={canModify}
        onReorder={reorderPrograms}
        onDelete={deleteProgram}
        onEdit={setEditingProgram}
      />

      {canModify && <ProgramForm eventId={event.id} members={members} />}

      <Dialog
        open={editingProgram !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProgram(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>プログラムを編集</DialogTitle>
          </DialogHeader>
          {editingProgram && (
            <ProgramForm
              eventId={event.id}
              members={members}
              mode="edit"
              initialData={{
                id: editingProgram.id,
                type: editingProgram.type,
                pieces: editingProgram.pieces.map((p) => ({
                  title: p.title,
                  composer: p.composer,
                })),
                scheduledTime: editingProgram.scheduledTime,
                estimatedDuration: editingProgram.estimatedDuration,
                note: editingProgram.note,
                performerIds: editingProgram.performers.map((p) => p.memberId),
              }}
              onSuccess={() => setEditingProgram(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
