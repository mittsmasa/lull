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

type ResponsiveModalSize = "sm" | "md";

const desktopSizeClass: Record<ResponsiveModalSize, string> = {
  sm: "sm:max-w-md",
  md: "",
};

type ResponsiveModalContextValue = {
  isDesktop: boolean;
  size: ResponsiveModalSize;
};

const ResponsiveModalContext =
  createContext<ResponsiveModalContextValue | null>(null);

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
  size = "md",
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  size?: ResponsiveModalSize;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const Root = isDesktop ? Dialog : Sheet;
  return (
    <ResponsiveModalContext.Provider value={{ isDesktop, size }}>
      <Root {...props}>{children}</Root>
    </ResponsiveModalContext.Provider>
  );
}

type WithoutClassName<T> = Omit<T, "className">;

function ResponsiveModalTrigger(
  props: WithoutClassName<React.ComponentProps<typeof DialogTrigger>>,
) {
  const { isDesktop } = useResponsiveModalContext();
  const Trigger = isDesktop ? DialogTrigger : SheetTrigger;
  return <Trigger {...props} />;
}

function ResponsiveModalClose(
  props: WithoutClassName<React.ComponentProps<typeof DialogClose>>,
) {
  const { isDesktop } = useResponsiveModalContext();
  const Close = isDesktop ? DialogClose : SheetClose;
  return <Close {...props} />;
}

function ResponsiveModalContent({
  onOpenAutoFocus,
  children,
  ...props
}: WithoutClassName<React.ComponentProps<typeof DialogContent>>) {
  const { isDesktop, size } = useResponsiveModalContext();
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
        className={cn("max-h-[85dvh] overflow-y-auto", desktopSizeClass[size])}
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
      className="max-h-[85dvh] overflow-y-auto rounded-t-lg p-6"
      onOpenAutoFocus={handleOpenAutoFocus}
      {...props}
    >
      {children}
    </SheetContent>
  );
}

function ResponsiveModalHeader(
  props: WithoutClassName<React.ComponentProps<"div">>,
) {
  const { isDesktop } = useResponsiveModalContext();
  if (isDesktop) {
    return <DialogHeader {...props} />;
  }
  return <SheetHeader className="p-0" {...props} />;
}

function ResponsiveModalFooter(
  props: WithoutClassName<React.ComponentProps<"div">>,
) {
  const { isDesktop } = useResponsiveModalContext();
  if (isDesktop) {
    return <DialogFooter {...props} />;
  }
  return <SheetFooter className="mt-auto p-0" {...props} />;
}

function ResponsiveModalTitle(
  props: WithoutClassName<React.ComponentProps<typeof DialogTitle>>,
) {
  const { isDesktop } = useResponsiveModalContext();
  const Title = isDesktop ? DialogTitle : SheetTitle;
  return <Title {...props} />;
}

function ResponsiveModalDescription(
  props: WithoutClassName<React.ComponentProps<typeof DialogDescription>>,
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
