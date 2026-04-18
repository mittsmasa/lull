"use client";

import { DotsSixVertical, PencilSimple, Trash } from "@phosphor-icons/react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

export function ProgramList({
  eventId,
  programs: initialPrograms,
  canModify,
  onReorder,
  onDelete,
  onEdit,
}: ProgramListProps) {
  const [programs, setPrograms] =
    useState<ProgramWithPerformers[]>(initialPrograms);
  const [, startTransition] = useTransition();
  const previousOrderRef = useRef<ProgramWithPerformers[]>(initialPrograms);

  // props 更新時にローカル state を同期
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-light">プログラム一覧</CardTitle>
      </CardHeader>
      <CardContent>
        {programs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            プログラムがありません
          </p>
        ) : (
          <Reorder.Group
            axis="y"
            values={programs}
            onReorder={handleReorder}
            className="flex flex-col gap-2"
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
        )}
      </CardContent>
    </Card>
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
  // 削除確認に表示する演目表記（複数曲の場合はすべて列挙）
  const deleteTargetLabel =
    program.type === "performance"
      ? `${program.performers.map((p) => p.displayName).join(", ")} - ${program.pieces.map((piece) => piece.title).join(" / ")}`
      : (program.pieces[0]?.title ?? "このプログラム");

  return (
    <Reorder.Item
      value={program}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        "flex items-center gap-2 rounded-lg p-3",
        program.type === "performance"
          ? "border bg-card"
          : "border bg-muted/50",
      )}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      {canModify && (
        <button
          type="button"
          aria-label="並び替え"
          className="mt-0.5 shrink-0 cursor-grab touch-none p-1 text-muted-foreground active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <DotsSixVertical size={16} />
        </button>
      )}

      <span className="mt-0.5 text-muted-foreground/60 shrink-0 text-xs tabular-nums">
        {index + 1}
      </span>

      {program.type === "performance" ? (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
          {(program.estimatedDuration || program.scheduledTime) && (
            <span className="text-xs text-muted-foreground">
              {program.estimatedDuration && `${program.estimatedDuration}分`}
              {program.estimatedDuration && program.scheduledTime && " / "}
              {program.scheduledTime && `${program.scheduledTime}〜`}
            </span>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-muted-foreground">
          <span>{program.pieces[0]?.title}</span>
          {(program.estimatedDuration || program.scheduledTime) && (
            <span className="text-xs">
              {program.estimatedDuration && `${program.estimatedDuration}分`}
              {program.estimatedDuration && program.scheduledTime && " / "}
              {program.scheduledTime && `${program.scheduledTime}〜`}
            </span>
          )}
        </div>
      )}

      {canModify && (
        <div className="flex shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onEdit(program)}
          >
            <PencilSimple size={14} />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
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
