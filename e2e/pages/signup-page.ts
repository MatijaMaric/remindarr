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
   * The form link reads "Sign In" (signup.signIn); scoped to <main> so a nav
   * sign-in link, if the signed-out shell shows one again, can't match.
   */
  get signInLink(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("link", { name: /^sign in$/i });
  }

  // ── error banner ───────────────────────────────────────────────────────────
  /**
   * The error banner that appears when the server rejects the request. It is
   * a plain <div> (no ARIA role) and SignupPage shows no toast, so the server
   * message inside <main> identifies it.
   */
  errorBanner(message: string | RegExp): Locator {
    return this.page.getByRole("main").getByText(message);
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
