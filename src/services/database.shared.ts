import { User, PendingTransfer, Contact, TransferNotification } from "../types/database";
import { TransferRecord } from "../types/transfers";

export class InMemoryDatabase {
  private users: Map<string, User> = new Map();
  private usersByEmail: Map<string, User> = new Map();
  private pendingTransfers: Map<string, PendingTransfer> = new Map();
  private contacts: Map<string, Contact[]> = new Map();
  private notifications: Map<string, TransferNotification[]> = new Map();
  private transferHistory: TransferRecord[] = [];

  async createUser(user: User): Promise<User> {
    this.users.set(user.userId, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    return user;
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.usersByEmail.get(email.toLowerCase()) || null;
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | null> {
    const lowerWallet = walletAddress.toLowerCase();
    for (const user of this.users.values()) {
      if (user.wallets?.base?.toLowerCase() === lowerWallet) {
        return user;
      }
    }
    return null;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    const updated = { ...user, ...updates };
    this.users.set(userId, updated);
    this.usersByEmail.set(updated.email.toLowerCase(), updated);
    return updated;
  }

  async searchUsersByEmail(query: string, limit = 10): Promise<User[]> {
    const results: User[] = [];
    const lowerQuery = query.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase().includes(lowerQuery)) {
        results.push(user);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async createPendingTransfer(transfer: PendingTransfer): Promise<PendingTransfer> {
    this.pendingTransfers.set(transfer.transferId, transfer);
    return transfer;
  }

  async getPendingTransferById(transferId: string): Promise<PendingTransfer | null> {
    return this.pendingTransfers.get(transferId) || null;
  }

  async getPendingTransfersByRecipientEmail(email: string): Promise<PendingTransfer[]> {
    return Array.from(this.pendingTransfers.values()).filter(
      (t) => t.recipientEmail.toLowerCase() === email.toLowerCase() && t.status === "pending"
    );
  }

  async getPendingTransfersBySender(senderUserId: string): Promise<PendingTransfer[]> {
    return Array.from(this.pendingTransfers.values()).filter((t) => t.senderUserId === senderUserId);
  }

  async updatePendingTransfer(transferId: string, updates: Partial<PendingTransfer>): Promise<PendingTransfer | null> {
    const transfer = this.pendingTransfers.get(transferId);
    if (!transfer) return null;
    const updated = { ...transfer, ...updates };
    this.pendingTransfers.set(transferId, updated);
    return updated;
  }

  async getExpiredPendingTransfers(): Promise<PendingTransfer[]> {
    const now = new Date().toISOString();
    return Array.from(this.pendingTransfers.values()).filter((t) => t.status === "pending" && t.expiresAt < now);
  }

  async getExpiringPendingTransfers(hoursUntilExpiry: number): Promise<PendingTransfer[]> {
    const threshold = new Date(Date.now() + hoursUntilExpiry * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    return Array.from(this.pendingTransfers.values()).filter(
      (t) => t.status === "pending" && t.expiresAt > now && t.expiresAt <= threshold
    );
  }

  async addContact(contact: Contact): Promise<Contact> {
    const userContacts = this.contacts.get(contact.userId) || [];
    const existingIndex = userContacts.findIndex((c) => c.recipientEmail === contact.recipientEmail);
    if (existingIndex >= 0) {
      userContacts[existingIndex] = contact;
    } else {
      userContacts.push(contact);
    }
    this.contacts.set(contact.userId, userContacts);
    return contact;
  }

  async getRecentContacts(userId: string, limit = 10): Promise<Contact[]> {
    const userContacts = this.contacts.get(userId) || [];
    return userContacts.sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt)).slice(0, limit);
  }

  async getFavoriteContacts(userId: string): Promise<Contact[]> {
    const userContacts = this.contacts.get(userId) || [];
    return userContacts.filter((c) => c.favorite).sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt));
  }

  async createNotification(notification: TransferNotification): Promise<TransferNotification> {
    const userNotifications = this.notifications.get(notification.userId) || [];
    userNotifications.unshift(notification);
    this.notifications.set(notification.userId, userNotifications);
    return notification;
  }

  async getNotifications(userId: string, limit = 50): Promise<TransferNotification[]> {
    const userNotifications = this.notifications.get(userId) || [];
    return userNotifications.slice(0, limit);
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    const userNotifications = this.notifications.get(userId) || [];
    const notification = userNotifications.find((n) => n.notificationId === notificationId);
    if (notification) {
      notification.read = true;
      return true;
    }
    return false;
  }

  async saveTransferRecord(record: TransferRecord): Promise<void> {
    this.transferHistory.unshift(record);
  }

  async listTransferRecords(filter: { senderWallet?: string; senderUserId?: string; limit?: number } = {}): Promise<TransferRecord[]> {
    const { senderWallet, senderUserId, limit = 50 } = filter;
    return this.transferHistory
      .filter((record) => {
        if (senderWallet && record.senderWallet.toLowerCase() !== senderWallet.toLowerCase()) {
          return false;
        }
        if (senderUserId && record.intent.senderUserId !== senderUserId) {
          return false;
        }
        return true;
      })
      .slice(0, limit);
  }
}

