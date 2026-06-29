"use client";

import { Gear, Plus } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Switch } from "@/components/ui/switch";
import type { EventStatus, MemberRole } from "@/db/schema";
import { statusLabels, statusVariants } from "@/lib/event-status";
import type {
  MemberOption,
  ProgramWithPerformers,
} from "@/lib/queries/programs";
import {
  deleteProgram,
  reorderPrograms,
  toggleShowProgram,
} from "../(main)/events/[eventId]/programs/_actions";
import { ProgramDetail } from "./program-detail";
import { ProgramForm } from "./program-form";
import { ProgramList } from "./program-list";

type ProgramManagementProps = {
  event: {
    id: string;
    name: string;
    status: EventStatus;
    showProgram: boolean;
  };
  programs: ProgramWithPerformers[];
  members: MemberOption[];
  currentUserRole: MemberRole;
};

type DialogState =
  | { mode: "add" }
  | { mode: "edit"; program: ProgramWithPerformers }
  | { mode: "detail"; program: ProgramWithPerformers }
  | { mode: "settings" }
  | null;

export function ProgramManagement({
  event,
  programs,
  members,
  currentUserRole,
}: ProgramManagementProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isPending, startTransition] = useTransition();
  const isOrganizer = currentUserRole === "organizer";

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
            {isOrganizer && (
              <>
                <Badge variant={event.showProgram ? "outline" : "secondary"}>
                  {event.showProgram ? "招待状:表示中" : "招待状:非表示"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setDialog({ mode: "settings" })}
                >
                  <Gear size={16} />
                </Button>
              </>
            )}
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
        onShowDetail={(program) => setDialog({ mode: "detail", program })}
        onAdd={canModify ? openAdd : undefined}
      />

      <ResponsiveModal
        open={dialog !== null && dialog.mode !== "settings"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        size={dialog?.mode === "detail" ? "sm" : "md"}
      >
        <ResponsiveModalContent>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>
              {dialog?.mode === "edit"
                ? "プログラムを編集"
                : dialog?.mode === "detail"
                  ? "プログラムの詳細"
                  : "プログラムを追加"}
            </ResponsiveModalTitle>
          </ResponsiveModalHeader>
          {dialog?.mode === "detail" && (
            <ProgramDetail program={dialog.program} />
          )}
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
        </ResponsiveModalContent>
      </ResponsiveModal>

      <ResponsiveModal
        open={dialog?.mode === "settings"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        size="sm"
      >
        <ResponsiveModalContent>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>プログラム設定</ResponsiveModalTitle>
          </ResponsiveModalHeader>
          <div className="flex items-center justify-between gap-4 py-4">
            <Label htmlFor="show-program" className="flex flex-col gap-1.5">
              <span>招待状にプログラムを表示</span>
              <span className="text-xs font-normal text-muted-foreground">
                {event.showProgram
                  ? "ゲストの招待状ページにプログラムが表示されます"
                  : "ゲストの招待状ページにプログラムは表示されません"}
              </span>
            </Label>
            <Switch
              id="show-program"
              checked={event.showProgram}
              disabled={isPending}
              onCheckedChange={(checked) => {
                startTransition(async () => {
                  await toggleShowProgram(event.id, checked);
                });
              }}
            />
          </div>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </div>
  );
}
