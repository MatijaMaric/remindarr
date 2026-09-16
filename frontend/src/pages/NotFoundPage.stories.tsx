import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import NotFoundPage from "./NotFoundPage";

const meta = {
  component: NotFoundPage,
  tags: ["ai-generated"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotFoundPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Go back home" }),
    ).toHaveAttribute("href", "/");
  },
};
