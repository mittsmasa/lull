"use client";

import {
  DotsSixVertical,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { Reorder, useDragControls } from "motion/react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PROGRAM_TYPE_LABELS } from "@/db/schema";
import type { ProgramWithPerformers } from "@/lib/queries/programs";
import { cn } from "@/lib/utils";

type ProgramListProps = {
  eventId: string;
  programs: ProgramWithPerformers[];
  canModify: boolean;
  onReorder: (
    eventId: string,
    programIds: string[],
  ) => Promise<{ error: string } | null>;
  onDelete: (
    eventId: string,
    programId: string,
  ) => Promise<{ error: string } | null>;
  onEdit: (program: ProgramWithPerformers) => void;
  onAdd?: () => void;
};

export function ProgramList({
  eventId,
  programs: initialPrograms,
  canModify,
  onReorder,
  onDelete,
  onEdit,
  onAdd,
}: ProgramListProps) {
  const [programs, setPrograms] =
    useState<ProgramWithPerformers[]>(initialPrograms);
  const [, startTransition] = useTransition();
  const previousOrderRef = useRef<ProgramWithPerformers[]>(initialPrograms);

  if (initialPrograms !== previousOrderRef.current) {
    previousOrderRef.current = initialPrograms;
    setPrograms(initialPrograms);
  }

  const handleReorder = (newOrder: ProgramWithPerformers[]) => {
    const prevOrder = [...programs];
    setPrograms(newOrder);

    startTransition(async () => {
      const result = await onReorder(
        eventId,
        newOrder.map((p) => p.id),
      );
      if (result?.error) {
        setPrograms(prevOrder);
        toast.error(result.error);
      } else {
        toast.success("並び順を保存しました", {
          duration: 1500,
          id: "program-reorder",
        });
      }
    });
  };

  const handleDelete = (programId: string) => {
    startTransition(async () => {
      const result = await onDelete(eventId, programId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("プログラムを削除しました");
      }
    });
  };

  if (programs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border/60 bg-card/40 px-6 py-12 text-center">
        <p className="text-muted-foreground">まだプログラムがありません</p>
        {canModify && onAdd && (
          <Button variant="outline" onClick={onAdd} className="tracking-wider">
            <Plus size={16} />
            最初のプログラムを追加
          </Button>
        )}
      </div>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={programs}
      onReorder={handleReorder}
      className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60 bg-card/40"
    >
      {programs.map((program, index) => (
        <ProgramRow
          key={program.id}
          program={program}
          index={index}
          canModify={canModify}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      ))}
    </Reorder.Group>
  );
}

type ProgramRowProps = {
  program: ProgramWithPerformers;
  index: number;
  canModify: boolean;
  onEdit: (program: ProgramWithPerformers) => void;
  onDelete: (programId: string) => void;
};

function ProgramRow({
  program,
  index,
  canModify,
  onEdit,
  onDelete,
}: ProgramRowProps) {
  const dragControls = useDragControls();
  const deleteTargetLabel =
    program.type === "performance"
      ? `${program.performers.map((p) => p.displayName).join(", ")} - ${program.pieces.map((piece) => piece.title).join(" / ")}`
      : (program.pieces[0]?.title ?? "このプログラム");

  const timeLabel =
    program.scheduledTime || program.estimatedDuration != null
      ? [
          program.scheduledTime && `${program.scheduledTime}〜`,
          program.estimatedDuration != null && `${program.estimatedDuration}分`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <Reorder.Item
      value={program}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        "group flex items-start gap-3 px-3 py-3 transition-colors first:rounded-t-md last:rounded-b-md",
        "hover:bg-muted/40 focus-within:bg-muted/40",
        program.type !== "performance" && "bg-muted/30",
      )}
      whileDrag={{
        scale: 1.01,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      {canModify && (
        <button
          type="button"
          aria-label="並び替え"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <DotsSixVertical size={16} />
        </button>
      )}

      {program.type === "performance" ? (
        <span className="mt-0.5 w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {index + 1}.
        </span>
      ) : (
        <span className="mt-1 shrink-0 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {PROGRAM_TYPE_LABELS[program.type]}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {program.type === "performance" ? (
          <>
            {program.performers.length > 0 && (
              <span className="min-w-0 font-medium">
                {program.performers.map((p) => p.displayName).join(", ")}
              </span>
            )}
            {program.pieces.map((piece) => (
              <div
                key={piece.id}
                className="flex items-baseline gap-2 text-sm text-muted-foreground"
              >
                <span>{piece.title}</span>
                {piece.composer && (
                  <span className="text-muted-foreground/60">
                    {piece.composer}
                  </span>
                )}
              </div>
            ))}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {program.pieces[0]?.title}
          </span>
        )}
      </div>

      {timeLabel && (
        <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground">
          {timeLabel}
        </span>
      )}

      {canModify && (
        <div className="flex shrink-0 items-start gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="編集"
            onClick={() => onEdit(program)}
          >
            <PencilSimple size={14} />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="削除"
                className="size-7 text-muted-foreground hover:text-destructive"
              >
                <Trash size={14} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>プログラムを削除</AlertDialogTitle>
                <AlertDialogDescription>
                  「{deleteTargetLabel}
                  」を削除してもよろしいですか？この操作は取り消せません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(program.id)}>
                  削除する
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </Reorder.Item>
  );
}
