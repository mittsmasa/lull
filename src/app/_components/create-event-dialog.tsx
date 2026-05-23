"use client";

import { Plus } from "@phosphor-icons/react";
import { useActionState, useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type CreateEventState,
  createEvent,
} from "@/app/(main)/events/_actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";
import { VenueField } from "./venue-field";

export function CreateEventDialog() {
  const [open, setOpen] = useState(false);
  const [unlimitedSeats, setUnlimitedSeats] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();
  const dateId = useId();
  const startTimeId = useId();
  const openTimeId = useId();
  const totalSeatsId = useId();
  const unlimitedId = useId();

  const [state, formAction, isPending] = useActionState<
    CreateEventState,
    FormData
  >(async (prevState, formData) => {
    const result = await createEvent(prevState, formData);
    if (result && "event" in result) {
      toast.success("イベントを作成しました");
      formRef.current?.reset();
      setUnlimitedSeats(false);
      setOpen(false);
    } else if (result?.error) {
      toast.error(result.error);
    }
    return result;
  }, null);

  const stateFields = state && "fields" in state ? state.fields : undefined;
  const fieldErrors =
    state && "fieldErrors" in state ? state.fieldErrors : undefined;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      formRef.current?.reset();
      setUnlimitedSeats(false);
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={handleOpenChange}>
      <ResponsiveModalTrigger asChild>
        <Button type="button" className="gap-2 tracking-wider">
          <Plus className="size-4" aria-hidden />
          イベントを作成
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>イベントを作成</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            発表会の基本情報を入力します。あとから編集できます。
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>イベント名</Label>
            <Input
              type="text"
              id={nameId}
              name="name"
              required
              maxLength={100}
              defaultValue={stateFields?.name}
              aria-invalid={fieldErrors?.name ? true : undefined}
            />
            {fieldErrors?.name && (
              <p className="text-destructive text-xs">{fieldErrors.name}</p>
            )}
          </div>

          <VenueField
            defaultVenue={stateFields?.venue}
            defaultAddress={stateFields?.address || null}
            defaultLatitude={
              stateFields?.latitude ? Number(stateFields.latitude) : null
            }
            defaultLongitude={
              stateFields?.longitude ? Number(stateFields.longitude) : null
            }
            venueError={fieldErrors?.venue}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={dateId}>開催日</Label>
              <Input
                type="date"
                id={dateId}
                name="date"
                required
                defaultValue={stateFields?.date}
                aria-invalid={fieldErrors?.date ? true : undefined}
              />
              {fieldErrors?.date && (
                <p className="text-destructive text-xs">{fieldErrors.date}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={startTimeId}>開演時刻</Label>
              <Input
                type="time"
                id={startTimeId}
                name="startTime"
                required
                defaultValue={stateFields?.startTime}
                aria-invalid={fieldErrors?.startTime ? true : undefined}
              />
              {fieldErrors?.startTime && (
                <p className="text-destructive text-xs">
                  {fieldErrors.startTime}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={openTimeId}>開場時刻（任意）</Label>
            <Input
              type="time"
              id={openTimeId}
              name="openTime"
              defaultValue={stateFields?.openTime}
              aria-invalid={fieldErrors?.openTime ? true : undefined}
            />
            {fieldErrors?.openTime && (
              <p className="text-destructive text-xs">{fieldErrors.openTime}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={totalSeatsId}>座席数</Label>
              <label
                htmlFor={unlimitedId}
                className="flex items-center gap-2 text-muted-foreground text-sm"
              >
                <Checkbox
                  id={unlimitedId}
                  checked={unlimitedSeats}
                  onCheckedChange={(checked) =>
                    setUnlimitedSeats(checked === true)
                  }
                />
                座席数を無制限にする
              </label>
            </div>
            {unlimitedSeats ? (
              <input type="hidden" name="totalSeats" value="0" />
            ) : (
              <Input
                type="number"
                id={totalSeatsId}
                name="totalSeats"
                required
                min={1}
                max={9999}
                defaultValue={
                  stateFields?.totalSeats && stateFields.totalSeats !== "0"
                    ? stateFields.totalSeats
                    : undefined
                }
                aria-invalid={fieldErrors?.totalSeats ? true : undefined}
              />
            )}
            {fieldErrors?.totalSeats && (
              <p className="text-destructive text-xs">
                {fieldErrors.totalSeats}
              </p>
            )}
          </div>

          <ResponsiveModalFooter>
            <ResponsiveModalClose asChild>
              <Button
                type="button"
                variant="outline"
                className="tracking-wider"
              >
                キャンセル
              </Button>
            </ResponsiveModalClose>
            <Button
              type="submit"
              disabled={isPending}
              className="tracking-wider"
            >
              {isPending ? "作成中..." : "作成"}
            </Button>
          </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
