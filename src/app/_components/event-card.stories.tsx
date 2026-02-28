import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EventCard } from "./event-card";

const meta = {
  component: EventCard,
} satisfies Meta<typeof EventCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseEvent = {
  id: "event-1",
  name: "春のピアノ発表会",
  startDatetime: "2026-04-15T14:00",
  venue: "○○市民ホール",
  status: "draft" as const,
  role: "organizer" as const,
};

export const Default: Story = {
  args: { event: baseEvent },
};

export const Published: Story = {
  args: { event: { ...baseEvent, status: "published" } },
};

export const Ongoing: Story = {
  args: { event: { ...baseEvent, status: "ongoing" } },
};

export const Finished: Story = {
  args: { event: { ...baseEvent, status: "finished" } },
};

export const LongName: Story = {
  args: {
    event: {
      ...baseEvent,
      name: "第25回 全日本ピアノコンクール入賞者記念ガラコンサート 〜春の調べ〜",
    },
  },
};
