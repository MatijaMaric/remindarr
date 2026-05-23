import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class KioskPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoKiosk(token: string, display?: string): Promise<void> {
    const query = display ? `?display=${display}` : "";
    await super.goto(`/kiosk/${token}${query}`);
  }

  /**
   * The "Remindarr" wordmark inside the kiosk header. Uses nth(1) because
   * the hidden nav bar also renders a "Remindarr" span that resolves first.
   */
  wordmark() {
    return this.page.getByText("Remindarr", { exact: true }).nth(1);
  }

  errorHeading() {
    return this.page.getByRole("heading", { name: "Kiosk unavailable" });
  }

  fidelityBadge(fidelity: string) {
    return this.page.getByText(`KIOSK · ${fidelity.toUpperCase()}`, {
      exact: true,
    });
  }
}
