import 'dotenv/config';
import { emailNotificationService } from '../src/services/EmailNotificationService';

async function main() {
    console.log("📧 Sending test email to leprofcode@gmail.com...");

    const recipientEmail = "leprofcode@gmail.com";
    const recipientName = "Le Prof";
    const senderName = "Oweza Test Script";
    const amount = "0.10";
    const token = "cUSD";
    const chain = "Celo";

    try {
        console.log(`Configuration:
    - API URL: ${process.env.OWEZA_API_BASE_URL}
    - API Key: ${process.env.OWEZA_API_KEY ? 'Set' : 'Missing'}
    `);

        const result = await emailNotificationService.sendTransferNotification(
            recipientEmail,
            recipientName,
            senderName,
            amount,
            token,
            chain
        );

        if (result) {
            console.log("✅ Email sent successfully!");
        } else {
            console.error("❌ Email sending returned false.");
        }
    } catch (error) {
        console.error("❌ Failed to send email:", error);
    }
}

main();
