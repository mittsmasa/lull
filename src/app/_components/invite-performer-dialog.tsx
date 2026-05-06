"use client";

import { Plus } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { createPerformerInvitation } from "@/app/(main)/events/[eventId]/members/_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";
import { copyTextFromPromise } from "@/lib/clipboard";
import { formatPerformerInvitationCopy } from "@/lib/invitation-copy";
import { buildShareUrl } from "@/lib/share-url";

type Props = {
  eventId: string;
};

export function InvitePerformerDialog({ eventId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // iOS Safari のクリップボードは user gesture 直下での呼び出しを要求するため、
  // onSubmit から直接 copyTextFromPromise を呼んで gesture を維持する。
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = (formData.get("displayName") as string | null) ?? "";

    setIsPending(true);
    try {
      await copyTextFromPromise(async () => {
        const result = await createPerformerInvitation(eventId, null, formData);
        if (!result || "error" in result) {
          throw new Error(result?.error ?? "招待リンクの発行に失敗しました");
        }
        const url = buildShareUrl(`/join/${result.token}`);
        return formatPerformerInvitationCopy({ url, displayName });
      });
      toast.success(
        displayName
          ? `${displayName} さんの招待リンクをコピーしました`
          : "招待リンクをコピーしました",
      );
      formRef.current?.reset();
      setOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "招待リンクの発行に失敗しました";
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen} size="sm">
      <ResponsiveModalTrigger asChild>
        <Button
          type="button"
          className="min-h-[44px] w-full gap-2 sm:w-auto"
          size="lg"
        >
          <Plus className="size-4" aria-hidden />
          出演者を招待
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>出演者を招待</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            表示名を入力してリンクを発行します。発行と同時に招待文がコピーされます。
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="inviteDisplayName">表示名</Label>
            <Input
              type="text"
              id="inviteDisplayName"
              name="displayName"
              required
              maxLength={50}
              placeholder="出演者の表示名を入力"
              className="text-base"
            />
          </div>
          <ResponsiveModalFooter>
            <Button
              type="submit"
              disabled={isPending}
              className="min-h-[44px] w-full sm:w-auto"
            >
              {isPending ? "発行中..." : "発行してコピー"}
            </Button>
          </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
