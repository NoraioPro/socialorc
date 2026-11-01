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
  title: "Terms of Service · SocialOrk",
  description:
    "The terms you agree to when you use SocialOrk to draft, approve, schedule and publish social media content.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms cover your use of SocialOrk — the product that drafts, approves, schedules and publishes social media content to accounts you connect. By creating a workspace or using the product you accept them."
    >
      <H2>1. The service</H2>
      <P>
        SocialOrk lets a team write content once, review and approve it, and
        publish it to social accounts the workspace has connected. Publishing
        happens through each network&apos;s official API, using the authorisation
        the account owner granted.
      </P>

      <H2>2. Accounts and workspaces</H2>
      <UL>
        <LI>
          You must be old enough to hold a social media account and to enter a
          contract, and the details you give us must be accurate.
        </LI>
        <LI>
          A workspace is the boundary: its members share its connected accounts,
          content and audit trail, and cannot see another workspace&apos;s.
        </LI>
        <LI>
          You are responsible for what the people you invite do inside your
          workspace. Roles decide what they can do — approval and scheduling are
          restricted to the roles that hold those permissions.
        </LI>
        <LI>
          Keep your sign-in credentials safe. Tell us immediately if you believe
          an account has been compromised.
        </LI>
      </UL>

      <H2>3. Connecting social accounts</H2>
      <P>
        You may only connect accounts you own or are authorised to manage. When
        you connect an account you authorise SocialOrk to publish to it on your
        instruction. Disconnecting revokes that authorisation and removes the
        stored token.
      </P>
      <P>
        Your use of each network remains governed by that network&apos;s own
        terms and policies. If a network suspends an application, changes its API,
        requires a review that has not been granted, or restricts an account,
        publishing to it can fail or stop — that is outside our control, and we
        will report the platform&apos;s own reason in the product rather than
        pretend the post went out.
      </P>

      <H2>4. Content you own, and the licence you give us</H2>
      <P>
        You keep every right you had in the content you create. You grant
        SocialOrk the limited licence needed to store it, transform it into the
        shape each network requires, and transmit it to the accounts you chose —
        nothing more, and only for as long as you keep it in the product.
      </P>
      <P>
        You confirm that the content you publish does not infringe anyone
        else&apos;s rights and is not unlawful.
      </P>

      <H2>5. Acceptable use</H2>
      <P>You must not use SocialOrk to:</P>
      <UL>
        <LI>publish spam, or content that is illegal, deceptive, or harmful;</LI>
        <LI>
          impersonate a person or organisation, or post to an account you are not
          authorised to manage;
        </LI>
        <LI>
          probe, overload or reverse engineer the service, or attempt to reach
          another workspace&apos;s data;
        </LI>
        <LI>
          resell access to the product without our written agreement.
        </LI>
      </UL>
      <P>
        We may suspend a workspace that breaks these rules, and will say why.
      </P>

      <H2>6. AI-assisted drafting</H2>
      <P>
        Some features generate draft text or images. Drafts are suggestions: a
        person in your workspace approves them before anything is published, and
        you remain responsible for what you approve. Generation runs on a key you
        or your workspace supplied; where no key is present the product says so
        instead of inventing content.
      </P>

      <H2>7. Availability and changes</H2>
      <P>
        We work to keep the service available, but we do not promise uninterrupted
        operation. We may change, deprecate or add features; if a change removes
        something you depend on, we will give notice to workspace owners.
      </P>

      <H2>8. Fees</H2>
      <P>
        Paid plans, their limits and their billing cycle are shown in the product
        before you subscribe. Fees are billed in advance and are not refundable
        for a period already started, except where the law requires it.
      </P>

      <H2>9. Termination</H2>
      <P>
        You can stop using SocialOrk at any time and delete your workspace. We may
        suspend or terminate a workspace that materially breaches these terms or
        is used unlawfully. On termination we delete the workspace&apos;s data
        according to the{" "}
        <a href="/privacy" style={{ color: "#1b1b1f" }}>
          Privacy Policy
        </a>
        .
      </P>

      <H2>10. Liability</H2>
      <P>
        To the extent the law allows, SocialOrk is not liable for indirect or
        consequential loss, or for loss caused by a social network&apos;s own
        decisions, outages or API changes. Our total liability for a claim is
        limited to the amount you paid for the service in the twelve months before
        the claim. Nothing in these terms limits liability that cannot be limited
        by law.
      </P>

      <H2>11. Governing law</H2>
      <P>
        These terms are governed by the laws of the jurisdiction in which the
        operator of SocialOrk is registered, and disputes are subject to the
        courts of that jurisdiction. If you are a consumer, you keep the
        protections the law of your own country gives you.
      </P>

      <H2>12. Contact</H2>
      <P>
        Anything about these terms — including a notice you are required to give
        us — goes to{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#1b1b1f" }}>
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </P>
    </LegalPage>
  );
}
