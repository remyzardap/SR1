import LegalShell, { type LegalSection } from "@/components/LegalShell";

const UPDATED = "1 October 2026";

const SECTIONS: LegalSection[] = [
  {
    h: "Agreement",
    blocks: [
      {
        t: "p",
        text: "These terms are an agreement between you and the operator of Sutaeru (\"Sutaeru\", \"we\", \"us\") covering sutaeru.com and anything Sutaeru does on your behalf. By creating an account, signing in, or using Sutaeru through a connected channel such as WhatsApp or Telegram, you accept these terms. If you do not accept them, do not use the service.",
      },
      {
        t: "p",
        text: "Sutaeru is provided for individuals and small teams for lawful personal and business use. If you use it on behalf of an organisation, you confirm you may bind that organisation.",
      },
    ],
  },
  {
    h: "The service",
    blocks: [
      {
        t: "p",
        text: "Sutaeru answers questions, researches topics, remembers context you save, runs tasks and monitors, connects to other services you authorise, and produces files: reports, decks, sheets, images. Access is provisioned by an operator: today, accounts are created or allow-listed for you rather than opened by self-service sign-up. We can change, add or withdraw features, and we can set quotas on usage.",
      },
      {
        t: "p",
        text: "Sutaeru is an assistant, not a professional adviser. Output from a generative model can be wrong, out of date, or subtly plausible-but-false. You are responsible for checking anything you act on, send, publish, file or sign — including mail Sutaeru drafts, calendar events it proposes, figures in a report, and legal, tax, financial, medical or regulatory content. Nothing here is legal, financial, tax or medical advice, and no lawyer, accountant or other professional-client relationship is created by using Sutaeru.",
      },
    ],
  },
  {
    h: "Your account",
    blocks: [
      {
        t: "ul",
        items: [
          "Keep your password and any second-factor device safe. You are responsible for activity under your account.",
          "Give accurate contact details so we can reach you about your account, a password reset, or a security problem.",
          "Tell us promptly at support@sutaeru.com if you think your account has been used without you.",
          "One person per account. Do not share credentials or session tokens, and do not resell access.",
          "If you use a workspace owned by an organisation, its administrator may access, restrict or remove that workspace's content.",
        ],
      },
    ],
  },
  {
    h: "Connected accounts and Google permissions",
    blocks: [
      {
        t: "p",
        text: "Sutaeru can only see the accounts you connect, and only within the permissions you grant. Connecting a Google account means you have decided we may read the mail, events or files you ask about, and in some cases send mail or create events at your direction. You stay responsible for what you instruct Sutaeru to do with those accounts, including messages it sends as you.",
      },
      {
        t: "ul",
        items: [
          "Use of Google data through Sutaeru is subject to our Privacy Policy, which describes the scopes we request and how your Google content reaches AI services.",
          "You may disconnect a Google account at any time from the Connections page. That revokes our access at Google as well as in our systems.",
          "Do not connect an account you are not allowed to access, and do not use Sutaeru to read, export or act on someone else's mail, calendar or files without their permission.",
          "Your use of the underlying Google services remains subject to Google's own terms.",
        ],
      },
    ],
  },
  {
    h: "Acceptable use",
    blocks: [
      {
        t: "p",
        text: "You agree not to:",
      },
      {
        t: "ul",
        items: [
          "break the law, infringe someone's rights, or use Sutaeru to plan or carry out harm, fraud, harassment, stalking, spam or impersonation;",
          "send unsolicited bulk mail or messages, or use the mail and messaging capabilities to reach people who did not ask to be reached;",
          "upload malware, or try to disrupt, overload, probe or gain unauthorised access to Sutaeru or any connected account;",
          "scrape, rate-around or bypass quotas, security or access controls, or use another user's session token;",
          "process another person's sensitive personal data through Sutaeru without a lawful basis and their knowledge where the law requires it;",
          "attempt to extract system prompts or model credentials, or reverse-engineer the service except where the law forbids that restriction;",
          "use content Sutaeru produces to train or build a competing assistant service using our prompts, memory or exports.",
        ],
      },
    ],
  },
  {
    h: "Your content",
    blocks: [
      {
        t: "p",
        text: "You keep what is yours. Content you upload or create stays yours, and we take only the licence needed to operate the service: to store it, send relevant parts to the AI and integration providers named in the Privacy Policy, and deliver output back to you. Documents Sutaeru produces for you are yours to use, subject to third-party rights in the source material and in any model output.",
      },
      {
        t: "p",
        text: "You are responsible for the content you put into Sutaeru and for having the rights to it. We do not monitor your workspace to police content, and we do not claim your data as ours or sell it.",
      },
    ],
  },
  {
    h: "Third-party services",
    blocks: [
      {
        t: "p",
        text: "Sutaeru depends on services we do not own: model and search providers, voice and code-sandbox providers, Google, WhatsApp/Meta, Telegram, our hosting and mail providers. They have their own terms and can change or fail. Where we are the route through which you use them, we are responsible for sending your data correctly; where they are at fault or change their service, we will tell you what we can and do what we can, but we do not control them.",
      },
    ],
  },
  {
    h: "Payment",
    blocks: [
      {
        t: "p",
        text: "Sutaeru is currently provided without charge to its users. If paid plans are introduced, the price, what you get, how to cancel, and whether the charge is refundable will be shown before you pay, and payment terms will be updated here. You are responsible for any taxes on a subscription you buy.",
      },
    ],
  },
  {
    h: "Suspension and ending your account",
    blocks: [
      {
        t: "p",
        text: "You can stop using Sutaeru at any time and ask us to delete your account by writing to privacy@sutaeru.com; deletion follows the process in the Privacy Policy.",
      },
      {
        t: "p",
        text: "We may suspend or end access where we reasonably believe it is needed: a breach of these terms, a request from an authority, a security risk to Sutaeru or to a connected account, non-payment if billing applies, or prolonged abuse of capacity. We will give notice where we can and it is safe to do so, and we will let you export your own content before we delete it unless the reason is a legal or safety requirement.",
      },
    ],
  },
  {
    h: "No warranty",
    blocks: [
      {
        t: "p",
        text: "THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\", WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, QUIET ENJOYMENT AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT SUTAERU IS ACCURATE, ERROR-FREE, UNINTERRUPTED, SECURE, OR THAT OUTPUT MEETS YOUR REQUIREMENTS. CONNECTIONS TO THIRD-PARTY ACCOUNTS MAY FAIL OR BE RESTRICTED BY THE PROVIDER AT ANY TIME.",
      },
    ],
  },
  {
    h: "Limitation of liability",
    blocks: [
      {
        t: "p",
        text: "TO THE MAXIMUM EXTENT THE LAW ALLOWS, WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE OR EXEMPLARY LOSS, OR FOR LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSS, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE. OUR TOTAL AGGREGATE LIABILITY FOR ANY CLAIM ARISING FROM THE SERVICE IS LIMITED TO THE GREATER OF THE FEES YOU PAID FOR THE TWELVE MONTHS BEFORE THE CLAIM AND US$100. THESE LIMITS DO NOT APPLY TO LIABILITY THAT CANNOT BE LIMITED BY LAW, AND DO NOT PREJUDICE YOUR STATUTORY RIGHTS AS A CONSUMER.",
      },
    ],
  },
  {
    h: "Indemnity",
    blocks: [
      {
        t: "p",
        text: "If a third party brings a claim against us because of content you submitted, your use of the service, your breach of these terms, or an instruction you gave Sutaeru that harmed someone, you will defend and cover our reasonable costs, unless we are legally required to share them.",
      },
    ],
  },
  {
    h: "General",
    blocks: [
      {
        t: "ul",
        items: [
          "We may update these terms; if a change materially reduces your rights we will tell you in the app or by e-mail before it applies, and continued use means you accept the update.",
          "If part of these terms is unenforceable, the rest stays in effect and we replace the affected part with something as close to the original intention as the law allows.",
          "Our failure to enforce something is not a waiver of it.",
          "You may not assign these terms; we may, in connection with a business transfer.",
          "These terms, together with the Privacy Policy, are the whole agreement about the service and replace anything earlier on the same subject.",
        ],
      },
    ],
  },
  {
    h: "Governing law and contact",
    blocks: [
      {
        t: "p",
        text: "These terms are governed by the laws of the Republic of Indonesia, and disputes are subject to the exclusive jurisdiction of the courts of Indonesia, without affecting mandatory consumer-protection rights in the country where you live. Report abuse, security issues or questions to support@sutaeru.com; privacy requests go to privacy@sutaeru.com.",
      },
    ],
  },
];

export default function Terms() {
  return (
    <LegalShell
      docTitle="Terms of Service"
      seoTitle="Terms of Service — Sutaeru"
      seoDescription="The terms that apply when you use Sutaeru: accounts, connected Google permissions, acceptable use, ownership of your content, third-party services, disclaimers and liability limits."
      path="/terms"
      otherDoc={{ label: "Privacy Policy", href: "/privacy" }}
      updated={UPDATED}
      summary="What you agree to when you use Sutaeru. The short version: your content stays yours, you are responsible for what you ask an agent to do, output from a model needs checking before you act on it, and you can disconnect any account or leave at any time."
      sections={SECTIONS}
    />
  );
}
