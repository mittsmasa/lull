"use client";

import {
  DotsSixVertical,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
} from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
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
import type { ProgramWithPerformers } from "@/lib/queries/programs";
import { cn } from "@/lib/utils";

type ListMode = "view" | "reorder";

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
  const [mode, setMode] = useState<ListMode>("view");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const previousOrderRef = useRef<ProgramWithPerformers[]>(initialPrograms);
  const listRef = useRef<HTMLDivElement | null>(null);

  if (initialPrograms !== previousOrderRef.current) {
    previousOrderRef.current = initialPrograms;
    setPrograms(initialPrograms);
  }

  // 削除や props 更新で対象が消えたら選択を解除
  useEffect(() => {
    if (selectedId && !programs.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [programs, selectedId]);

  // 選択中の Escape と外側クリックで閉じる
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    const onClick = (e: MouseEvent) => {
      const list = listRef.current;
      if (!list) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (list.contains(target)) return;
      // Radix の Portal で描画される Dialog 内のクリックは外側扱いにしない
      // （削除確認ダイアログ内のボタン押下中に selectedId をクリアして
      // ダイアログをアンマウントしてしまうのを防ぐ）
      if (target.closest('[role="alertdialog"], [role="dialog"]')) return;
      setSelectedId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [selectedId]);

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

  const toggleReorderMode = () => {
    setMode((m) => (m === "reorder" ? "view" : "reorder"));
    setSelectedId(null);
  };

  const handleSelect = (id: string) => {
    if (mode !== "view") return;
    setSelectedId((curr) => (curr === id ? null : id));
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

  const showReorderToggle = canModify && programs.length >= 2;

  return (
    <div ref={listRef} className="flex flex-col gap-3">
      {showReorderToggle && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant={mode === "reorder" ? "default" : "outline"}
            size="sm"
            onClick={toggleReorderMode}
            className="tracking-wider"
          >
            {mode === "reorder" ? "完了" : "並べ替え"}
          </Button>
        </div>
      )}

      <Reorder.Group
        axis="y"
        values={programs}
        onReorder={handleReorder}
        className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60 bg-card/40"
      >
        {(() => {
          let performanceCounter = 0;
          return programs.map((program) => {
            const performanceNumber =
              program.type === "performance" ? ++performanceCounter : null;
            return (
              <ProgramRow
                key={program.id}
                program={program}
                performanceNumber={performanceNumber}
                canModify={canModify}
                mode={mode}
                selected={selectedId === program.id}
                onSelect={handleSelect}
                onEdit={onEdit}
                onDelete={handleDelete}
              />
            );
          });
        })()}
      </Reorder.Group>
    </div>
  );
}

type ProgramRowProps = {
  program: ProgramWithPerformers;
  performanceNumber: number | null;
  canModify: boolean;
  mode: ListMode;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (program: ProgramWithPerformers) => void;
  onDelete: (programId: string) => void;
};

function ProgramRow({
  program,
  performanceNumber,
  canModify,
  mode,
  selected,
  onSelect,
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

  const isReorder = mode === "reorder";
  const interactive = canModify && mode === "view";
  const showGrip = canModify && isReorder;

  const handleRowClick = () => {
    if (!interactive) return;
    onSelect(program.id);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(program.id);
    }
  };

  return (
    <Reorder.Item
      value={program}
      dragListener={false}
      dragControls={dragControls}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "transition-colors first:rounded-t-md last:rounded-b-md",
        program.type !== "performance" && "bg-muted/30",
        selected && "bg-muted/50",
      )}
      whileDrag={{
        scale: 1.01,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div
        {...(interactive
          ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-expanded": selected,
              onClick: handleRowClick,
              onKeyDown: handleRowKeyDown,
            }
          : {})}
        className={cn(
          "flex items-start gap-2 px-3 py-3 outline-none",
          interactive &&
            "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        )}
      >
        {showGrip && (
          <button
            type="button"
            aria-label="並び替え"
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground active:cursor-grabbing"
            onPointerDown={(e) => {
              e.stopPropagation();
              dragControls.start(e);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <DotsSixVertical size={16} />
          </button>
        )}

        {program.type === "performance" && (
          <span className="mt-0.5 w-7 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
            {performanceNumber}.
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
              <div className="mt-0.5 flex flex-col gap-1 border-l border-border/50 pl-2.5">
                {program.pieces.map((piece) => (
                  <div key={piece.id} className="flex flex-col">
                    <span className="text-sm">{piece.title}</span>
                    {piece.composer && (
                      <span className="text-xs text-muted-foreground/70">
                        {piece.composer}
                      </span>
                    )}
                  </div>
                ))}
              </div>
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
      </div>

      <AnimatePresence initial={false}>
        {interactive && selected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex items-center justify-end gap-1 border-t border-border/40 bg-background/40 px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(program);
                }}
              >
                <PencilSimple size={14} />
                編集
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash size={14} />
                    削除
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
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}
