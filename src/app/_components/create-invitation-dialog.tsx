"use client";

import { Plus } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { createGuestInvitation } from "@/app/(main)/events/[eventId]/invitations/_actions";
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
import { formatGuestInvitationCopy } from "@/lib/invitation-copy";
import { buildShareUrl } from "@/lib/share-url";

type Props = {
  eventId: string;
};

export function CreateInvitationDialog({ eventId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // iOS Safari のクリップボードは user gesture 直下での呼び出しを要求するため、
  // onSubmit から直接 copyTextFromPromise を呼んで gesture を維持する。
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const guestName = (formData.get("guestName") as string | null) || undefined;

    setIsPending(true);
    try {
      await copyTextFromPromise(async () => {
        const result = await createGuestInvitation(eventId, guestName);
        if ("error" in result) {
          throw new Error(result.error);
        }
        const url = buildShareUrl(`/i/${result.token}`);
        return formatGuestInvitationCopy({
          url,
          guestName: guestName ?? null,
          status: "pending",
        });
      });
      toast.success("招待リンクをコピーしました");
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
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalTrigger asChild>
        <Button
          type="button"
          className="min-h-[44px] w-full gap-2 sm:w-auto"
          size="lg"
        >
          <Plus className="size-4" aria-hidden />
          ゲストを招待
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent className="sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>ゲストを招待</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            名前未設定でも発行できます。発行と同時に招待文がコピーされます。
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="inviteGuestName">ゲスト名（任意）</Label>
            <Input
              type="text"
              id="inviteGuestName"
              name="guestName"
              maxLength={100}
              placeholder="ゲスト名（任意）"
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
