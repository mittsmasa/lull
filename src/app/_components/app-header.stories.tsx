import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useLayoutEffect } from "react";
import { AppHeader } from "./app-header";
import { HeaderConfigProvider, useHeaderConfig } from "./header-config";

const meta = {
  component: AppHeader,
  decorators: [
    (Story) => (
      <HeaderConfigProvider>
        <Story />
      </HeaderConfigProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
  },
} satisfies Meta<typeof AppHeader>;

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

export const WithBackButton: Story = {
  decorators: [
    (Story) => (
      <HeaderConfigProvider>
        <WithBackButtonSetup />
        <Story />
      </HeaderConfigProvider>
    ),
  ],
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/events/new",
      },
    },
  },
};

// ストーリー内で HeaderConfig の効果を再現するヘルパー
function WithBackButtonSetup() {
  const { setShowBackButton } = useHeaderConfig();
  useLayoutEffect(() => {
    setShowBackButton(true);
  }, [setShowBackButton]);
  return null;
}
