import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { PageHeader } from "./PageHeader";
import { Pill } from "./Pill";

const meta = {
  component: PageHeader,
  tags: ["ai-generated"],
  args: { kicker: "Your collection", title: "Watchlist" },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithFilters: Story = {
  args: {
    right: (
      <>
        <Pill active>All</Pill>
        <Pill>Movies</Pill>
        <Pill>TV shows</Pill>
      </>
    ),
  },
};
export const CssCheck: Story = {
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole("heading", { name: "Watchlist" });
    // PageHeader uses font-extrabold; root CSS supplies Plus Jakarta Sans.
    await expect(getComputedStyle(heading).fontWeight).toBe("800");
    await expect(getComputedStyle(heading).fontFamily).toContain(
      "Plus Jakarta Sans Variable",
    );
  },
};
