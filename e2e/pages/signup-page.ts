import { type Locator } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * SignupPage — wraps /signup.
 *
 * Non-DOM note: the submit button renders "Sign Up" at rest and
 * "Creating account..." while the request is in-flight (both driven by i18n
 * keys signup.signUp / signup.creating). There is no role="alert" on the error
 * banner — it is a plain styled <div>; use the `errorBanner` locator which
 * matches by text content presence.
 */
export class SignupPage extends BasePage {
  // ── form fields ────────────────────────────────────────────────────────────
  get usernameField(): Locator {
    return this.page.getByLabel("Username");
  }

  get emailField(): Locator {
    return this.page.getByLabel("Email");
  }

  get displayNameField(): Locator {
    return this.page.getByLabel("Display Name");
  }

  get passwordField(): Locator {
    return this.page.getByLabel("Password", { exact: true });
  }

  // ── buttons / links ────────────────────────────────────────────────────────
  /** The submit button at rest (text: "Sign Up"). */
  get submitButton(): Locator {
    return this.page.getByRole("button", { name: /sign up/i });
  }

  /**
   * The submit button while the request is in-flight (text: "Creating account...").
   * Playwright's getByRole performs a text match, so this locator is only
   * resolvable while loading is true.
   */
  get loadingButton(): Locator {
    return this.page.getByRole("button", { name: /creating account/i });
  }

  /**
   * "Sign in" link at the bottom of the signup form.
   * Uses exact match on "Sign in" (lowercase i) to distinguish from the
   * navbar "Sign In" link (capital I) which Tailwind renders as uppercase.
   */
  get signInLink(): Locator {
    return this.page.getByRole("link", { name: "Sign in", exact: true });
  }

  // ── error banner ───────────────────────────────────────────────────────────
  /**
   * The red error banner that appears when the server rejects the request.
   * The element is a plain <div> (no ARIA role) styled with bg-red-900/50;
   * locate it via its sibling container relationship to the form.
   */
  get errorBanner(): Locator {
    return this.page.locator(".bg-red-900\\/50");
  }

  // ── navigation ─────────────────────────────────────────────────────────────
  async gotoSignup(): Promise<void> {
    await this.goto("/signup");
  }

  // ── composite actions ──────────────────────────────────────────────────────
  async fillForm(fields: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<void> {
    await this.usernameField.fill(fields.username);
    await this.emailField.fill(fields.email);
    if (fields.displayName !== undefined) {
      await this.displayNameField.fill(fields.displayName);
    }
    await this.passwordField.fill(fields.password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
