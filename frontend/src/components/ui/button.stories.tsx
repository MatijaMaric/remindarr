import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { Button } from "./button";

const meta = {
  component: Button,
  tags: ["ai-generated"],
  args: { children: "Track title", onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Track title" }),
    );
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const Outline: Story = { args: { variant: "outline" } };
export const Destructive: Story = {
  args: { variant: "destructive", children: "Remove title" },
};
export const Disabled: Story = { args: { disabled: true } };
