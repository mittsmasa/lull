"use client";

import { Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type DialogState =
  | { mode: "add" }
  | { mode: "edit"; program: ProgramWithPerformers }
  | null;

export function ProgramManagement({
  event,
  programs,
  members,
  currentUserRole,
}: ProgramManagementProps) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const canModify =
    event.status !== "finished" &&
    (currentUserRole === "organizer" || currentUserRole === "performer");

  const openAdd = () => setDialog({ mode: "add" });
  const close = () => setDialog(null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-wide">プログラム管理</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-muted-foreground">{event.name}</span>
            <Badge variant={statusVariants[event.status]}>
              {statusLabels[event.status]}
            </Badge>
          </div>
        </div>
        {canModify && (
          <Button
            onClick={openAdd}
            className="tracking-wider self-start sm:self-auto"
          >
            <Plus size={16} />
            プログラムを追加
          </Button>
        )}
      </div>

      <ProgramList
        eventId={event.id}
        programs={programs}
        canModify={canModify}
        onReorder={reorderPrograms}
        onDelete={deleteProgram}
        onEdit={(program) => setDialog({ mode: "edit", program })}
        onAdd={canModify ? openAdd : undefined}
      />

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? "プログラムを編集"
                : "プログラムを追加"}
            </DialogTitle>
          </DialogHeader>
          {dialog?.mode === "add" && (
            <ProgramForm
              eventId={event.id}
              members={members}
              onSuccess={close}
            />
          )}
          {dialog?.mode === "edit" && (
            <ProgramForm
              eventId={event.id}
              members={members}
              mode="edit"
              initialData={{
                id: dialog.program.id,
                type: dialog.program.type,
                pieces: dialog.program.pieces.map((p) => ({
                  title: p.title,
                  composer: p.composer,
                })),
                scheduledTime: dialog.program.scheduledTime,
                estimatedDuration: dialog.program.estimatedDuration,
                note: dialog.program.note,
                performerIds: dialog.program.performers.map((p) => p.memberId),
              }}
              onSuccess={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
