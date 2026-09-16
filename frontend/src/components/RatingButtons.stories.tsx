import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import RatingButtons from "./RatingButtons";

const meta = {
  component: RatingButtons,
  tags: ["ai-generated"],
  args: { titleId: "unrated" },
} satisfies Meta<typeof RatingButtons>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Unrated: Story = {
  play: async ({ canvas, userEvent }) => {
    const love = await canvas.findByRole("button", { name: "Love" });
    await waitFor(() => expect(love).toBeEnabled());
    await expect(love).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(love);
    await waitFor(() => expect(love).toHaveAttribute("aria-pressed", "true"));
    await userEvent.click(love);
    await waitFor(() => expect(love).toHaveAttribute("aria-pressed", "false"));
  },
};
export const AlreadyRated: Story = { args: { titleId: "rated" } };
export const FriendsRatings: Story = {
  args: { titleId: "friends" },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Friends: alice liked, sam loved"),
    ).toBeVisible();
  },
};
