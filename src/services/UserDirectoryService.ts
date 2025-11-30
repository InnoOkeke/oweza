/**
 * User Directory Service
 * Handles user lookup and profile retrieval
 */

import { z } from "zod";
import mongoDatabase from "./mongoDatabase";
import { User, ChainType } from "../types/database";

declare const require: any;

export const UserSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().optional().default(10),
});

export type UserSearchRequest = z.infer<typeof UserSearchSchema>;

export type UserProfile = {
  userId: string;
  email: string;
  displayName?: string;
  avatar?: string;
  wallets: {
    celo?: string;
  };
  isVerified: boolean;
};

export type UserWalletsResult = {
  userId: string;
  email: string;
  wallets: {
    celo?: string;
  };
  hasWalletForChain: (chain: ChainType) => boolean;
};

type ExpoExtra = {
  owezaApiBaseUrl?: string;
  owezaApiKey?: string;
};

const isReactNativeEnv = typeof navigator !== "undefined" && navigator.product === "ReactNative";

const getExpoExtra = (): ExpoExtra => {
  if (!isReactNativeEnv) {
    return {};
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require("expo-constants").default;
    return (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;
  } catch (error) {
    console.warn("⚠️ Unable to load expo constants:", error);
    return {};
  }
};

class UserDirectoryService {
  private readonly useRemoteApi = isReactNativeEnv;
  private readonly extra = getExpoExtra();
  private readonly apiBaseUrl =
    (isReactNativeEnv ? this.extra.owezaApiBaseUrl : process.env.OWEZA_API_BASE_URL) || "";
  private readonly apiKey =
    (isReactNativeEnv ? this.extra.owezaApiKey : process.env.OWEZA_API_KEY) || "";

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiBaseUrl) {
      throw new Error("Oweza API base URL is not configured");
    }

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    try {
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        ...(init || {}),
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init?.headers || {}),
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - server took too long to respond');
      }
      throw error;
    }
  }

  private async getRemoteUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await this.request<{ success: boolean; user?: User }>(
        `/api/users?email=${encodeURIComponent(email)}`
      );
      return result.user ?? null;
    } catch (error) {
      console.warn("⚠️ Failed to fetch user by email:", error);
      return null;
    }
  }

  private async getRemoteUserById(userId: string): Promise<User | null> {
    try {
      const result = await this.request<{ success: boolean; user?: User }>(
        `/api/users?userId=${encodeURIComponent(userId)}`
      );
      return result.user ?? null;
    } catch (error) {
      console.warn("⚠️ Failed to fetch user by id:", error);
      return null;
    }
  }

  private async searchRemoteUsers(query: string, limit: number): Promise<User[]> {
    try {
      const result = await this.request<{ success: boolean; users?: User[] }>(
        `/api/users?search=${encodeURIComponent(query)}&limit=${limit}`
      );
      return result.users ?? [];
    } catch (error) {
      console.warn("⚠️ Failed to search users:", error);
      return [];
    }
  }

  private async getRemoteUserByWalletAddress(walletAddress: string): Promise<User | null> {
    try {
      const result = await this.request<{ success: boolean; user?: User }>(
        `/api/users?walletAddress=${encodeURIComponent(walletAddress)}`
      );
      return result.user ?? null;
    } catch (error) {
      console.warn("⚠️ Failed to fetch user by wallet address:", error);
      return null;
    }
  }

  /**
   * Find a user by their wallet address
   */
  async findUserByWalletAddress(walletAddress: string): Promise<UserProfile | null> {
    const user = this.useRemoteApi
      ? await this.getRemoteUserByWalletAddress(walletAddress)
      : await mongoDatabase.getUserByWalletAddress(walletAddress);
    if (!user) return null;

    return this.mapUserToProfile(user);
  }

  /**
   * Find a user by their email address
   */
  async findUserByEmail(email: string): Promise<UserProfile | null> {
    // Always normalize email to lowercase and trim whitespace
    const normalizedEmail = email.toLowerCase().trim();
    const user = this.useRemoteApi
      ? await this.getRemoteUserByEmail(normalizedEmail)
      : await mongoDatabase.getUserByEmail(normalizedEmail);
    if (!user) return null;

    return this.mapUserToProfile(user);
  }

  /**
   * Get user profile by userId
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const user = this.useRemoteApi
      ? await this.getRemoteUserById(userId)
      : await mongoDatabase.getUserById(userId);
    if (!user) return null;

    return this.mapUserToProfile(user);
  }

  /**
   * Get user's wallet addresses
   */
  async getUserWallets(userId: string): Promise<UserWalletsResult | null> {
    const user = this.useRemoteApi
      ? await this.getRemoteUserById(userId)
      : await mongoDatabase.getUserById(userId);
    if (!user) return null;

    return {
      userId: user.userId,
      email: user.email,
      wallets: user.wallets,
      hasWalletForChain: (chain: ChainType) => {
        return Boolean(user.wallets[chain]);
      },
    };
  }

  /**
   * Search users by email query
   */
  async searchUsers(request: UserSearchRequest): Promise<UserProfile[]> {
    const validated = UserSearchSchema.parse(request);
    const users = this.useRemoteApi
      ? await this.searchRemoteUsers(validated.query, validated.limit)
      : await mongoDatabase.searchUsersByEmail(validated.query, validated.limit);

    return users.map((user) => this.mapUserToProfile(user));
  }

  /**
   * Check if a user exists by email
   */
  async userExists(email: string): Promise<boolean> {
    const user = this.useRemoteApi
      ? await this.getRemoteUserByEmail(email)
      : await mongoDatabase.getUserByEmail(email);
    return user !== null;
  }

  /**
   * Get wallet address for a specific chain
   */
  async getWalletForChain(userId: string, chain: ChainType): Promise<string | null> {
    const user = this.useRemoteApi
      ? await this.getRemoteUserById(userId)
      : await mongoDatabase.getUserById(userId);
    if (!user) return null;

    return user.wallets[chain] || null;
  }

  /**
   * Register a new user (called after wallet connection)
   */
  async registerUser(data: {
    userId: string;
    email: string;
    emailVerified: boolean;
    walletAddress?: string;
    displayName?: string;
    avatar?: string;
  }): Promise<UserProfile> {
    // Normalize email to lowercase before registration
    const normalizedEmail = data.email.toLowerCase().trim();

    if (this.useRemoteApi) {
      try {
        const response = await this.request<{ success: boolean; user: User }>("/api/users", {
          method: "POST",
          body: JSON.stringify({
            userId: data.userId,
            email: normalizedEmail,
            emailVerified: data.emailVerified,
            walletAddress: data.walletAddress,
            displayName: data.displayName,
            avatar: data.avatar,
          }),
        });

        return this.mapUserToProfile(response.user);
      } catch (error) {
        console.error("❌ Remote registration failed, falling back to local:", error);
        // Fallback to local registration if remote fails
        const user: User = {
          userId: data.userId,
          email: normalizedEmail,
          emailVerified: data.emailVerified,
          wallets: {
            celo: data.walletAddress,
          },
          profile: {
            displayName: data.displayName,
            avatar: data.avatar,
          },
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };

        // Store locally in memory for this session
        return this.mapUserToProfile(user);
      }
    }

    const user: User = {
      userId: data.userId,
      email: normalizedEmail,
      emailVerified: data.emailVerified,
      wallets: {
        celo: data.walletAddress,
      },
      profile: {
        displayName: data.displayName,
        avatar: data.avatar,
      },
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    await mongoDatabase.createUser(user);
    return this.mapUserToProfile(user);
  }

  /**
   * Update user's last login time
   */
  async updateLastLogin(userId: string): Promise<void> {
    const payload = {
      lastLoginAt: new Date().toISOString(),
    };

    if (this.useRemoteApi) {
      await this.request("/api/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, updates: payload }),
      });
      return;
    }

    await mongoDatabase.updateUser(userId, payload);
  }

  private mapUserToProfile(user: User): UserProfile {
    return {
      userId: user.userId,
      email: user.email,
      displayName: user.profile.displayName,
      avatar: user.profile.avatar,
      wallets: user.wallets,
      isVerified: user.emailVerified,
    };
  }
}

// Export singleton instance
export const userDirectoryService = new UserDirectoryService();
