import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NavigationSheet } from "./navigation-sheet";

const allStatusEvents = [
  { id: "evt-draft", name: "下書きの発表会", status: "draft" as const },
  { id: "evt-published", name: "夏のリサイタル", status: "published" as const },
  { id: "evt-ongoing", name: "本番進行中の会", status: "ongoing" as const },
  { id: "evt-finished", name: "去年の発表会", status: "finished" as const },
];

const meta = {
  component: NavigationSheet,
  args: {
    open: true,
    onOpenChange: () => {},
  },
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
  },
} satisfies Meta<typeof NavigationSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/dashboard",
      },
    },
  },
};

export const AllStatuses: Story = {
  args: {
    events: allStatusEvents,
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/dashboard",
      },
    },
  },
};

export const SubPageActive: Story = {
  args: {
    events: [
      { id: "evt-ongoing", name: "本番進行中の会", status: "ongoing" as const },
    ],
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/events/evt-ongoing/programs",
      },
    },
  },
};
