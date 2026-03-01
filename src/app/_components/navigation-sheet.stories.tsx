import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NavigationSheet } from "./navigation-sheet";

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

export const EventsNewActive: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/events/new",
      },
    },
  },
};
