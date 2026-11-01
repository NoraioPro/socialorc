import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, H2, LI, LEGAL_CONTACT_EMAIL, P, UL } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "About SocialOrk — what the app does",
  description:
    "SocialOrk is a social media publishing tool. This page explains what it does, which Google data it uses when you connect YouTube, and how that data is handled.",
};

/**
 * The public "what is this app" page.
 *
 * Google's OAuth verification rejected the submission with four content findings
 * at once — home page "behind a login", no stated purpose, a privacy policy with
 * "insufficient content", and no statement about the use of Google APIs. A
 * marketing landing page answers none of those in the words a reviewer looks for,
 * so this page exists to answer them literally and to be the URL handed to the
 * review form.
 */
export default function AboutPage() {
  return (
    <LegalPage
      title="What SocialOrk is"
      intro="SocialOrk is a social media publishing tool for teams and individual creators. This page explains, in plain terms, what the application does and exactly how it uses Google user data when you connect a YouTube channel."
    >
      <H2>1. What the application does</H2>
      <P>
        SocialOrk (also written Social Ork) lets a person or a team write a post once
        and publish it to the social accounts they own — Instagram, Facebook,
        LinkedIn, X, TikTok, YouTube and Telegram. The flow is: write or draft the
        content, review it, approve it, choose when it should go out, and SocialOrk
        sends it to the connected network at that time through the network&apos;s own
        official API.
      </P>
      <P>
        Nothing is published without an explicit approval inside the product, and an
        account is only ever used after its own owner has authorised SocialOrk through
        that provider&apos;s consent screen.
      </P>

      <H2>2. Which Google data SocialOrk requests</H2>
      <P>
        Google is used for one purpose only: publishing videos to a YouTube channel
        that the user connects themselves. SocialOrk requests three scopes, and no
        others:
      </P>
      <UL>
        <LI>
          <strong>youtube.upload</strong> — to upload a video the user created to their
          own channel.
        </LI>
        <LI>
          <strong>youtube.readonly</strong> — to show the user which channel is
          connected and to confirm an upload landed.
        </LI>
        <LI>
          <strong>youtube.force-ssl</strong> — to read back the status of a published
          video so the product can report success or failure accurately.
        </LI>
      </UL>
      <P>
        SocialOrk does not request Gmail, Drive, Calendar, Contacts, or any other
        Google service.
      </P>

      <H2>3. How Google user data is used, stored and shared</H2>
      <UL>
        <LI>
          <strong>Used</strong> to perform the action the user asked for: upload the
          video they selected, to the channel they connected, when they scheduled it.
        </LI>
        <LI>
          <strong>Stored</strong>: the OAuth access token (and refresh token where the
          provider issues one) is encrypted before it is written to our database. Video
          files the user uploads are stored in our object storage only long enough to be
          delivered to YouTube.
        </LI>
        <LI>
          <strong>Not shared</strong>: Google user data is never sold, never shared with
          advertisers or data brokers, and never transferred to another customer. It is
          sent only to Google, as the destination of the action the user requested.
        </LI>
        <LI>
          <strong>Not used for AI</strong>: content and data received through Google
          APIs are never used to train, fine-tune or improve any machine-learning model,
          ours or a third party&apos;s. The product&apos;s AI features write draft text
          from the user&apos;s own brief; they do not read Google user data.
        </LI>
        <LI>
          <strong>Not used for advertising</strong>: no Google user data is used for
          advertising, ad targeting, or retargeting.
        </LI>
      </UL>
      <P>
        SocialOrk&apos;s use and transfer of information received from Google APIs
        adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          style={{ color: "#1b1b1f" }}
          rel="noreferrer"
          target="_blank"
        >
          Google API Services User Data Policy
        </a>
        , including the <strong>Limited Use</strong> requirements. Data received through
        Google APIs is used only to provide or improve the user-facing features
        described on this page.
      </P>

      <H2>4. Human access</H2>
      <P>
        No person at SocialOrk reads a user&apos;s Google data except where the user
        has asked for support with a specific post, or where the law requires it. An
        operator can see that a channel is connected; they cannot see the user&apos;s
        Google password, and tokens are never rendered in the product.
      </P>

      <H2>5. Deleting Google data</H2>
      <P>
        Disconnecting the YouTube channel in{" "}
        <Link href="/data-deletion" style={{ color: "#1b1b1f" }}>
          Settings → Connections
        </Link>{" "}
        removes the stored token immediately, and the user can revoke SocialOrk&apos;s
        access from their Google account at any time at{" "}
        <a
          href="https://myaccount.google.com/permissions"
          style={{ color: "#1b1b1f" }}
          rel="noreferrer"
          target="_blank"
        >
          myaccount.google.com/permissions
        </a>
        . The full procedure, including deleting everything SocialOrk holds, is on the{" "}
        <Link href="/data-deletion" style={{ color: "#1b1b1f" }}>
          data deletion
        </Link>{" "}
        page.
      </P>

      <H2>6. Acceptable use of Google APIs</H2>
      <P>
        SocialOrk uses Google APIs only to publish content its users create and own. It
        does not use Google APIs — and will not permit its features to be used — to
        create or distribute AI-generated non-consensual intimate imagery (AI NCII),
        nor for any purpose prohibited by the Google APIs Terms of Service. Accounts
        found doing so are suspended.
      </P>

      <H2>7. Contact</H2>
      <P>
        Questions about this page, or about a specific account&apos;s data, go to{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#1b1b1f" }}>
          {LEGAL_CONTACT_EMAIL}
        </a>
        . Our data practices in full are in the{" "}
        <Link href="/privacy" style={{ color: "#1b1b1f" }}>
          Privacy Policy
        </Link>
        , and the terms of the service are in the{" "}
        <Link href="/terms" style={{ color: "#1b1b1f" }}>
          Terms of Service
        </Link>
        .
      </P>
    </LegalPage>
  );
}
