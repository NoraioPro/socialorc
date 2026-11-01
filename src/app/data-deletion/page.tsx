import type { Metadata } from "next";

import {
  H2,
  LegalPage,
  LI,
  LEGAL_CONTACT_EMAIL,
  P,
  UL,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Data deletion · SocialOrk",
  description:
    "How to delete the data SocialOrk holds about you, including data received from Facebook and Instagram, and what happens after you ask.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data deletion"
      intro="You can delete everything SocialOrk holds about you. This page is the instruction Meta requires from every app that receives Facebook or Instagram data, and it applies to all accounts you connected — Facebook, Instagram, LinkedIn, X, YouTube, TikTok and Telegram."
    >
      <H2>1. Fastest route: disconnect the account yourself</H2>
      <P>
        Sign in to SocialOrk, open <strong>Settings → Connections</strong>, and
        press <strong>Disconnect</strong> next to the account. This happens
        immediately:
      </P>
      <UL>
        <LI>the stored access and refresh tokens for that account are removed;</LI>
        <LI>
          the authorisation is revoked at the network where the network supports
          revocation, so SocialOrk can no longer post as that account;
        </LI>
        <LI>
          the account disappears from your workspace and from everyone
          else&apos;s view of it.
        </LI>
      </UL>
      <P>
        Posts you already published on the network are not removed by this — they
        belong to that platform now, and you delete them there.
      </P>

      <H2>2. Delete everything: one request</H2>
      <P>
        To remove all data associated with you — profile, connected accounts,
        drafts, scheduled posts, media and audit records — email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#1b1b1f" }}>
          {LEGAL_CONTACT_EMAIL}
        </a>{" "}
        from the address on the account, with the subject{" "}
        <strong>“Data deletion request”</strong>.
      </P>
      <P>In the message, include either:</P>
      <UL>
        <LI>the email address of your SocialOrk account, or</LI>
        <LI>
          the Facebook or Instagram account you connected (the username is
          enough), if you are asking about data received from Meta.
        </LI>
      </UL>

      <H2>3. What happens next</H2>
      <UL>
        <LI>
          <strong>Within 7 days</strong> we confirm that we received the request
          and what it covers.
        </LI>
        <LI>
          <strong>Within 30 days</strong> the data is deleted from the live
          database and from backups as they rotate. We email you when it is done.
        </LI>
        <LI>
          If we cannot verify that the request comes from the account holder, we
          will ask for the minimum extra proof needed, and say why.
        </LI>
      </UL>
      <P>
        We keep two things after a deletion request, only as long as the law
        requires: invoicing records where a paid plan existed, and the minimum
        record of the deletion request itself so we can show it was honoured.
      </P>

      <H2>4. If you signed in with Facebook</H2>
      <P>
        Signing in with Facebook gives SocialOrk your name, email and profile
        image — nothing more. Deleting your SocialOrk account removes that record
        along with everything else. You can also remove SocialOrk&apos;s access
        from the Facebook side, at{" "}
        <em>Facebook → Settings &amp; privacy → Settings → Apps and websites</em>
        ; removing it there stops any further access, and a deletion request to us
        removes what was already stored.
      </P>

      <H2>5. Questions</H2>
      <P>
        Write to{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#1b1b1f" }}>
          {LEGAL_CONTACT_EMAIL}
        </a>
        . Our full data practices are described in the{" "}
        <a href="/privacy" style={{ color: "#1b1b1f" }}>
          Privacy Policy
        </a>
        .
      </P>
    </LegalPage>
  );
}
