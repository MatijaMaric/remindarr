import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { Button } from "./button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "./alert-dialog";

const meta = {
  component: AlertDialog,
  tags: ["ai-generated"],
  render: (args) => (
    <AlertDialog {...args}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Remove from watchlist
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogTitle>Remove this title?</AlertDialogTitle>
        <AlertDialogDescription>
          You can add it to your watchlist again later.
        </AlertDialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <AlertDialogClose render={<Button variant="outline" />}>
            Cancel
          </AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" />}>
            Remove
          </AlertDialogClose>
        </div>
      </AlertDialogPopup>
    </AlertDialog>
  ),
} satisfies Meta<typeof AlertDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
export const CancelRemoval: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Remove from watchlist" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("alertdialog", {
      name: "Remove this title?",
    });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(body.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  },
};
