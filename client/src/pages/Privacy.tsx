import LegalShell, { type LegalSection } from "@/components/LegalShell";

const UPDATED = "1 October 2026";

const SECTIONS: LegalSection[] = [
  {
    h: "Who we are and what this covers",
    blocks: [
      {
        t: "p",
        text: "Sutaeru (\"Sutaeru\", \"we\", \"us\") is an AI workspace at sutaeru.com that searches the web, runs research, remembers what you tell it, connects to your accounts and produces finished files. This policy explains what personal data we handle when you use the site or its connected channels, why, who we share it with, and what you can ask us to do about it.",
      },
      {
        t: "p",
        text: "Sutaeru is operated by an independent developer working with a small team. It is not a law firm or a regulated data broker, and it is not intended for children under 16. If you use Sutaeru through a workspace created for you by someone else, that person's organisation is the data controller for the content in that workspace and we act on its instructions.",
      },
      {
        t: "p",
        text: "For privacy questions, requests about your data, or to reach us in writing, write to privacy@sutaeru.com or support@sutaeru.com. We answer privacy requests within 30 days.",
      },
    ],
  },
  {
    h: "Summary of what we do",
    blocks: [
      {
        t: "ul",
        items: [
          "We collect the account details you give us, the content you create in Sutaeru, and — only if you connect them — the messages, events and files you authorise us to read in your Google, WhatsApp or Telegram account.",
          "We process the text of your requests, and data from the accounts you connect, through third-party AI services in order to answer, plan, write and act on your behalf.",
          "We do not sell your personal data, we do not show advertising, and we do not run analytics or advertising trackers on sutaeru.com.",
          "You can revoke any connection or delete your content at any time; disconnecting a Google account revokes our tokens at Google as well as in our database.",
        ],
      },
    ],
  },
  {
    h: "Data we collect",
    blocks: [
      {
        t: "p",
        text: "We collect the minimum needed to run a personal agent workspace, and we do not browse or index your mailbox, calendar or drive on our own initiative. The categories are:",
      },
      {
        t: "list",
        items: [
          {
            label: "Account data.",
            text: "Your name or handle, e-mail address, a hashed password, your role, whether your e-mail is verified, and, if you turn it on, a two-factor-authentication secret. We also store the date you signed in most recently.",
          },
          {
            label: "Session data.",
            text: "A single session cookie that identifies you to the site so you stay signed in, plus a copy of the same token in your browser's local storage so the app can call the API. Signing out clears both.",
          },
          {
            label: "Content you create.",
            text: "Chats and the messages in them, notes, files you upload or ask us to generate, memories you save, skills, monitors and the reports they produce, tasks, receipts and other records you add, and your identity profile such as display name, avatar and preferences.",
          },
          {
            label: "Connected-account data.",
            text: "For each account you link: the provider, the address or ID, the permissions granted, and the credentials needed to call that provider on your behalf. We hold those credentials on our server, use them only for the connection you set up, and delete them when you disconnect. See the Google section below, which is the one that matters most.",
          },
          {
            label: "Usage data.",
            text: "Which model and provider served a request, token counts, timing, quotas and errors. Server error text is logged so we can fix faults. This is not used for advertising and is not shared with advertising networks.",
          },
        ],
      },
    ],
  },
  {
    h: "Google Account data we access",
    blocks: [
      {
        t: "p",
        text: "If you link a Google account from the Connections page, Sutaeru asks Google for the permissions below. Nothing is read before you consent, and you can disconnect at any time. When you disconnect, we revoke the tokens at Google and delete the stored copies.",
      },
      {
        t: "list",
        items: [
          {
            label: "gmail.readonly —",
            text: "Read Gmail messages and attachment metadata. Used only to summarise, search, extract and draft replies to mail you ask about.",
          },
          {
            label: "gmail.send —",
            text: "Send mail as you. Used only for a message you ask Sutaeru to send; Sutaeru drafts, and you confirm.",
          },
          {
            label: "calendar, calendar.events —",
            text: "Read and manage your calendar and events, so Sutaeru can check availability and book or update an event you asked for.",
          },
          {
            label: "drive.readonly —",
            text: "List and read Drive files you point Sutaeru at, to answer questions about them or work from their contents.",
          },
          {
            label: "drive.file —",
            text: "Create and modify only the Drive files Sutaeru itself created or opened for you, so generated documents can be saved back to your Drive.",
          },
          {
            label: "userinfo.email —",
            text: "Your Google e-mail address, so the connection can be matched to your Google account.",
          },
        ],
      },
      {
        t: "p",
        text: "We request offline access, which gives Sutaeru a refresh token. That is what lets a scheduled monitor, a follow-up or a task you started finish when you are not looking at the page. If you do not want offline access, disconnect the account.",
      },
      {
        t: "p",
        text: "We use Google user data only to provide the features above to you. In line with Google's Limited Use requirements we do not: sell Google user data; use it for interest-based, personalised or remarketing advertising; human-review it except, if at all, with your consent, or where necessary for legal reasons, security, or to provide the feature back to you after de-identifying it; or transfer it to anyone outside the disclosures in this policy.",
      },
    ],
  },
  {
    h: "How your data reaches AI services",
    blocks: [
      {
        t: "p",
        text: "Sutaeru is an agent layer, not a model vendor. To answer a request, the text of your message plus the relevant retrieved data is sent to the AI service(s) that generate the answer. If you ask a question about your mail, calendar or files, that retrieved content — which may include Gmail subjects, senders, snippets, event details or Drive document text — is part of what is sent.",
      },
      {
        t: "list",
        items: [
          {
            label: "Alibaba Cloud (Qwen) —",
            text: "primary language-model provider for chat, research and document generation.",
          },
          {
            label: "Google (Gemini, Vertex AI) —",
            text: "language-model, vision and image provider, and the host of the Google APIs you connect.",
          },
          {
            label: "Perplexity (Sonar) —",
            text: "web-search and synthesis provider for research answers.",
          },
          {
            label: "KoboiLLM (LiteLLM gateway) —",
            text: "routing gateway used for some text and image generation requests.",
          },
          {
            label: "ElevenLabs —",
            text: "speech-to-text and text-to-speech for voice features; audio and text you send are processed by them.",
          },
          {
            label: "E2B and browser-use.com —",
            text: "sandboxed code execution and remote browsing for agent tasks; code and page context you ask us to run or visit are processed there.",
          },
        ],
      },
      {
        t: "p",
        text: "These providers process your content under their own terms to deliver the request. We send the narrowest excerpt that answers the question, we do not give them your Google credentials, and we do not authorise them to train on your content as a condition of using Sutaeru. You can avoid sending private Google content to third-party models simply by not asking about it.",
      },
    ],
  },
  {
    h: "Other channels you may connect",
    blocks: [
      {
        t: "list",
        items: [
          {
            label: "WhatsApp —",
            text: "If the WhatsApp channel is enabled, Meta's Cloud API or a linked-device bridge carries your messages to Sutaeru, and we store the message text and media references needed to reply and keep history.",
          },
          {
            label: "Telegram —",
            text: "If the Telegram bot is enabled, your Telegram user ID, chat ID, name and message text reach Sutaeru so it can reply, and replies you generate in the web app can be forwarded to your Telegram chat.",
          },
          {
            label: "E-mail —",
            text: "We send transactional mail (password resets, verification) from no-reply@sutaeru.com through our mail provider. The reset or verification link in that mail is a secret: treat any e-mail that asks for it as suspicious.",
          },
          {
            label: "Google Fonts —",
            text: "Pages load stylesheet and font files from Google Fonts, which sees the normal request data a browser sends (IP address, user agent).",
          },
        ],
      },
    ],
  },
  {
    h: "Where your data is stored",
    blocks: [
      {
        t: "p",
        text: "Sutaeru runs in Docker containers on a rented server in Indonesia, behind HTTPS. Your database rows live in a PostgreSQL instance on that server; uploaded and generated file bytes live on that server's disk. The instance is not exposed to the public internet: only the app container, on a private network, can reach it, and Caddy terminates TLS in front of the app.",
      },
      {
        t: "p",
        text: "Operations staff can read the database and the server to run and repair the service. Backups of the database are taken when we change schema or ship risky work, and are held on the same infrastructure; they are not published and not shared outside the team.",
      },
    ],
  },
  {
    h: "How long we keep it, and how to delete it",
    blocks: [
      {
        t: "p",
        text: "Account and workspace content is kept while your account is open. You can delete individual items yourself: chats and their messages, files, memories, skills, monitors and tasks can each be removed from the app, and connections can be revoked. Deleting a Google connection revokes our tokens with Google immediately.",
      },
      {
        t: "p",
        text: "To have your account and the data attached to it erased, e-mail privacy@sutaeru.com from the address on the account and ask for account deletion. We will confirm, and then remove the account and its content from the production database and the workspace files, and clear it out of the backups that follow, within 30 days of confirming your request.",
      },
      {
        t: "p",
        text: "We may keep a small record after deletion where we must: to honour an opt-out or a legal request, to prevent a deleted account being re-created for abuse, or where backups cannot be rewritten without destroying unrelated data. Server error logs are kept briefly and are not tied to your Google content.",
      },
      {
        t: "p",
        text: "You can also export your own data: signed in, open /api/export/all to download an archive of your chats and files. Ask us for anything that export does not cover.",
      },
    ],
  },
  {
    h: "Security",
    blocks: [
      {
        t: "ul",
        items: [
          "The site is HTTPS only, with certificates issued automatically and a 301 redirect from www.",
          "Passwords are stored as bcrypt hashes, never as plain text, and are never returned by the API.",
          "Login is limited to accounts an operator has created or allow-listed, is rate-limited per IP, and can require a second factor.",
          "Session cookies are HTTP-only, SameSite=Lax, and marked Secure over HTTPS. The API strips password and 2FA fields from every profile response.",
          "Secrets for third-party services are held on the server, not in the browser, and are not given out to users.",
          "No system is perfect. If you believe an account is compromised, tell us at support@sutaeru.com and change your password.",
        ],
      },
    ],
  },
  {
    h: "Your choices",
    blocks: [
      {
        t: "ul",
        items: [
          "Connect or disconnect Google, WhatsApp, Telegram and any other channel whenever you like; the Connections page is the control.",
          "Ask us for a copy of your data, a correction, or deletion of specific items or of the whole account.",
          "Object to a specific processing purpose, for example turning off voice processing or a monitor that reads your mail.",
          "Manage cookies in your browser; only the session cookie is needed for you to stay signed in.",
          "If you are in a region with statutory rights (EU/EEA and UK GDPR, CCPA/CPRA, Brazil's LGPD, Indonesia's Personal Data Protection Law), the same contact handles those requests, including the right to complain to your authority.",
        ],
      },
    ],
  },
  {
    h: "Changes to this policy",
    blocks: [
      {
        t: "p",
        text: "If we change this policy in a way that matters to you, we will post the new version here with a new date and, where the change affects a Google permission or a new data recipient, tell you in the app or by e-mail before it takes effect. Continued use after that date means we accept the updated terms.",
      },
    ],
  },
  {
    h: "Contact",
    blocks: [
      {
        t: "p",
        text: "Privacy requests and account deletion: privacy@sutaeru.com. Everything else, including bugs, abuse reports and questions about an e-mail you think came from us: support@sutaeru.com. Published at https://sutaeru.com/privacy, terms at https://sutaeru.com/terms.",
      },
    ],
  },
];

export default function Privacy() {
  return (
    <LegalShell
      docTitle="Privacy Policy"
      seoTitle="Privacy Policy — Sutaeru"
      seoDescription="What personal data Sutaeru collects, how it is used and shared, including Google Account data accessed through Gmail, Calendar and Drive permissions, how long it is kept, and how to delete it."
      path="/privacy"
      otherDoc={{ label: "Terms of Service", href: "/terms" }}
      updated={UPDATED}
      summary="Sutaeru is an AI workspace that can read your mail, calendar and files when you connect them, and can act on your behalf. This page says exactly what we collect, which AI services your text is sent to, how long we keep anything, and how to get it deleted."
      sections={SECTIONS}
    />
  );
}
