/**
 * Contact Service
 * Manages user contacts and recent recipients
 */

import { db } from "./database";
import { Contact } from "../types/database";

export type ContactSummary = {
  email: string;
  userId?: string;
  name?: string;
  lastSentAt: string;
  totalSent: number;
  favorite: boolean;
};

class ContactService {
  /**
   * Add or update a contact after sending
   */
  async recordSend(userId: string, recipientEmail: string, recipientUserId?: string, recipientName?: string): Promise<void> {
    const contacts = await db.getRecentContacts(userId, 1000);
    const existing = contacts.find((c) => c.recipientEmail.toLowerCase() === recipientEmail.toLowerCase());

    const contact: Contact = {
      userId,
      recipientEmail: recipientEmail.toLowerCase(),
      recipientUserId,
      recipientName,
      lastSentAt: new Date().toISOString(),
      totalSent: existing ? existing.totalSent + 1 : 1,
      favorite: existing?.favorite || false,
    };

    await db.addContact(contact);
  }

  /**
   * Get recent recipients
   */
  async getRecentContacts(userId: string, limit = 10): Promise<ContactSummary[]> {
    const contacts = await db.getRecentContacts(userId, limit);
    
    return contacts.map((contact) => ({
      email: contact.recipientEmail,
      userId: contact.recipientUserId,
      name: contact.recipientName,
      lastSentAt: contact.lastSentAt,
      totalSent: contact.totalSent,
      favorite: contact.favorite,
    }));
  }

  /**
   * Get favorite contacts
   */
  async getFavoriteContacts(userId: string): Promise<ContactSummary[]> {
    const contacts = await db.getFavoriteContacts(userId);
    
    return contacts.map((contact) => ({
      email: contact.recipientEmail,
      userId: contact.recipientUserId,
      name: contact.recipientName,
      lastSentAt: contact.lastSentAt,
      totalSent: contact.totalSent,
      favorite: contact.favorite,
    }));
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(userId: string, recipientEmail: string): Promise<boolean> {
    const contacts = await db.getRecentContacts(userId, 1000);
    const contact = contacts.find((c) => c.recipientEmail.toLowerCase() === recipientEmail.toLowerCase());

    if (!contact) {
      throw new Error("Contact not found");
    }

    const updated: Contact = {
      ...contact,
      favorite: !contact.favorite,
    };

    await db.addContact(updated);
    return updated.favorite;
  }

  /**
   * Search contacts
   */
  async searchContacts(userId: string, query: string): Promise<ContactSummary[]> {
    const contacts = await db.getRecentContacts(userId, 100);
    const lowerQuery = query.toLowerCase();

    const filtered = contacts.filter(
      (contact) =>
        contact.recipientEmail.toLowerCase().includes(lowerQuery) ||
        contact.recipientName?.toLowerCase().includes(lowerQuery)
    );

    return filtered.slice(0, 10).map((contact) => ({
      email: contact.recipientEmail,
      userId: contact.recipientUserId,
      name: contact.recipientName,
      lastSentAt: contact.lastSentAt,
      totalSent: contact.totalSent,
      favorite: contact.favorite,
    }));
  }
}

// Export singleton instance
export const contactService = new ContactService();
