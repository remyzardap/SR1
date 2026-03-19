import { generateReviewQueueEmail, type ReviewQueueEmailData } from "../templates/review-queue-email";

interface EmailConfig {
  from: string;
  fromName: string;
  replyTo?: string;
}

const defaultConfig: EmailConfig = {
  from: "notifications@sutaeru.com",
  fromName: "Sutaeru Business",
  replyTo: "support@sutaeru.com",
};

interface EmailProvider {
  send(to: string, subject: string, html: string, text: string, config: EmailConfig): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(to: string, subject: string, _html: string, text: string, config: EmailConfig): Promise<void> {
    console.log("=== EMAIL SENT ===");
    console.log("To:", to);
    console.log("From:", `${config.fromName} <${config.from}>`);
    console.log("Subject:", subject);
    console.log("Text:", text.substring(0, 500) + "...");
    console.log("==================");
  }
}

export class EmailService {
  private provider: EmailProvider;
  private config: EmailConfig;

  constructor(provider?: EmailProvider, config?: Partial<EmailConfig>) {
    this.provider = provider || new ConsoleEmailProvider();
    this.config = { ...defaultConfig, ...config };
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    await this.provider.send(params.to, params.subject, params.html, params.text, this.config);
  }

  async sendReviewQueueEmail(to: string, data: ReviewQueueEmailData): Promise<void> {
    const { subject, html, text } = generateReviewQueueEmail(data);
    await this.sendEmail({ to, subject, html, text });
  }
}

export const emailService = new EmailService();

export async function sendReviewQueueEmail(to: string, data: ReviewQueueEmailData): Promise<void> {
  return emailService.sendReviewQueueEmail(to, data);
}
