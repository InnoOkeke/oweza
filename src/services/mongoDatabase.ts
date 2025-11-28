/**
 * MongoDB database implementation
 * Production-ready database service using MongoDB Atlas
 */

import { MongoClient, Db, Collection } from "mongodb";
import { User, PendingTransfer, Contact, TransferNotification } from "../types/database";
import { TransferRecord } from "../types/transfers";

declare const require: any;

type ExpoExtra = {
  mongodbUri?: string;
};

class MongoDatabase {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private readonly extra = (() => {
    try {
      const Constants = require("expo-constants").default;
      return (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;
    } catch (_error) {
      return {} as ExpoExtra;
    }
  })();

  private async connect(): Promise<Db> {
    if (this.db) {
      console.log('♻️ Reusing existing MongoDB connection');
      return this.db;
    }

    const uri = this.extra.mongodbUri || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI not configured in environment variables");
    }

    console.log('🔌 Connecting to MongoDB Atlas...');

    try {
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000, // 5 second timeout
        connectTimeoutMS: 10000, // 10 second connection timeout
        socketTimeoutMS: 10000, // Match Vercel free tier limit
      });

      await this.client.connect();
      console.log('✅ MongoDB connected successfully');

      this.db = this.client.db("metasend");

      // Create indexes (fire-and-forget, no await)
      this.createIndexes().catch(err => {
        console.warn('⚠️ Index creation warning:', err.message);
      });

