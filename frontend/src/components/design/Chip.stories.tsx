import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "./Chip";

const meta = {
  component: Chip,
  tags: ["ai-generated"],
  args: { children: "TV Series" },
} satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Highlighted: Story = {
  args: { variant: "amber", children: "New episode" },
};
export const Outline: Story = { args: { variant: "outline" } };
