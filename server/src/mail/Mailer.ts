import { appendFileSync } from "node:fs";
import { parseAddress, type Config } from "../config";

export type Email = { to: string; subject: string; text: string; html: string };

export interface Mailer {
  send(email: Email): Promise<void>;
}

/**
 * Development / not-yet-configured: writes the email to the log. API tests read `sent`; the browser tests
 * read `file` (one JSON line per email).
 */
export class LogMailer implements Mailer {
  readonly sent: Email[] = [];
  constructor(
    private readonly quiet = false,
    private readonly file?: string,
  ) {}

  async send(email: Email) {
    this.sent.push(email);
    if (this.file) appendFileSync(this.file, JSON.stringify(email) + "\n");
    if (!this.quiet) console.log(`[mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
  }
}

/** https://resend.com/docs/api-reference/emails/send-email */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: Email) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** https://developers.brevo.com/reference/sendtransacemail */
export class BrevoMailer implements Mailer {
  private readonly sender: { name?: string; email: string };
  constructor(
    private readonly apiKey: string,
    from: string,
  ) {
    this.sender = parseAddress(from)!;
  }

  async send(email: Email) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: this.sender,
        to: [{ email: email.to }],
        subject: email.subject,
        textContent: email.text,
        htmlContent: email.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export function createMailer(
  config: Pick<Config, "MAIL_DRIVER" | "MAIL_FROM" | "RESEND_API_KEY" | "BREVO_API_KEY" | "NODE_ENV" | "MAIL_LOG_FILE">,
): Mailer {
  if (config.MAIL_DRIVER === "resend") return new ResendMailer(config.RESEND_API_KEY!, config.MAIL_FROM!);
  if (config.MAIL_DRIVER === "brevo") return new BrevoMailer(config.BREVO_API_KEY!, config.MAIL_FROM!);
  return new LogMailer(config.NODE_ENV === "test", config.MAIL_LOG_FILE);
}
