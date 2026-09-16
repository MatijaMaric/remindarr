import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import storybookViteConfig from "./.storybook/vite.config";

export default mergeConfig(
  storybookViteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          plugins: [
            storybookTest({
              configDir: fileURLToPath(
                new URL("./.storybook", import.meta.url),
              ),
            }),
          ],
          test: {
            name: "storybook",
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: "chromium" }],
            },
          },
        },
      ],
    },
  }),
);
