import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { Pill } from "./Pill";

const meta = {
  component: Pill,
  tags: ["ai-generated"],
  args: { children: "Movies", onClick: fn() },
} satisfies Meta<typeof Pill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Movies" }),
    );
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const Active: Story = { args: { active: true } };
export const LongLabel: Story = {
  args: { children: "Science fiction & fantasy" },
};
