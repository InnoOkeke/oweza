export type SendEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

/**
 * Placeholder to trigger transactional email. Connect this to SendGrid, Mailgun, or the
 * MetaSend notification service once credentials are available.
 */
export async function sendEmail({ to, subject, body }: SendEmailPayload): Promise<void> {
  console.info("[MetaSend Email]", { to, subject, body });
  await new Promise((resolve) => setTimeout(resolve, 300));
}
