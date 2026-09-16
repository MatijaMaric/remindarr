import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import NotificationModePicker from "./NotificationModePicker";

const meta = {
  component: NotificationModePicker,
  tags: ["ai-generated"],
  args: { titleId: "storybook-title", currentMode: "all", onModeChange: fn() },
} satisfies Meta<typeof NotificationModePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllEpisodes: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const muted = await canvas.findByRole("button", { name: "Muted" });
    await userEvent.click(muted);
    await waitFor(() => expect(args.onModeChange).toHaveBeenCalledWith("none"));
    await expect(muted).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.getByRole("button", { name: "All episodes" }),
    ).toHaveAttribute("aria-pressed", "false");
  },
};
export const PremieresOnly: Story = { args: { currentMode: "premieres_only" } };
export const Snoozed: Story = {
  args: { currentMode: "none", snoozeUntil: "2026-10-01T00:00:00Z" },
};
export const UpcomingRelease: Story = {
  args: { releaseDate: "2026-10-01", remindOnRelease: true },
};
