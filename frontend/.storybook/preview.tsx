import type { Preview } from "@storybook/react-vite";
import { BrowserRouter } from "react-router";
import { Toaster, toast } from "sonner";
import MockDate from "mockdate";
import { mswLoader } from "msw-storybook-addon/csf3";
import { AuthProvider } from "../src/context/AuthContext";
import ErrorBoundary from "../src/components/ErrorBoundary";
import { createMswHandlers } from "./msw-handlers";
import "../src/i18n";
import "../src/index.css";

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <BrowserRouter key={context.id}>
        <ErrorBoundary>
          <AuthProvider>
            <Story />
            <Toaster theme="dark" />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    ),
  ],
  loaders: [mswLoader()],
  async beforeEach({ msw }) {
    msw.use(...createMswHandlers());
    toast.dismiss();
    const previousTheme = localStorage.getItem("remindarr-theme");
    localStorage.setItem("remindarr-theme", "dark");
    document.documentElement.classList.add("theme-dark", "dark");
    MockDate.set("2026-09-16T12:00:00Z");
    return () => {
      toast.dismiss();
      MockDate.reset();
      document.documentElement.classList.remove("theme-dark", "dark");
      if (previousTheme === null) localStorage.removeItem("remindarr-theme");
      else localStorage.setItem("remindarr-theme", previousTheme);
    };
  },
  parameters: {
    layout: "padded",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
};

export default preview;
