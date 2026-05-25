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

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <PageHeader kicker={t("legal.kicker")} title={t("privacy.title")} />

      <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
        <p className="text-zinc-400">Last updated: May 25, 2026</p>

        <p className="rounded-lg border border-white/[0.08] bg-zinc-900/50 p-4 text-zinc-400">
          Remindarr is open-source software. This policy applies to the official
          instance hosted at{" "}
          <a
            href="https://remindarr.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
          >
            remindarr.app
          </a>
          . If you use a self-hosted instance operated by someone else, that
          operator is the data controller and their own privacy policy applies.
        </p>

        <p>
          This Privacy Policy describes how Remindarr (&quot;we&quot;,
          &quot;us&quot;, the &quot;operator&quot;) handles information when you
          use the Remindarr service (the &quot;Service&quot;). If you do not
          agree with this policy, please do not use the Service.
        </p>

        <Section title="Information we collect">
          <p>We collect the information needed to operate the Service:</p>
          <ul className="list-disc space-y-1 pl-5 marker:text-zinc-600">
            <li>
              <strong>Account information:</strong> your username, optional
              display name, and email address if you provide one. Depending on
              how you sign in, we store either a hashed password, an identifier
              from your single sign-on (OIDC) provider, or a passkey (WebAuthn)
              credential. We never store plaintext passwords.
            </li>
            <li>
              <strong>Activity you create:</strong> the titles you track, your
              watch history, ratings, tags, watchlist status, and similar
              activity you record in the app.
            </li>
            <li>
              <strong>Preferences and settings:</strong> appearance, homepage
              layout, notification preferences, and other configuration you
              choose.
            </li>
            <li>
              <strong>Notifications:</strong> if you enable browser push
              notifications, we store the push subscription required to deliver
              them.
            </li>
            <li>
              <strong>Invitations:</strong> invitations you create or accept to
              join the Service.
            </li>
            <li>
              <strong>Technical data:</strong> basic logs and request metadata
              (such as IP address and browser user-agent) that are generated as
              part of normal operation and used for security and debugging.
            </li>
          </ul>
        </Section>

        <Section title="Third-party data and services">
          <p>
            Title, season, episode, and person metadata shown in the Service is
            sourced from{" "}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              The Movie Database (TMDB)
            </a>
            . Your use of that content is also subject to TMDB&apos;s terms and
            privacy policy. This product uses the TMDB API but is not endorsed
            or certified by TMDB.
          </p>
          <p>
            If you configure outbound notification channels (for example
            Discord, Telegram, or Gotify), the information you choose to send is
            transmitted to those third-party services only when you enable them,
            and is then governed by their respective policies.
          </p>
        </Section>

        <Section title="How we use information">
          <p>We use the information we collect to:</p>
          <ul className="list-disc space-y-1 pl-5 marker:text-zinc-600">
            <li>provide, maintain, and secure the Service;</li>
            <li>
              remember the titles you track and deliver the release reminders
              and notifications you request;
            </li>
            <li>personalize discovery, recommendations, and statistics;</li>
            <li>diagnose problems and prevent abuse.</li>
          </ul>
        </Section>

        <Section title="How information is shared">
          <p>
            We do not sell your personal information. Information is only
            exposed to others in the ways you choose:
          </p>
          <ul className="list-disc space-y-1 pl-5 marker:text-zinc-600">
            <li>
              Your public profile and achievements are visible to others
              according to the visibility settings you control.
            </li>
            <li>
              Share links and kiosk links expose only the data you explicitly
              opt into sharing, to anyone who has the link.
            </li>
            <li>
              We may disclose information if required to do so by law, or to
              protect the rights, safety, and integrity of the Service.
            </li>
          </ul>
        </Section>

        <Section title="Data retention and deletion">
          <p>
            We retain your information for as long as your account exists. You
            can delete your account, which removes your associated data, subject
            to backups and legal obligations. For deletion requests or
            questions, contact the operator using the details below.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Authentication is handled with industry-standard libraries, and
            credentials are stored in hashed or tokenized form. No method of
            transmission or storage is completely secure, but we take reasonable
            measures to protect your information.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The Service is not directed to children under the age required by
            applicable law in your jurisdiction, and we do not knowingly collect
            information from them.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. Material
            changes will be reflected by updating the &quot;last updated&quot;
            date above.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy can be directed to us at{" "}
            <a
              href="mailto:privacy@remindarr.app"
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              privacy@remindarr.app
            </a>
            .
          </p>
        </Section>

        <p className="text-zinc-400">
          See also our{" "}
          <Link
            to="/terms"
            className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
          >
            {t("terms.title")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
