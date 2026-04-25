"use client";

import { ArrowDown, ArrowUp, Trash } from "@phosphor-icons/react";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

const FIELD_ORDER = [
  "type",
  "pieces",
  "performerIds",
  "estimatedDuration",
  "scheduledTime",
  "note",
] as const;

type FieldKey = (typeof FIELD_ORDER)[number];

export function ProgramForm({
  eventId,
  members,
  mode = "add",
  initialData,
  onSuccess,
}: ProgramFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const durationId = useId();
  const timeId = useId();
  const noteId = useId();
  const piecesErrorId = useId();
  const performersErrorId = useId();

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
  // 任意入力欄は controlled 化する。React 19 の form action では
  // 送信時に uncontrolled 入力が自動リセットされるため、バリデーション
  // エラーで再表示した際に値が消えてしまう。
  const [scheduledTime, setScheduledTime] = useState(
    initialData?.scheduledTime ?? "",
  );
  const [estimatedDuration, setEstimatedDuration] = useState(
    initialData?.estimatedDuration != null
      ? String(initialData.estimatedDuration)
      : "",
  );
  const [note, setNote] = useState(initialData?.note ?? "");

  const initialHasDetail = useMemo(
    () =>
      Boolean(
        initialData?.scheduledTime ||
          initialData?.estimatedDuration != null ||
          initialData?.note,
      ) || initialData?.type === "intermission",
    [initialData],
  );
  const [detailOpen, setDetailOpen] = useState(initialHasDetail);

  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState<ProgramActionState, FormData>(
    async (_prevState, _formData) => {
      const data = {
        type: selectedType,
        pieces,
        scheduledTime,
        estimatedDuration,
        note,
        performerIds:
          selectedType === "performance" ? selectedPerformerIds : [],
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
          setScheduledTime("");
          setEstimatedDuration("");
          setNote("");
          setDetailOpen(false);
        }
        onSuccess?.();
      } else if (result.error && !result.fieldErrors) {
        toast.error(result.error);
      }
      return result;
    },
    null,
  );

  useEffect(() => {
    if (!state?.fieldErrors) return;
    const errorKey = FIELD_ORDER.find((k) => state.fieldErrors?.[k]);
    if (!errorKey) return;

    if (
      errorKey === "scheduledTime" ||
      errorKey === "estimatedDuration" ||
      errorKey === "note"
    ) {
      setDetailOpen(true);
    }

    const raf = requestAnimationFrame(() => {
      const form = formRef.current;
      if (!form) return;
      const el = findErrorElement(form, errorKey);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      if (typeof el.focus === "function") {
        el.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [state?.fieldErrors]);

  const handleTypeChange = (next: string) => {
    if (!next) return;
    const newType = next as ProgramType;
    if (newType === selectedType) return;
    if (
      selectedType === "performance" &&
      newType !== "performance" &&
      pieces.length >= 2
    ) {
      const ok = window.confirm(
        "種別を変更すると、2 件目以降の曲目は削除されます。よろしいですか？",
      );
      if (!ok) return;
    }
    setSelectedType(newType);
    if (newType !== "performance") {
      setPieces((prev) => [prev[0]]);
    }
  };

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

  const piecesError = state?.fieldErrors?.pieces;
  const performersError = state?.fieldErrors?.performerIds;

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(() => {
          formAction(formData);
        });
      }}
      className="flex flex-col gap-5"
    >
      <fieldset disabled={isPending} className="contents">
        <div className="flex flex-col gap-2">
          <Label>種別</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={selectedType}
            onValueChange={handleTypeChange}
            data-type-root
            className="w-fit"
          >
            {PROGRAM_TYPES.map((t) => (
              <ToggleGroupItem
                key={t}
                value={t}
                aria-label={PROGRAM_TYPE_LABELS[t]}
              >
                {PROGRAM_TYPE_LABELS[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {state?.fieldErrors?.type && (
            <p className="text-sm text-destructive">{state.fieldErrors.type}</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Label>{selectedType === "performance" ? "曲目" : "タイトル"}</Label>
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
                    aria-label="上に移動"
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
                    aria-label="下に移動"
                  >
                    <ArrowDown size={12} />
                  </Button>
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1">
                <Input
                  data-piece-title
                  placeholder={
                    selectedType === "performance" ? "曲名" : "タイトル"
                  }
                  value={piece.title}
                  onChange={(e) => updatePiece(i, "title", e.target.value)}
                  required
                  aria-invalid={i === 0 && piecesError ? true : undefined}
                  aria-describedby={
                    i === 0 && piecesError ? piecesErrorId : undefined
                  }
                />
                {selectedType === "performance" && (
                  <Input
                    placeholder="作曲者・作詞者・編曲者など"
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
                  aria-label="この曲を削除"
                >
                  <Trash size={14} />
                </Button>
              )}
            </div>
          ))}
          {piecesError && (
            <p id={piecesErrorId} className="text-sm text-destructive">
              {piecesError}
            </p>
          )}
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

        {selectedType === "performance" && (
          <div className="flex flex-col gap-2">
            <Label>出演者</Label>
            <div
              data-performers-root
              tabIndex={-1}
              className="flex flex-wrap gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-describedby={performersError ? performersErrorId : undefined}
            >
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
            {performersError && (
              <p id={performersErrorId} className="text-sm text-destructive">
                {performersError}
              </p>
            )}
          </div>
        )}

        {!detailOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDetailOpen(true)}
            className="w-fit text-muted-foreground"
          >
            ＋ 詳細（時刻・所要時間・備考）を追加
          </Button>
        ) : (
          <div className="flex flex-col gap-4 rounded-md border border-border/60 bg-muted/20 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={durationId}>
                  所要時間（分）
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    任意
                  </span>
                </Label>
                <Input
                  id={durationId}
                  name="estimatedDuration"
                  type="number"
                  min={1}
                  max={999}
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={timeId}>
                  予定時刻
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    任意
                  </span>
                </Label>
                <Input
                  id={timeId}
                  name="scheduledTime"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={noteId}>
                備考
                <span className="text-muted-foreground ml-1 text-xs font-normal">
                  任意
                </span>
              </Label>
              <Textarea
                id={noteId}
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDetailOpen(false)}
              className="w-fit text-muted-foreground"
            >
              詳細を閉じる
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={isPending} className="tracking-wider">
            {isPending
              ? mode === "add"
                ? "追加中..."
                : "更新中..."
              : mode === "add"
                ? "プログラムを追加"
                : "プログラムを更新"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function findErrorElement(
  form: HTMLFormElement,
  key: FieldKey,
): HTMLElement | null {
  if (key === "pieces") {
    return form.querySelector<HTMLInputElement>("input[data-piece-title]");
  }
  if (key === "performerIds") {
    return form.querySelector<HTMLElement>("[data-performers-root]");
  }
  if (key === "type") {
    return form.querySelector<HTMLElement>("[data-type-root]");
  }
  return form.querySelector<HTMLElement>(`[name="${key}"]`);
}
