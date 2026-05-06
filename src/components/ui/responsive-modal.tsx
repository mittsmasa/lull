"use client";

import type * as React from "react";
import { createContext, useContext } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const ResponsiveModalContext = createContext<{ isDesktop: boolean } | null>(
  null,
);

function useResponsiveModalContext() {
  const ctx = useContext(ResponsiveModalContext);
  if (!ctx) {
    throw new Error(
      "ResponsiveModal subcomponents must be used within <ResponsiveModal>",
    );
  }
  return ctx;
}

function ResponsiveModal({
  children,
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const Root = isDesktop ? Dialog : Sheet;
  return (
    <ResponsiveModalContext.Provider value={{ isDesktop }}>
      <Root {...props}>{children}</Root>
    </ResponsiveModalContext.Provider>
  );
}

function ResponsiveModalTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  const { isDesktop } = useResponsiveModalContext();
  const Trigger = isDesktop ? DialogTrigger : SheetTrigger;
  return <Trigger {...props} />;
}

function ResponsiveModalClose(props: React.ComponentProps<typeof DialogClose>) {
  const { isDesktop } = useResponsiveModalContext();
  const Close = isDesktop ? DialogClose : SheetClose;
  return <Close {...props} />;
}

function ResponsiveModalContent({
  className,
  onOpenAutoFocus,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const { isDesktop } = useResponsiveModalContext();
  const handleOpenAutoFocus = (event: Event) => {
    if (onOpenAutoFocus) {
      onOpenAutoFocus(event);
    } else {
      event.preventDefault();
    }
  };

  if (isDesktop) {
    return (
      <DialogContent
        className={cn("max-h-[85dvh] overflow-y-auto", className)}
        onOpenAutoFocus={handleOpenAutoFocus}
        {...props}
      >
        {children}
      </DialogContent>
    );
  }

  return (
    <SheetContent
      side="bottom"
      className={cn(
        "max-h-[85dvh] overflow-y-auto rounded-t-lg p-6",
        className,
      )}
      onOpenAutoFocus={handleOpenAutoFocus}
      {...props}
    >
      {children}
    </SheetContent>
  );
}

function ResponsiveModalHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { isDesktop } = useResponsiveModalContext();
  if (isDesktop) {
    return <DialogHeader className={className} {...props} />;
  }
  return <SheetHeader className={cn("p-0", className)} {...props} />;
}

function ResponsiveModalFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  const { isDesktop } = useResponsiveModalContext();
  if (isDesktop) {
    return <DialogFooter className={className} {...props} />;
  }
  return <SheetFooter className={cn("mt-auto p-0", className)} {...props} />;
}

function ResponsiveModalTitle(props: React.ComponentProps<typeof DialogTitle>) {
  const { isDesktop } = useResponsiveModalContext();
  const Title = isDesktop ? DialogTitle : SheetTitle;
  return <Title {...props} />;
}

function ResponsiveModalDescription(
  props: React.ComponentProps<typeof DialogDescription>,
) {
  const { isDesktop } = useResponsiveModalContext();
  const Description = isDesktop ? DialogDescription : SheetDescription;
  return <Description {...props} />;
}

export {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
};
