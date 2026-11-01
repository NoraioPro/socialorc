import type { Metadata } from "next";

import {
  H2,
  LegalPage,
  LI,
  LEGAL_CONTACT_EMAIL,
  P,
  Table,
  UL,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · SocialOrk",
  description:
    "What SocialOrk collects when you connect a social account, why, where it is stored, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="SocialOrk publishes social media content on your behalf. To do that it has to hold your account authorisation and the content you create. This page says exactly what is stored, why, where, and how to get rid of it."
    >
      <H2>1. What we collect</H2>
      <Table
        rows={[
          ["Account", "Your name, email address and password hash (or the identity returned by the sign-in provider you choose)."],
          ["Workspace", "The workspace you create or join, and your role inside it."],
          ["Connected accounts", "For each social account you connect: the platform's user or page id, the username or handle, the profile image, and the permissions that platform granted."],
          ["Authorisation tokens", "The access token — and refresh token where the platform issues one — that lets SocialOrk post as that account. These are encrypted before they are written to the database."],
          ["Content", "The posts, drafts, schedules, media files and comments you create inside SocialOrk."],
          ["Activity", "An audit record of decisions that change what the product does: approvals, rejections, scheduling, publishing, role changes and connection changes, with the acting user and the time."],
          ["Technical", "IP address, browser user agent, and error logs needed to run the service securely."],
          ["Billing", "If you subscribe to a paid plan, the billing details are handled by our payment processor; SocialOrk does not store card numbers."],
        ]}
      />

      <H2>2. Why we process it</H2>
      <UL>
        <LI>
          <strong>To publish</strong> the content you approve, at the time you
          choose, to the accounts you connected.
        </LI>
        <LI>
          <strong>To show you what happened</strong>: publishing history,
          failures, and the audit trail of who approved what.
        </LI>
        <LI>
          <strong>To keep the service secure</strong>: detecting abuse, rate
          limiting, and repairing failures.
        </LI>
        <LI>
          <strong>To answer you</strong> when you write to support.
        </LI>
      </UL>
      <P>
        We do not sell personal data, we do not use your content to train models,
        and we do not publish anything you have not approved or scheduled.
      </P>

      <H2>3. Where it is stored</H2>
      <UL>
        <LI>
          Application data and account records: a managed PostgreSQL database.
        </LI>
        <LI>Media files you upload: object storage.</LI>
        <LI>
          The application itself: a managed hosting platform. All traffic is
          served over HTTPS.
        </LI>
      </UL>
      <P>
        These providers process data on our behalf under their own data
        processing terms. Access to production data is limited to the people who
        operate SocialOrk, and authorisation tokens are encrypted with a key held
        in the application environment — not in the database.
      </P>

      <H2>4. What is shared with the social networks</H2>
      <P>
        When you connect an account, the network receives the information its own
        authorisation screen discloses. When you publish, the network receives
        the post content and media you selected. Each network then processes that
        data under its own privacy policy — we cannot control what it does with it
        beyond what its terms allow.
      </P>
      <P>
        No other third party receives your content or your tokens. SocialOrk does
        not share one customer&apos;s accounts or data with another customer: each
        workspace sees only the accounts connected to it.
      </P>

      <H2>5. How long we keep it</H2>
      <UL>
        <LI>
          <strong>Authorisation tokens</strong>: until you disconnect the account
          or delete your workspace. Disconnecting removes the stored token
          immediately.
        </LI>
        <LI>
          <strong>Posts and media</strong>: until you delete them, or until the
          workspace is deleted.
        </LI>
        <LI>
          <strong>Audit records</strong>: retained while the workspace exists,
          because they are the record of who approved and published what.
        </LI>
        <LI>
          <strong>Technical logs</strong>: a short operational window, then
          discarded.
        </LI>
      </UL>

      <H2>6. Your rights</H2>
      <P>
        You can see, correct, export or delete your data at any time. Inside the
        product you can disconnect any account, delete content, and delete a
        workspace. For a request that covers everything we hold about you — or
        data originating from a Facebook or Instagram account — see{" "}
        <a href="/data-deletion" style={{ color: "#1b1b1f" }}>
          Data deletion
        </a>
        .
      </P>
      <P>
        If you are in the EEA or the UK you also have the right to object to
        processing, to restrict it, and to complain to your data protection
        authority. Write to{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#1b1b1f" }}>
          {LEGAL_CONTACT_EMAIL}
        </a>{" "}
        and we will respond within 30 days.
      </P>

      <H2>7. Cookies</H2>
      <P>
        SocialOrk sets one session cookie, which keeps you signed in, and a short
        lived cookie during the connection flow that protects the OAuth handshake
        against tampering. There is no advertising or cross-site tracking cookie.
      </P>

      <H2>8. Children</H2>
      <P>
        SocialOrk is a business tool and is not intended for anyone under 16. We
        do not knowingly hold data belonging to children; if you believe a child
        has created an account, write to us and we will remove it.
      </P>

      <H2>9. Changes</H2>
      <P>
        If this policy changes in a way that affects what we store or why, we will
        update the date at the top of this page and tell workspace owners by
        email before the change takes effect.
      </P>
    </LegalPage>
  );
}
