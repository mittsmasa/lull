"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvitationItem, SeatSummary } from "@/lib/queries/invitations";

export function SeatSummaryCard({
  seatSummary,
  invitations,
}: {
  seatSummary: SeatSummary;
  invitations: InvitationItem[];
}) {
  const pending = invitations.filter(
    (i) => i.status === "pending" && !i.invalidatedAt,
  ).length;
  const accepted = invitations.filter((i) => i.status === "accepted");
  const acceptedCount =
    accepted.length + accepted.reduce((sum, i) => sum + i.companionCount, 0);
  const declined = invitations.filter((i) => i.status === "declined").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-light tracking-wide">
          招待状況
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">総座席数</p>
            <p className="text-2xl font-light">
              {seatSummary.totalSeats === 0 ? "無制限" : seatSummary.totalSeats}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">残り枠</p>
            <p className="text-2xl font-light">
              {seatSummary.remaining === null ? "-" : seatSummary.remaining}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">回答待ち</p>
            <p className="text-2xl font-light">{pending}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">出席 / 辞退</p>
            <p className="text-2xl font-light">
              {acceptedCount} / {declined}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
