import { z } from "zod";
import { getUserByEmail } from "./api";

export const EmailLookupSchema = z.object({
  email: z.string().email(),
});

export type EmailLookupRequest = z.infer<typeof EmailLookupSchema>;

export type EmailLookupResult = {
  email: string;
  isRegistered: boolean;
  walletAddress?: string;
  displayName?: string;
  avatar?: string;
};

/**
 * Resolve email to wallet address
 * Now powered by API client
 */
export async function resolveEmailToWallet({ email }: EmailLookupRequest): Promise<EmailLookupResult> {
  EmailLookupSchema.parse({ email });
  await delay();

  // Normalize email to lowercase for consistent lookups
  const normalizedEmail = email.toLowerCase().trim();
  const user = await getUserByEmail(normalizedEmail);

  if (!user) {
    return {
      email,
      isRegistered: false,
    } satisfies EmailLookupResult;
  }

  return {
    email: normalizedEmail,
    isRegistered: true,
    walletAddress: user.wallets.base,
    displayName: user.profile.displayName,
    avatar: user.profile.avatar,
  } satisfies EmailLookupResult;
}

const delay = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));
