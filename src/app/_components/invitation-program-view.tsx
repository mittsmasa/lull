"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PROGRAM_TYPE_LABELS } from "@/db/schema";
import type { ProgramWithPerformers } from "@/lib/queries/programs";
import { cn } from "@/lib/utils";

type InvitationProgramViewProps = {
  programs: ProgramWithPerformers[];
};

export function InvitationProgramView({
  programs,
}: InvitationProgramViewProps) {
  if (programs.length === 0) return null;

  let performanceIndex = 0;
  const performanceCount = programs.filter(
    (p) => p.type === "performance",
  ).length;

  return (
    <section className="border-t border-border/50 pt-2">
      <Accordion type="single" collapsible defaultValue="program">
        <AccordionItem value="program" className="border-b-0">
          <AccordionTrigger className="py-4 hover:no-underline [&>svg]:text-muted-foreground">
            <div className="flex items-baseline gap-3">
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Program
              </span>
              <span className="text-xs tabular-nums text-muted-foreground/70">
                全{performanceCount}演目
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <ol className="flex flex-col divide-y divide-border/30 overflow-hidden rounded-md border border-border/40">
              {programs.map((program) => {
                const isPerformance = program.type === "performance";
                if (isPerformance) performanceIndex += 1;
                const timeLabel = program.scheduledTime ?? null;

                return (
                  <li
                    key={program.id}
                    className={cn(
                      "flex items-start gap-3 px-3 py-3",
                      !isPerformance && "bg-muted/30",
                    )}
                  >
                    <span className="w-12 shrink-0">
                      {isPerformance ? (
                        <span className="mt-0.5 block text-sm font-medium tabular-nums text-muted-foreground">
                          {performanceIndex}.
                        </span>
                      ) : program.type === "other" ? null : (
                        <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {PROGRAM_TYPE_LABELS[program.type]}
                        </span>
                      )}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {isPerformance ? (
                        <>
                          {program.performers.length > 0 && (
                            <span className="min-w-0 font-medium">
                              {program.performers
                                .map((p) => p.displayName)
                                .join("、")}
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
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {program.pieces[0]?.title ??
                            PROGRAM_TYPE_LABELS[program.type]}
                        </span>
                      )}
                    </div>

                    {timeLabel && (
                      <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {timeLabel}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
