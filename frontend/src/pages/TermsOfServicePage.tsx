import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "../components/design";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsOfServicePage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <PageHeader kicker={t("legal.kicker")} title={t("terms.title")} />

      <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
        <p className="text-zinc-400">Last updated: May 25, 2026</p>

        <p className="rounded-lg border border-white/[0.08] bg-zinc-900/50 p-4 text-zinc-400 italic">
          Remindarr is open-source software that anyone can self-host. These
          Terms are a template provided for the operator of this instance. They
          should be reviewed and customized — including the bracketed
          placeholders below and a review with a legal professional — before
          being relied upon for a public deployment.
        </p>

        <Section title="1. Acceptance of terms">
          <p>
            By accessing or using this instance of Remindarr (the
            &quot;Service&quot;), operated by <strong>[Operator Name]</strong>,
            you agree to be bound by these Terms of Service. If you do not
            agree, do not use the Service.
          </p>
        </Section>

        <Section title="2. The service">
          <p>
            Remindarr is an application for tracking streaming media releases.
            It lets you track titles, record watch history and ratings, and
            receive reminders about upcoming releases. Features may change over
            time.
          </p>
        </Section>

        <Section title="3. Accounts">
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity that occurs under your
            account. Notify the operator promptly of any unauthorized use. You
            must provide accurate information and meet any minimum age required
            by applicable law.
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1 pl-5 marker:text-zinc-600">
            <li>use the Service for any unlawful purpose;</li>
            <li>
              attempt to disrupt, overload, scrape, reverse engineer, or gain
              unauthorized access to the Service or its data;
            </li>
            <li>
              upload or share content that is illegal, infringing, or abusive;
            </li>
            <li>interfere with other users&apos; use of the Service.</li>
          </ul>
        </Section>

        <Section title="5. Your content">
          <p>
            You retain ownership of the content you create, such as ratings,
            tags, and profile details. You grant the operator a limited license
            to store, process, and display that content as needed to provide the
            Service, including to other users in accordance with your visibility
            and sharing settings.
          </p>
        </Section>

        <Section title="6. Third-party services">
          <p>
            Title metadata is provided by{" "}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              The Movie Database (TMDB)
            </a>
            . This product uses the TMDB API but is not endorsed or certified by
            TMDB. Any optional notification providers you connect (such as
            Discord, Telegram, or Gotify) are operated by third parties and
            governed by their own terms.
          </p>
        </Section>

        <Section title="7. Disclaimers">
          <p>
            The Service is provided on an &quot;as is&quot; and &quot;as
            available&quot; basis, without warranties of any kind, whether
            express or implied. Because Remindarr is open-source software that
            may be self-hosted, the operator does not guarantee that the Service
            will be uninterrupted, error-free, or that any data will be
            preserved.
          </p>
        </Section>

        <Section title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by law, the operator shall not be
            liable for any indirect, incidental, special, consequential, or
            punitive damages, or any loss of data, arising out of or related to
            your use of the Service.
          </p>
        </Section>

        <Section title="9. Termination">
          <p>
            You may stop using the Service and delete your account at any time.
            The operator may suspend or terminate access to the Service for
            conduct that violates these Terms or that may harm the Service or
            other users.
          </p>
        </Section>

        <Section title="10. Changes to these terms">
          <p>
            We may update these Terms from time to time. Material changes will
            be reflected by updating the &quot;last updated&quot; date above.
            Continued use of the Service after changes take effect constitutes
            acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="11. Governing law">
          <p>
            These Terms are governed by the laws of{" "}
            <strong>[Jurisdiction]</strong>, without regard to its conflict of
            law provisions.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Questions about these Terms can be directed to the operator at{" "}
            <strong>[contact@example.com]</strong>.
          </p>
        </Section>

        <p className="text-zinc-400">
          See also our{" "}
          <Link
            to="/privacy"
            className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
          >
            {t("privacy.title")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
