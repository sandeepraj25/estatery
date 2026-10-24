import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '../../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends transactional email over SMTP (any provider: SES, Postmark, Resend, Zoho…).
 * Without SMTP_URL, development and tests log the message instead of sending it, so invite and
 * reset links can be followed locally. Production without SMTP logs a warning and sends nothing.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly env = loadEnv();
  private readonly transport: Transporter | null = this.env.SMTP_URL ? nodemailer.createTransport(this.env.SMTP_URL) : null;
  /** Last messages, for tests and local debugging. Never exposed over HTTP. */
  readonly outbox: MailMessage[] = [];

  get configured() {
    return this.transport !== null;
  }

  /** For queued delivery: throws on failure so the job is retried with backoff. */
  async deliver(msg: MailMessage): Promise<void> {
    this.outbox.push(msg);
    if (this.outbox.length > 50) this.outbox.shift();
    if (!this.transport) {
      if (this.env.NODE_ENV === 'development') this.logger.log(`[dev email] To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
      else if (this.env.NODE_ENV === 'production') this.logger.warn(`SMTP_URL is not set; email "${msg.subject}" to ${msg.to} was not sent.`);
      return;
    }
    await this.transport.sendMail({ from: this.env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
  }

  async send(msg: MailMessage): Promise<boolean> {
    this.outbox.push(msg);
    if (this.outbox.length > 50) this.outbox.shift();
    if (!this.transport) {
      if (this.env.NODE_ENV === 'production') {
        this.logger.warn(`SMTP_URL is not set; email "${msg.subject}" to ${msg.to} was not sent.`);
      } else if (this.env.NODE_ENV === 'development') {
        this.logger.log(`[dev email] To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
      }
      return false;
    }
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
      return true;
    } catch (err) {
      this.logger.error(`Email to ${msg.to} failed: ${(err as Error).message}`);
      return false;
    }
  }
}
