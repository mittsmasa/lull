"use client";

import { ArrowDown, ArrowUp, Trash } from "@phosphor-icons/react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PROGRAM_TYPE_LABELS,
  PROGRAM_TYPES,
  type ProgramType,
} from "@/db/schema";
import type { MemberOption } from "@/lib/queries/programs";
import {
  createProgram,
  type ProgramActionState,
  updateProgram,
} from "../(main)/events/[eventId]/programs/_actions";

type ProgramFormProps = {
  eventId: string;
  members: MemberOption[];
  mode?: "add" | "edit";
  initialData?: {
    id: string;
    type: ProgramType;
    pieces: { title: string; composer: string | null }[];
    scheduledTime: string | null;
    estimatedDuration: number | null;
    note: string | null;
    performerIds: string[];
  };
  onSuccess?: () => void;
};

export function ProgramForm({
  eventId,
  members,
  mode = "add",
  initialData,
  onSuccess,
}: ProgramFormProps) {
  const [selectedType, setSelectedType] = useState<ProgramType>(
    initialData?.type ?? "performance",
  );
  const [selectedPerformerIds, setSelectedPerformerIds] = useState<string[]>(
    initialData?.performerIds ?? [],
  );
  const [pieces, setPieces] = useState<
    { id: string; title: string; composer: string }[]
  >(
    initialData?.pieces.map((p) => ({
      id: crypto.randomUUID(),
      title: p.title,
      composer: p.composer ?? "",
    })) ?? [{ id: crypto.randomUUID(), title: "", composer: "" }],
  );
  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState<ProgramActionState, FormData>(
    async (_prevState, formData) => {
      const data = {
        type: formData.get("type") as string,
        pieces,
        scheduledTime: formData.get("scheduledTime") as string,
        estimatedDuration: formData.get("estimatedDuration") as string,
        note: formData.get("note") as string,
        performerIds: selectedPerformerIds,
      };
      const result =
        mode === "add"
          ? await createProgram(eventId, data)
          : await updateProgram(eventId, initialData?.id ?? "", data);
      if (result === null) {
        toast.success(
          mode === "add"
            ? "プログラムを追加しました"
            : "プログラムを更新しました",
        );
        if (mode === "add") {
          setSelectedType("performance");
          setSelectedPerformerIds([]);
          setPieces([{ id: crypto.randomUUID(), title: "", composer: "" }]);
        }
        onSuccess?.();
      }
      return result;
    },
    null,
  );

  const handlePerformerToggle = (memberId: string, checked: boolean) => {
    setSelectedPerformerIds((prev) =>
      checked ? [...prev, memberId] : prev.filter((id) => id !== memberId),
    );
  };

  const updatePiece = (
    index: number,
    field: "title" | "composer",
    value: string,
  ) => {
    setPieces((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  };

  const addPiece = () => {
    setPieces((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: "", composer: "" },
    ]);
  };

  const removePiece = (index: number) => {
    setPieces((prev) => prev.filter((_, i) => i !== index));
  };

  const movePiece = (index: number, direction: -1 | 1) => {
    setPieces((prev) => {
      const next = [...prev];
      const target = index + direction;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const formContent = (
    <form
      action={(formData) => {
        startTransition(() => {
          formAction(formData);
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">
            種別<span className="text-destructive ml-1">*</span>
          </Label>
          <Select
            name="type"
            value={selectedType}
            onValueChange={(v) => {
              const newType = v as ProgramType;
              setSelectedType(newType);
              if (newType !== "performance") {
                setPieces((prev) => [prev[0]]);
              }
            }}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROGRAM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {PROGRAM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state?.fieldErrors?.type && (
            <p className="text-sm text-destructive">{state.fieldErrors.type}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Label>
          {selectedType === "performance" ? "曲目" : "タイトル"}
          <span className="text-destructive ml-1">*</span>
        </Label>
        {pieces.map((piece, i) => (
          <div key={piece.id} className="flex items-start gap-2">
            {pieces.length > 1 && (
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={i === 0}
                  onClick={() => movePiece(i, -1)}
                >
                  <ArrowUp size={12} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={i === pieces.length - 1}
                  onClick={() => movePiece(i, 1)}
                >
                  <ArrowDown size={12} />
                </Button>
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1">
              <Input
                placeholder={
                  selectedType === "performance" ? "曲名" : "タイトル"
                }
                value={piece.title}
                onChange={(e) => updatePiece(i, "title", e.target.value)}
                required
              />
              {selectedType === "performance" && (
                <Input
                  placeholder="作曲者"
                  value={piece.composer}
                  onChange={(e) => updatePiece(i, "composer", e.target.value)}
                />
              )}
            </div>
            {pieces.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePiece(i)}
              >
                <Trash size={14} />
              </Button>
            )}
          </div>
        ))}
        {selectedType === "performance" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPiece}
            className="w-fit"
          >
            + 曲を追加
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="scheduledTime">
            予定時刻
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              （任意）
            </span>
          </Label>
          <Input
            id="scheduledTime"
            name="scheduledTime"
            type="time"
            defaultValue={initialData?.scheduledTime ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="estimatedDuration">
            所要時間（分）
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              （任意）
            </span>
          </Label>
          <Input
            id="estimatedDuration"
            name="estimatedDuration"
            type="number"
            min={1}
            max={999}
            defaultValue={initialData?.estimatedDuration ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">
          備考
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            （任意）
          </span>
        </Label>
        <Textarea
          id="note"
          name="note"
          defaultValue={initialData?.note ?? ""}
          maxLength={500}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          出演者
          {selectedType === "performance" ? (
            <span className="text-destructive ml-1">*</span>
          ) : (
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              （任意）
            </span>
          )}
        </Label>
        <div className="flex flex-wrap gap-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`performer-${m.id}`}
                checked={selectedPerformerIds.includes(m.id)}
                onCheckedChange={(checked) =>
                  handlePerformerToggle(m.id, checked === true)
                }
              />
              <Label
                htmlFor={`performer-${m.id}`}
                className="text-sm font-normal"
              >
                {m.displayName}
              </Label>
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">
              メンバーが登録されていません
            </p>
          )}
        </div>
        {state?.fieldErrors?.performerIds && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.performerIds}
          </p>
        )}
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode === "add"
              ? "追加中..."
              : "更新中..."
            : mode === "add"
              ? "プログラムを追加"
              : "プログラムを更新"}
        </Button>
      </div>
    </form>
  );

  if (mode === "edit") {
    return formContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-light">プログラムを追加</CardTitle>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
