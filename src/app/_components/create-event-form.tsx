"use client";

import { useActionState } from "react";
import { type CreateEventState, createEvent } from "@/app/events/_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateEventForm() {
  const [state, formAction, isPending] = useActionState<
    CreateEventState,
    FormData
  >(createEvent, null);

  const f = state?.fields;

  return (
    <form
      action={formAction}
      className="rounded-sm border bg-card p-8 space-y-6"
    >
      {state?.error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">イベント名</Label>
        <Input
          type="text"
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={f?.name}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">開催日</Label>
          <Input
            type="date"
            id="date"
            name="date"
            required
            defaultValue={f?.date}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="startTime">開演時刻</Label>
          <Input
            type="time"
            id="startTime"
            name="startTime"
            required
            defaultValue={f?.startTime}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="openTime">開場時刻（任意）</Label>
        <Input
          type="time"
          id="openTime"
          name="openTime"
          defaultValue={f?.openTime}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="venue">会場</Label>
        <Input
          type="text"
          id="venue"
          name="venue"
          required
          maxLength={200}
          defaultValue={f?.venue}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="totalSeats">座席数（0 = 無制限）</Label>
        <Input
          type="number"
          id="totalSeats"
          name="totalSeats"
          required
          min={0}
          max={9999}
          defaultValue={f?.totalSeats}
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "作成中..." : "イベントを作成"}
      </Button>
    </form>
  );
}
