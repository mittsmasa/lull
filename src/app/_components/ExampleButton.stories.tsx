import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ExampleButton } from "./ExampleButton";

const meta = {
  title: "Example/ExampleButton",
  component: ExampleButton,
  tags: ["autodocs"],
} satisfies Meta<typeof ExampleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    label: "Primary Button",
    variant: "primary",
  },
};

export const Secondary: Story = {
  args: {
    label: "Secondary Button",
    variant: "secondary",
  },
};
