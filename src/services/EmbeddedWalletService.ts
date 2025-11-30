/**
 * Embedded Wallet Service
 * Creates and manages wallets stored securely on the device
 */

import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const WALLET_KEY = 'oweza_wallet_private_key';
const WALLET_ADDRESS_KEY = 'oweza_wallet_address';

export class EmbeddedWalletService {
  private wallet: ethers.Wallet | null = null;

  /**
   * Create a new wallet and store it securely
   */
  async createWallet(): Promise<{ address: string; mnemonic?: string }> {
    try {
      // Generate a new random wallet
      const newWallet = ethers.Wallet.createRandom();
      
      // Store private key securely
      await SecureStore.setItemAsync(WALLET_KEY, newWallet.privateKey);
      await SecureStore.setItemAsync(WALLET_ADDRESS_KEY, newWallet.address);
      
      this.wallet = newWallet;
      
      console.log('✅ Wallet created:', newWallet.address);
      
      return {
        address: newWallet.address,
        mnemonic: newWallet.mnemonic?.phrase, // Return for backup
      };
    } catch (error) {
      console.error('❌ Failed to create wallet:', error);
      throw new Error('Failed to create wallet');
    }
  }

  /**
   * Load existing wallet from secure storage
   */
  async loadWallet(): Promise<string | null> {
    try {
      const privateKey = await SecureStore.getItemAsync(WALLET_KEY);
      
      if (!privateKey) {
        return null;
      }
      
      this.wallet = new ethers.Wallet(privateKey);
      console.log('✅ Wallet loaded:', this.wallet.address);
      
      return this.wallet.address;
    } catch (error) {
      console.error('❌ Failed to load wallet:', error);
      return null;
    }
  }

  /**
   * Get or create wallet
   */
  async getOrCreateWallet(): Promise<string> {
    // Try to load existing wallet
    const existingAddress = await this.loadWallet();
    if (existingAddress) {
      return existingAddress;
    }
    
    // Create new wallet if none exists
    const { address } = await this.createWallet();
    return address;
  }

  /**
   * Get wallet instance (for signing transactions)
   */
  getWallet(): ethers.Wallet | null {
    return this.wallet;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string | null> {
    if (this.wallet) {
      return this.wallet.address;
    }
    
    return await SecureStore.getItemAsync(WALLET_ADDRESS_KEY);
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not loaded');
    }
    
    return await this.wallet.signMessage(message);
  }

  /**
   * Sign a transaction
   */
  async signTransaction(transaction: ethers.providers.TransactionRequest): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not loaded');
    }
    
    return await this.wallet.signTransaction(transaction);
  }

  /**
   * Export private key (use with caution!)
   */
  async exportPrivateKey(): Promise<string | null> {
    return await SecureStore.getItemAsync(WALLET_KEY);
  }

  /**
   * Delete wallet (logout)
   */
  async deleteWallet(): Promise<void> {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    await SecureStore.deleteItemAsync(WALLET_ADDRESS_KEY);
    this.wallet = null;
    console.log('✅ Wallet deleted');
  }

  /**
   * Check if wallet exists
   */
  async hasWallet(): Promise<boolean> {
    const privateKey = await SecureStore.getItemAsync(WALLET_KEY);
    return privateKey !== null;
  }
}

export const embeddedWalletService = new EmbeddedWalletService();
