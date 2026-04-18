"use client";

import { DotsSixVertical, PencilSimple, Trash } from "@phosphor-icons/react";
import { Reorder } from "motion/react";
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
              <Reorder.Item
                key={program.id}
                value={program}
                dragListener={canModify}
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
                  <DotsSixVertical
                    className="mt-0.5 text-muted-foreground shrink-0 cursor-grab"
                    size={16}
                  />
                )}

                <span className="mt-0.5 text-muted-foreground/60 shrink-0 text-xs tabular-nums">
                  {index + 1}
                </span>

                {program.type === "performance" ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {program.performers.length > 0 && (
                      <span className="min-w-0 font-medium">
                        {program.performers
                          .map((p) => p.displayName)
                          .join(", ")}
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
                    {program.estimatedDuration && (
                      <span className="text-xs text-muted-foreground">
                        {program.estimatedDuration}分
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-muted-foreground">
                    <span>{program.pieces[0]?.title}</span>
                    {program.estimatedDuration && (
                      <span className="text-xs">
                        {program.estimatedDuration}分
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
                            「
                            {program.type === "performance"
                              ? `${program.performers.map((p) => p.displayName).join(", ")} - ${program.pieces[0]?.title ?? ""}`
                              : (program.pieces[0]?.title ?? "このプログラム")}
                            」を削除してもよろしいですか？この操作は取り消せません。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(program.id)}
                          >
                            削除する
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </CardContent>
    </Card>
  );
}
