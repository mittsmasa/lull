import type { Preview } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import "../src/app/globals.css";
import { notoSerifJP, shipporiMincho } from "../src/lib/fonts";

const WithFontVariables = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    document.body.classList.add(notoSerifJP.variable, shipporiMincho.variable);
    return () => {
      document.body.classList.remove(
        notoSerifJP.variable,
        shipporiMincho.variable,
      );
    };
  }, []);

  return <>{children}</>;
};

const preview: Preview = {
  decorators: [
    (Story) => (
      <WithFontVariables>
        <div className="font-sans">
          <Story />
        </div>
      </WithFontVariables>
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
