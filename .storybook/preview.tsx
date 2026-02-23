import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";
import { notoSerifJP, shipporiMincho } from "../src/lib/fonts";

const preview: Preview = {
  decorators: [
    (Story) => (
      <div
        className={`${notoSerifJP.variable} ${shipporiMincho.variable} font-sans`}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "todo",
    },
  },
};

export default preview;
