import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SignInButton } from "./sign-in-button";

const meta = {
  component: SignInButton,
} satisfies Meta<typeof SignInButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