      return this.db;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) return;

    // Users collection indexes
    await this.db.collection("users").createIndex({ email: 1 }, { unique: true });
    await this.db.collection("users").createIndex({ userId: 1 }, { unique: true });

    // Pending transfers indexes
    await this.db.collection("pendingTransfers").createIndex({ transferId: 1 }, { unique: true });
    await this.db.collection("pendingTransfers").createIndex({ recipientEmail: 1 });
    await this.db.collection("pendingTransfers").createIndex({ senderUserId: 1 });
    await this.db.collection("pendingTransfers").createIndex({ status: 1, expiresAt: 1 });

    // Contacts indexes
    await this.db.collection("contacts").createIndex({ userId: 1, recipientEmail: 1 }, { unique: true });
    await this.db.collection("contacts").createIndex({ userId: 1, lastSentAt: -1 });
    await this.db.collection("contacts").createIndex({ userId: 1, favorite: 1 });

    // Notifications indexes
    await this.db.collection("notifications").createIndex({ userId: 1, createdAt: -1 });
    await this.db.collection("notifications").createIndex({ notificationId: 1 }, { unique: true });

    // Transfers indexes
    await this.db.collection("transfers").createIndex({ senderWallet: 1, createdAt: -1 });
    await this.db.collection("transfers").createIndex({ "intent.senderUserId": 1, createdAt: -1 });

    // Payment requests indexes
    await this.db.collection("paymentRequests").createIndex({ requestId: 1 }, { unique: true });
    await this.db.collection("paymentRequests").createIndex({ creatorUserId: 1, createdAt: -1 });
    await this.db.collection("paymentRequests").createIndex({ payerEmail: 1 });
    await this.db.collection("paymentRequests").createIndex({ status: 1, expiresAt: 1 });

    // Tip jars indexes
    await this.db.collection("tipJars").createIndex({ jarId: 1 }, { unique: true });
    await this.db.collection("tipJars").createIndex({ creatorUserId: 1, status: 1 });

    // Tips indexes
    await this.db.collection("tips").createIndex({ tipId: 1 }, { unique: true });
    await this.db.collection("tips").createIndex({ jarId: 1, createdAt: -1 });
    await this.db.collection("tips").createIndex({ tipperUserId: 1, createdAt: -1 });

    // Invoices indexes
    await this.db.collection("invoices").createIndex({ invoiceId: 1 }, { unique: true });
    await this.db.collection("invoices").createIndex({ invoiceNumber: 1 }, { unique: true });
    await this.db.collection("invoices").createIndex({ creatorUserId: 1, createdAt: -1 });
    await this.db.collection("invoices").createIndex({ clientEmail: 1 });
    await this.db.collection("invoices").createIndex({ status: 1, dueDate: 1 });

    // Crypto gifts indexes
    await this.db.collection("gifts").createIndex({ giftId: 1 }, { unique: true });
    await this.db.collection("gifts").createIndex({ senderUserId: 1, createdAt: -1 });
    await this.db.collection("gifts").createIndex({ recipientEmail: 1, status: 1 });

    await this.db.collection("gifts").createIndex({ status: 1, expiresAt: 1 });
  }

  private async getCollection<T extends Record<string, any>>(name: string): Promise<Collection<T>> {
    const db = await this.connect();
    return db.collection<T>(name);
  }

  // User operations
  async createUser(user: User): Promise<User> {
    const collection = await this.getCollection<User>("users");
    // Normalize email to lowercase before storing
    const normalizedUser = {
      ...user,
      email: user.email.toLowerCase().trim(),
    };
    await collection.insertOne(normalizedUser as any);
    return normalizedUser;
  }

  async getUserById(userId: string): Promise<User | null> {
    const collection = await this.getCollection<User>("users");
    return await collection.findOne({ userId } as any);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const collection = await this.getCollection<User>("users");
    // Normalize email to lowercase and use direct comparison for better performance
    const normalizedEmail = email.toLowerCase().trim();
    return await collection.findOne({ email: normalizedEmail } as any);
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | null> {
    const collection = await this.getCollection<User>("users");
    // Case-insensitive search for wallet address in base chain
    return await collection.findOne({ "wallets.base": { $regex: new RegExp(`^${walletAddress}$`, "i") } } as any);
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const collection = await this.getCollection<User>("users");
    const result = await collection.findOneAndUpdate(
      { userId } as any,
      { $set: updates as any },
      { returnDocument: "after" }
    );
    return result || null;
  }

  async searchUsersByEmail(query: string, limit = 10): Promise<User[]> {
    const collection = await this.getCollection<User>("users");
    return await collection
      .find({ email: { $regex: new RegExp(query, "i") } } as any)
      .limit(limit)
      .toArray();
  }

  // Pending transfer operations
  async createPendingTransfer(transfer: PendingTransfer): Promise<PendingTransfer> {
    const collection = await this.getCollection<PendingTransfer>("pendingTransfers");
    await collection.insertOne(transfer as any);
    return transfer;
  }

  async getPendingTransferById(transferId: string): Promise<PendingTransfer | null> {
    const collection = await this.getCollection<PendingTransfer>("pendingTransfers");
    return await collection.findOne({ transferId } as any);
  }

  async getPendingTransfersByRecipientEmail(email: string): Promise<PendingTransfer[]> {
    const collection = await this.getCollection<PendingTransfer>("pendingTransfers");
    // Normalize email to lowercase for consistent querying
    const normalizedEmail = email.toLowerCase().trim();
    return await collection
      .find({
        recipientEmail: normalizedEmail,
        status: "pending",
      } as any)
      .toArray();
  }

  async getPendingTransfersBySender(senderUserId: string): Promise<PendingTransfer[]> {
    const collection = await this.getCollection<PendingTransfer>("pendingTransfers");
    return await collection.find({ senderUserId } as any).toArray();
  }

  async updatePendingTransfer(
    transferId: string,
    updates: Partial<PendingTransfer>
  ): Promise<PendingTransfer | null> {
    const collection = await this.getCollection<PendingTransfer>("pendingTransfers");
    const result = await collection.findOneAndUpdate(
      { transferId } as any,
      { $set: updates as any },
      { returnDocument: "after" }
    );
    return result || null;
  }

  async getExpiredPendingTransfers(): Promise<PendingTransfer[]> {
    const collection = await this.getCollection<PendingTransfer>("pendingTransfers");
    const now = new Date().toISOString();
    return await collection
      .find({
        status: "pending",
        expiresAt: { $lt: now },
      } as any)
      .toArray();
  }

  async getExpiringPendingTransfers(hoursUntilExpiry: number): Promise<PendingTransfer[]> {
    const collection = await this.getCollection<PendingTransfer>("pendingTransfers");
    const now = new Date().toISOString();
    const threshold = new Date(Date.now() + hoursUntilExpiry * 60 * 60 * 1000).toISOString();
    return await collection
      .find({
        status: "pending",
        expiresAt: { $gt: now, $lte: threshold },
      } as any)
      .toArray();
  }

  // Contact operations
  async addContact(contact: Contact): Promise<Contact> {
    const collection = await this.getCollection<Contact>("contacts");
    await collection.updateOne(
      { userId: contact.userId, recipientEmail: contact.recipientEmail } as any,
      { $set: contact as any },
      { upsert: true }
    );
    return contact;
  }

  async getRecentContacts(userId: string, limit = 10): Promise<Contact[]> {
    const collection = await this.getCollection<Contact>("contacts");
    return await collection
      .find({ userId } as any)
      .sort({ lastSentAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getFavoriteContacts(userId: string): Promise<Contact[]> {
    const collection = await this.getCollection<Contact>("contacts");
    return await collection
      .find({ userId, favorite: true } as any)
      .sort({ lastSentAt: -1 })
      .toArray();
  }

  // Notification operations
  async createNotification(notification: TransferNotification): Promise<TransferNotification> {
    const collection = await this.getCollection<TransferNotification>("notifications");
    await collection.insertOne(notification as any);
    return notification;
  }

  async getNotifications(userId: string, limit = 50): Promise<TransferNotification[]> {
    const collection = await this.getCollection<TransferNotification>("notifications");
    return await collection
      .find({ userId } as any)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    const collection = await this.getCollection<TransferNotification>("notifications");
    const result = await collection.updateOne(
      { notificationId, userId } as any,
      { $set: { read: true } as any }
    );
    return result.modifiedCount > 0;
  }

  async saveTransferRecord(record: TransferRecord): Promise<void> {
    const collection = await this.getCollection<TransferRecord>("transfers");
    await collection.insertOne(record as any);
  }

  async listTransferRecords(filter: { senderWallet?: string; senderUserId?: string; limit?: number } = {}): Promise<TransferRecord[]> {
    const collection = await this.getCollection<TransferRecord>("transfers");
    const query: Record<string, any> = {};

    if (filter.senderWallet) {
      query.senderWallet = { $regex: new RegExp(`^${filter.senderWallet}$`, "i") };
    }

    if (filter.senderUserId) {
      query["intent.senderUserId"] = filter.senderUserId;
    }

    const limit = filter.limit ?? 50;
    return await collection.find(query as any).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  // Payment Request operations
  async createPaymentRequest(request: any): Promise<any> {
    const collection = await this.getCollection("paymentRequests");
    await collection.insertOne(request);
    return request;
  }

  async getPaymentRequestById(requestId: string): Promise<any | null> {
    const collection = await this.getCollection("paymentRequests");
    return await collection.findOne({ requestId } as any);
  }

  async getPaymentRequestsByCreator(creatorUserId: string): Promise<any[]> {
    const collection = await this.getCollection("paymentRequests");
    return await collection.find({ creatorUserId } as any).sort({ createdAt: -1 }).toArray();
  }

  async getPaymentRequestsByPayer(payerEmail: string): Promise<any[]> {
    const collection = await this.getCollection("paymentRequests");
    const normalizedEmail = payerEmail.toLowerCase().trim();
    return await collection.find({ payerEmail: normalizedEmail } as any).sort({ createdAt: -1 }).toArray();
  }

  async updatePaymentRequest(requestId: string, updates: any): Promise<any | null> {
    const collection = await this.getCollection("paymentRequests");
    const result = await collection.findOneAndUpdate(
      { requestId } as any,
      { $set: updates },
      { returnDocument: "after" }
    );
    return result || null;
  }

  // Tip Jar operations
  async createTipJar(jar: any): Promise<any> {
    console.log('[mongoDatabase] createTipJar called with:', jar);
    const collection = await this.getCollection("tipJars");
    try {
      const result = await collection.insertOne(jar);
      console.log('[mongoDatabase] createTipJar insertOne result:', result);
      if (!result || !result.insertedId) {
        console.error('[mongoDatabase] createTipJar failed: No insertedId');
        return null;
      }
      return jar;
    } catch (err) {
      console.error('[mongoDatabase] createTipJar error:', err);
      return null;
    }
  }

  async getTipJarById(jarId: string): Promise<any | null> {
    const collection = await this.getCollection("tipJars");
    return await collection.findOne({ jarId } as any);
  }

  async getTipJarsByCreator(creatorUserId: string): Promise<any[]> {
    const collection = await this.getCollection("tipJars");
    return await collection.find({ creatorUserId } as any).sort({ createdAt: -1 }).toArray();
  }

  async getTipJarByUsername(username: string): Promise<any | null> {
    const collection = await this.getCollection("tipJars");
    // Case-insensitive search for username
    return await collection.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } } as any);
  }

  async updateTipJar(jarId: string, updates: any): Promise<any | null> {
    const collection = await this.getCollection("tipJars");
    const result = await collection.findOneAndUpdate(
      { jarId } as any,
      { $set: updates },
      { returnDocument: "after" }
    );
    return result || null;
  }

  // Tip operations
  async createTip(tip: any): Promise<any> {
    const collection = await this.getCollection("tips");
    await collection.insertOne(tip);
    return tip;
  }

  async getTipsByJar(jarId: string, limit = 50): Promise<any[]> {
    const collection = await this.getCollection("tips");
    return await collection.find({ jarId } as any).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async getTipsByTipper(tipperUserId: string, limit = 50): Promise<any[]> {
    const collection = await this.getCollection("tips");
    return await collection.find({ tipperUserId } as any).sort({ createdAt: -1 }).limit(limit).toArray();
  }

  // Invoice operations
  async createInvoice(invoice: any): Promise<any> {
    const collection = await this.getCollection("invoices");
    await collection.insertOne(invoice);
    return invoice;
  }

  async getInvoiceById(invoiceId: string): Promise<any | null> {
    const collection = await this.getCollection("invoices");
    return await collection.findOne({ invoiceId } as any);
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<any | null> {
    const collection = await this.getCollection("invoices");
    return await collection.findOne({ invoiceNumber } as any);
  }

  async getInvoicesByCreator(creatorUserId: string): Promise<any[]> {
    const collection = await this.getCollection("invoices");
    return await collection.find({ creatorUserId } as any).sort({ createdAt: -1 }).toArray();
  }

  async getInvoicesByClient(clientEmail: string): Promise<any[]> {
    const collection = await this.getCollection("invoices");
    const normalizedEmail = clientEmail.toLowerCase().trim();
    return await collection.find({ clientEmail: normalizedEmail } as any).sort({ createdAt: -1 }).toArray();
  }

  async getOverdueInvoices(): Promise<any[]> {
    const collection = await this.getCollection("invoices");
    const now = new Date().toISOString();
    return await collection.find({
      status: "sent",
      dueDate: { $lt: now },
    } as any).toArray();
  }

  async updateInvoice(invoiceId: string, updates: any): Promise<any | null> {
    const collection = await this.getCollection("invoices");
    const result = await collection.findOneAndUpdate(
      { invoiceId } as any,
      { $set: updates },
      { returnDocument: "after" }
    );
    return result || null;
  }

  // Crypto Gift operations
  async createGift(gift: any): Promise<any> {
    const collection = await this.getCollection("gifts");
    await collection.insertOne(gift);
    return gift;
  }

  async getGiftById(giftId: string): Promise<any | null> {
    const collection = await this.getCollection("gifts");
    return await collection.findOne({ giftId } as any);
  }

  async getGiftsBySender(senderUserId: string): Promise<any[]> {
    const collection = await this.getCollection("gifts");
    return await collection.find({ senderUserId } as any).sort({ createdAt: -1 }).toArray();
  }

  async getGiftsByRecipient(recipientEmail: string): Promise<any[]> {
    const collection = await this.getCollection("gifts");
    const normalizedEmail = recipientEmail.toLowerCase().trim();
    return await collection.find({
      recipientEmail: normalizedEmail,
      status: "pending",
    } as any).sort({ createdAt: -1 }).toArray();
  }

  async getExpiredGifts(): Promise<any[]> {
    const collection = await this.getCollection("gifts");
    const now = new Date().toISOString();
    return await collection.find({
      status: "pending",
      expiresAt: { $lt: now },
    } as any).toArray();
  }

  async updateGift(giftId: string, updates: any): Promise<any | null> {
    const collection = await this.getCollection("gifts");
    const result = await collection.findOneAndUpdate(
      { giftId } as any,
      { $set: updates },
      { returnDocument: "after" }
    );
    return result || null;
  }
}

// Export singleton instance
const mongoDb = new MongoDatabase();
export default mongoDb;