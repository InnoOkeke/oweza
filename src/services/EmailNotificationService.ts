/**
 * Email Notification Service
 * Handles sending email notifications for transfers, invites, and reminders
 * 
 * TODO: Integrate with your chosen email provider:
 * - SendGrid: https://sendgrid.com/
 * - Resend: https://resend.com/
 * - AWS SES: https://aws.amazon.com/ses/
 */

import { PendingTransfer } from "../types/database";

declare const require: any;

const isReactNative = typeof navigator !== "undefined" && navigator.product === "ReactNative";

const getExpoExtra = () => {
  if (!isReactNative) {
    return {} as ExpoExtra;
  }

  try {
    const Constants = require("expo-constants").default;
    return (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;
  } catch (_error) {
    return {} as ExpoExtra;
  }
};

export type EmailTemplate = "invite" | "transfer_notification" | "transfer_confirmation" | "expiring_reminder" | "claimed_notification";

export type EmailParams = {
  to: string;
  template: EmailTemplate;
  data: Record<string, any>;
};

type ExpoExtra = {
  appUrl?: string;
  supportEmail?: string;
  sendgridApiKey?: string;
  resendApiKey?: string;
  awsSesRegion?: string;
  awsSesAccessKey?: string;
  awsSesSecretKey?: string;
  metasendApiBaseUrl?: string;
  metasendApiKey?: string;
};

class EmailNotificationService {
  private readonly extra = getExpoExtra();
  private readonly APP_URL = this.extra.appUrl ?? process.env.APP_URL ?? "https://metasend-api.onrender.com";
  private readonly SUPPORT_EMAIL = this.extra.supportEmail ?? process.env.SUPPORT_EMAIL ?? "support@metasend.io";
  private readonly SENDGRID_API_KEY = this.extra.sendgridApiKey ?? process.env.SENDGRID_API_KEY ?? "";
  private readonly RESEND_API_KEY = this.extra.resendApiKey ?? process.env.RESEND_API_KEY ?? "";
  private readonly AWS_SES_REGION = this.extra.awsSesRegion ?? process.env.AWS_SES_REGION ?? "";
  private readonly AWS_SES_ACCESS_KEY = this.extra.awsSesAccessKey ?? process.env.AWS_SES_ACCESS_KEY ?? "";
  private readonly AWS_SES_SECRET_KEY = this.extra.awsSesSecretKey ?? process.env.AWS_SES_SECRET_KEY ?? "";
  private readonly apiBaseUrl = (isReactNative ? this.extra.metasendApiBaseUrl : process.env.METASEND_API_BASE_URL) ||
    process.env.METASEND_API_BASE_URL ||
    "https://metasend-api.onrender.com";
  private readonly apiKey = (isReactNative ? this.extra.metasendApiKey : process.env.METASEND_API_KEY) || "";

  /**
   * Send invite email to non-registered user with pending transfer
   */
  async sendInviteWithPendingTransfer(
    recipientEmail: string,
    senderName: string,
    senderEmail: string | undefined,
    amount: string,
    token: string,
    transferId: string
  ): Promise<boolean> {
    const subject = `You received ${amount} ${token} from ${senderName}!`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1E293B; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3A80F7 0%, #10B981 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px; }
            .amount { font-size: 48px; font-weight: bold; margin: 20px 0; }
            .content { background: #F8FAFC; padding: 30px; border-radius: 12px; margin: 20px 0; }
            .button { display: inline-block; background: #3A80F7; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .info-box { background: white; border-left: 4px solid #3A80F7; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: center; color: #64748B; font-size: 14px; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You've Got Money!</h1>
              <div class="amount">${amount} ${token}</div>
                <p>from ${senderName}${senderEmail ? ` (${senderEmail})` : ""}</p>
            </div>

            <div class="content">
              <h2>Hi there! 👋</h2>
              <p>${senderName}${senderEmail ? ` (${senderEmail})` : ""} sent you <strong>${amount} ${token}</strong> using MetaSend.</p>
              
              <p>Create your free MetaSend wallet to claim your funds:</p>
              
              <a href="${this.APP_URL}/claim/${transferId}" class="button">
                Claim Your ${token}
              </a>

              <div class="info-box">
                <strong>⏰ Your funds are held securely for 7 days.</strong>
                <p>After 7 days, unclaimed funds will be returned to the sender.</p>
              </div>

              <h3>What's MetaSend?</h3>
              <p>MetaSend is a multi-chain crypto wallet that makes sending money as easy as email. No complex addresses, just send money using email addresses!</p>
              
              <ul>
                <li>✅ Send to any email address</li>
                <li>✅ Support for multiple blockchains</li>
                <li>✅ Gasless transfers with Coinbase Paymaster</li>
                <li>✅ Secure Coinbase Smart Wallet</li>
              </ul>
            </div>

            <div class="footer">
              <p>Questions? Contact us at <a href="mailto:${this.SUPPORT_EMAIL}">${this.SUPPORT_EMAIL}</a></p>
              <p>© ${new Date().getFullYear()} MetaSend. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
    });
  }

  /**
   * Send notification to existing user about received transfer
   */
  async sendTransferNotification(
    recipientEmail: string,
    recipientName: string,
    senderName: string,
    amount: string,
    token: string,
    chain: string
  ): Promise<boolean> {
    const subject = `You received ${amount} ${token} from ${senderName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1E293B;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #3A80F7 0%, #10B981 100%); color: white; padding: 30px; border-radius: 12px; text-align: center;">
              <h2>💸 Transfer Received</h2>
              <p style="font-size: 32px; font-weight: bold; margin: 20px 0;">${amount} ${token}</p>
              <p>from ${senderName}</p>
            </div>

            <div style="padding: 30px 0;">
              <p>Hi ${recipientName}!</p>
              <p>${senderName} just sent you <strong>${amount} ${token}</strong> on the ${chain} network.</p>
              
              <a href="${this.APP_URL}/wallet" style="display: inline-block; background: #3A80F7; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                View in App
              </a>

              <p style="color: #64748B; font-size: 14px;">The funds are now in your MetaSend wallet and ready to use.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
    });
  }

  /**
   * Send confirmation to sender after successful transfer
   */
  async sendTransferConfirmation(
    senderEmail: string,
    senderName: string,
    recipientEmail: string,
    amount: string,
    token: string,
    status: "sent" | "pending"
  ): Promise<boolean> {
    const subject = status === "sent"
      ? `✅ Transfer sent to ${recipientEmail}`
      : `⏳ Transfer pending for ${recipientEmail}`;

    const statusMessage = status === "sent"
      ? `Your transfer of <strong>${amount} ${token}</strong> to ${recipientEmail} was successful!`
      : `Your transfer of <strong>${amount} ${token}</strong> to ${recipientEmail} is pending. They'll receive an email invitation to claim the funds.`;

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1E293B;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>${status === "sent" ? "✅" : "⏳"} Transfer Confirmation</h2>
            <p>Hi ${senderName}!</p>
            <p>${statusMessage}</p>
            
            <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount} ${token}</p>
              <p style="margin: 5px 0;"><strong>Recipient:</strong> ${recipientEmail}</p>
              <p style="margin: 5px 0;"><strong>Status:</strong> ${status === "sent" ? "Delivered" : "Pending Claim"}</p>
            </div>

            ${status === "pending" ? `
              <p style="color: #64748B; font-size: 14px;">
                The recipient has 7 days to claim the funds. If unclaimed, the transfer will be automatically refunded to your wallet.
              </p>
            ` : ""}

            <a href="${this.APP_URL}/activity" style="display: inline-block; background: #3A80F7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
              View Transaction History
            </a>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: senderEmail,
      subject,
      html,
    });
  }

  /**
   * Send reminder about expiring pending transfer
   */
  async sendPendingTransferExpiring(
    recipientEmail: string,
    senderName: string,
    amount: string,
    token: string,
    hoursLeft: number,
    transferId: string
  ): Promise<boolean> {
    const daysLeft = Math.ceil(hoursLeft / 24);
    const subject = `⏰ Reminder: Claim your ${amount} ${token} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`;

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1E293B;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; border-radius: 8px;">
              <h2 style="color: #92400E; margin-top: 0;">⏰ Time Running Out!</h2>
              <p style="color: #78350F;">Your pending transfer will expire in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.</p>
            </div>

            <div style="padding: 20px 0;">
              <p>Hi there!</p>
              <p>${senderName} sent you <strong>${amount} ${token}</strong> on MetaSend ${7 - daysLeft} days ago.</p>
              <p><strong>You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left to claim it!</strong></p>

              <a href="${this.APP_URL}/claim/${transferId}" style="display: inline-block; background: #F59E0B; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">
                Claim Your ${token} Now
              </a>

              <p style="background: #FEE2E2; border-left: 4px solid #DC2626; padding: 16px; border-radius: 4px; color: #991B1B;">
                <strong>Important:</strong> After 7 days, unclaimed funds will be automatically returned to the sender.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
    });
  }

  /**
   * Notify sender when their pending transfer is claimed
   */
  async sendPendingTransferClaimed(
    senderEmail: string,
    senderName: string,
    recipientEmail: string,
    amount: string,
    token: string
  ): Promise<boolean> {
    const subject = `✅ ${recipientEmail} claimed your ${amount} ${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1E293B;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 20px; border-radius: 8px;">
              <h2 style="color: #065F46; margin-top: 0;">✅ Transfer Claimed!</h2>
            </div>

            <div style="padding: 20px 0;">
              <p>Hi ${senderName}!</p>
              <p>Great news! ${recipientEmail} has claimed your transfer of <strong>${amount} ${token}</strong>.</p>
              <p>The funds have been successfully delivered to their MetaSend wallet.</p>

              <a href="${this.APP_URL}/activity" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                View Transaction
              </a>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: senderEmail,
      subject,
      html,
    });
  }

  /**
   * Notify sender when pending transfer expires and funds are returned
   */
  async sendPendingTransferExpired(
    senderEmail: string,
    senderName: string,
    recipientEmail: string,
    amount: string,
    token: string
  ): Promise<boolean> {
    const subject = `Unclaimed transfer returned: ${amount} ${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1E293B;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>🔄 Transfer Expired - Funds Returned</h2>
            <p>Hi ${senderName}!</p>
            <p>Your transfer of <strong>${amount} ${token}</strong> to ${recipientEmail} was not claimed within 7 days.</p>
            <p>The funds have been automatically returned to your MetaSend wallet.</p>

            <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Amount Returned:</strong> ${amount} ${token}</p>
              <p style="margin: 5px 0;"><strong>Original Recipient:</strong> ${recipientEmail}</p>
            </div>

            <p style="color: #64748B; font-size: 14px;">
              You can try sending again or contact ${recipientEmail} directly to let them know.
            </p>

            <a href="${this.APP_URL}/wallet" style="display: inline-block; background: #3A80F7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
              View Your Wallet
            </a>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: senderEmail,
      subject,
      html,
    });
  }

  /**
   * Send email using configured provider
   */
  private async sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.warn("⚠️ Missing METASEND_API_KEY. Email not sent.");
        return false;
      }

      console.log('📧 Sending email to:', params.to);
      console.log('🔧 API Base URL:', this.apiBaseUrl);
      console.log('🔑 API Key (first 10 chars):', this.apiKey.substring(0, 10));

      const response = await fetch(`${this.apiBaseUrl}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          to: params.to,
          subject: params.subject,
          html: params.html,
          from: `MetaSend <${this.SUPPORT_EMAIL}>`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('⚠️ Email API returned:', response.status, errorText.substring(0, 100));
        return false;
      }

      const data = await response.json();

      console.log("✅ Email sent successfully to:", params.to);

      return true;
    } catch (error) {
      console.log('⚠️ Email failed:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Send payment request notification
   */
  async sendPaymentRequestNotification(
    payerEmail: string,
    creatorName: string,
    amount: string,
    token: string,
    description: string,
    requestId: string
  ): Promise<boolean> {
    const subject = `Payment Request: ${amount} ${token} from ${creatorName}`;
    const paymentLink = `${this.APP_URL}/payment-requests/${requestId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1E293B; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3A80F7 0%, #8B5CF6 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px; }
            .amount { font-size: 36px; font-weight: bold; margin: 20px 0; }
            .content { background: #F8FAFC; padding: 30px; border-radius: 12px; margin: 20px 0; }
            .button { display: inline-block; background: #3A80F7; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .description { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #64748B; font-size: 14px; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💳 Payment Request</h1>
              <div class="amount">${amount} ${token}</div>
              <p>from ${creatorName}</p>
            </div>

            <div class="content">
              <h2>Hi! 👋</h2>
              <p>${creatorName} has sent you a payment request.</p>

              <div class="description">
                <strong>Description:</strong>
                <p>${description}</p>
              </div>

              <p>Click the button below to view and pay this request:</p>

              <a href="${paymentLink}" class="button">View Payment Request</a>

              <p><small>Or copy this link: ${paymentLink}</small></p>
            </div>

            <div class="footer">
              <p>Powered by MetaSend - Crypto payments made simple</p>
              <p><a href="${this.APP_URL}">Visit MetaSend</a></p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({ to: payerEmail, subject, html });
  }

  /**
   * Send tip notification to creator
   */
  async sendTipNotification(
    creatorEmail: string,
    tipperName: string,
    amount: string,
    token: string,
    message: string | undefined,
    jarTitle: string
  ): Promise<boolean> {
    const subject = `🎉 You received a ${amount} ${token} tip!`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1E293B; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px; }
            .amount { font-size: 48px; font-weight: bold; margin: 20px 0; }
            .content { background: #F8FAFC; padding: 30px; border-radius: 12px; margin: 20px 0; }
            .message { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B; }
            .button { display: inline-block; background: #F59E0B; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; color: #64748B; font-size: 14px; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 New Tip Received!</h1>
              <div class="amount">${amount} ${token}</div>
              <p>from ${tipperName}</p>
            </div>

            <div class="content">
              <h2>Congratulations! 🎊</h2>
              <p>Someone just tipped you ${amount} ${token} on your "${jarTitle}" tip jar!</p>

              ${message ? `
                <div class="message">
                  <strong>Message from ${tipperName}:</strong>
                  <p>"${message}"</p>
                </div>
              ` : ""}

              <a href="${this.APP_URL}/tipping" class="button">View All Tips</a>
            </div>

            <div class="footer">
              <p>Powered by MetaSend - Crypto payments made simple</p>
              <p><a href="${this.APP_URL}">Visit MetaSend</a></p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({ to: creatorEmail, subject, html });
  }

  /**
   * Send invoice notification to client
   */
  async sendInvoiceNotification(
    clientEmail: string,
    creatorName: string,
    invoiceNumber: string,
    total: string,
    token: string,
    dueDate: string,
    invoiceId: string
  ): Promise<boolean> {
    const subject = `Invoice ${invoiceNumber} from ${creatorName}`;
    const invoiceLink = `${this.APP_URL}/invoices/${invoiceId}`;
    const formattedDueDate = new Date(dueDate).toLocaleDateString();

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1E293B; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0F172A 0%, #334155 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px; }
            .invoice-number { font-size: 24px; font-weight: bold; margin: 10px 0; }
            .amount { font-size: 36px; font-weight: bold; margin: 20px 0; color: #10B981; }
            .content { background: #F8FAFC; padding: 30px; border-radius: 12px; margin: 20px 0; }
            .button { display: inline-block; background: #0F172A; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .info-box { background: white; padding: 16px; margin: 20px 0; border-radius: 8px; }
            .footer { text-align: center; color: #64748B; font-size: 14px; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📄 Invoice</h1>
              <div class="invoice-number">${invoiceNumber}</div>
              <div class="amount">${total} ${token}</div>
              <p>from ${creatorName}</p>
            </div>

            <div class="content">
              <h2>Hi! 👋</h2>
              <p>You have received an invoice from ${creatorName}.</p>

              <div class="info-box">
                <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
                <p><strong>Amount Due:</strong> ${total} ${token}</p>
                <p><strong>Due Date:</strong> ${formattedDueDate}</p>
              </div>

              <p>Click the button below to view the full invoice and make payment:</p>

              <a href="${invoiceLink}" class="button">View Invoice</a>

              <p><small>Or copy this link: ${invoiceLink}</small></p>
            </div>

            <div class="footer">
              <p>Powered by MetaSend - Crypto payments made simple</p>
              <p><a href="${this.APP_URL}">Visit MetaSend</a></p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({ to: clientEmail, subject, html });
  }

  /**
   * Send crypto gift notification
   */
  async sendGiftNotification(
    recipientEmail: string,
    senderName: string,
    amount: string,
    token: string,
    theme: string,
    message: string | undefined,
    giftId: string
  ): Promise<boolean> {
    const themeEmojis: Record<string, string> = {
      birthday: "🎂",
      anniversary: "💝",
      holiday: "🎄",
      thank_you: "🙏",
      congratulations: "🎉",
      red_envelope: "🧧",
      custom: "🎁",
    };

    const emoji = themeEmojis[theme] || "🎁";
    const subject = `${emoji} ${senderName} sent you a crypto gift!`;
    // Use the frontend URL for claiming, matching CryptoGiftService
    const frontendUrl = "https://metasend.vercel.app";
    const giftLink = `${frontendUrl}/gift/${giftId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1E293B; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px; }
            .emoji { font-size: 64px; margin: 20px 0; }
            .amount { font-size: 48px; font-weight: bold; margin: 20px 0; }
            .content { background: #F8FAFC; padding: 30px; border-radius: 12px; margin: 20px 0; }
            .message { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #EC4899; font-style: italic; }
            .button { display: inline-block; background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; color: #64748B; font-size: 14px; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="emoji">${emoji}</div>
              <h1>You've Received a Gift!</h1>
              <div class="amount">${amount} ${token}</div>
              <p>from ${senderName}</p>
            </div>

            <div class="content">
              <h2>Hi there! 🎊</h2>
              <p>${senderName} has sent you a special crypto gift!</p>

              ${message ? `
                <div class="message">
                  "${message}"
                  <p style="text-align: right; margin-top: 10px;"><strong>— ${senderName}</strong></p>
                </div>
              ` : ""}

              <p>Click the button below to claim your gift:</p>

              <a href="${giftLink}" class="button">Claim Your Gift ${emoji}</a>

              <p><small>Or copy this link: ${giftLink}</small></p>
            </div>

            <div class="footer">
              <p>Powered by MetaSend - Crypto payments made simple</p>
              <p><a href="${this.APP_URL}">Visit MetaSend</a></p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({ to: recipientEmail, subject, html });
  }
}

// Export singleton instance
export const emailNotificationService = new EmailNotificationService();
