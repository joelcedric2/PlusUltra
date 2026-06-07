import { promises as fs } from 'fs';
import * as path from 'path';
import axios from 'axios';
import crypto from 'crypto';

export interface ReceiptValidationRequest {
  receiptData: string;
  platform: 'ios' | 'android' | 'stripe';
  transactionId?: string;
  productId?: string;
}

export interface ReceiptValidationResponse {
  valid: boolean;
  platform: string;
  transactionId?: string;
  productId?: string;
  purchaseDate?: Date;
  expirationDate?: Date;
  error?: string;
  metadata?: any;
}

export interface AppleReceiptResponse {
  status: number;
  environment: string;
  receipt: {
    bundle_id: string;
    application_version: string;
    in_app?: Array<{
      transaction_id: string;
      product_id: string;
      purchase_date_ms: string;
      expires_date_ms?: string;
      quantity: string;
    }>;
  };
}

export interface GooglePlayReceiptResponse {
  purchaseTimeMillis: string;
  purchaseState: number;
  consumptionState: number;
  developerPayload?: string;
  orderId?: string;
  purchaseType?: number;
  acknowledgementState?: number;
  productId?: string;
  quantity?: number;
}

/**
 * Receipt Validation Service - Validates app store and payment receipts
 */
export class ReceiptValidationService {
  private appleSandboxUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';
  private appleProductionUrl = 'https://buy.itunes.apple.com/verifyReceipt';
  private googlePlayUrl = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

  /**
   * Validate receipt from various platforms
   */
  async validateReceipt(request: ReceiptValidationRequest): Promise<ReceiptValidationResponse> {
    try {
      console.log(`🔍 Validating ${request.platform} receipt for product: ${request.productId}`);

      switch (request.platform) {
        case 'ios':
          return await this.validateAppleReceipt(request);
        case 'android':
          return await this.validateGooglePlayReceipt(request);
        case 'stripe':
          return await this.validateStripeReceipt(request);
        default:
          throw new Error(`Unsupported platform: ${request.platform}`);
      }
    } catch (error: any) {
      console.error(`❌ Receipt validation failed:`, error);
      return {
        valid: false,
        platform: request.platform,
        error: error.message
      };
    }
  }

  /**
   * Validate Apple App Store receipt
   */
  private async validateAppleReceipt(request: ReceiptValidationRequest): Promise<ReceiptValidationResponse> {
    try {
      // First try with sandbox, then production
      const response = await this.validateWithAppleServer(request.receiptData, true);

      if (response.status === 21007) {
        // Receipt is from production, try production server
        const prodResponse = await this.validateWithAppleServer(request.receiptData, false);
        return this.parseAppleResponse(prodResponse, request);
      }

      return this.parseAppleResponse(response, request);
    } catch (error: any) {
      console.error('Apple receipt validation failed:', error);
      return {
        valid: false,
        platform: 'ios',
        error: error.message
      };
    }
  }

  /**
   * Validate Google Play Store receipt
   */
  private async validateGooglePlayReceipt(request: ReceiptValidationRequest): Promise<ReceiptValidationResponse> {
    try {
      // Implementation depends on Google Play Developer API
      // This is a simplified version - in production, you'd need proper API access

      const accessToken = process.env.GOOGLE_PLAY_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('Google Play access token not configured');
      }

      const url = `${this.googlePlayUrl}/applications/${request.productId}/purchases/products/${request.transactionId}/tokens/${request.receiptData}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return this.parseGooglePlayResponse(response.data, request);
    } catch (error: any) {
      console.error('Google Play receipt validation failed:', error);
      return {
        valid: false,
        platform: 'android',
        error: error.message
      };
    }
  }

  /**
   * Validate Stripe payment receipt
   */
  private async validateStripeReceipt(request: ReceiptValidationRequest): Promise<ReceiptValidationResponse> {
    try {
      // Stripe webhooks and API calls handle validation
      // This is a simplified implementation

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      const paymentIntent = await stripe.paymentIntents.retrieve(request.transactionId!);

      if (paymentIntent.status === 'succeeded') {
        return {
          valid: true,
          platform: 'stripe',
          transactionId: request.transactionId,
          productId: request.productId,
          purchaseDate: new Date(paymentIntent.created * 1000),
          metadata: {
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            customerId: paymentIntent.customer
          }
        };
      } else {
        return {
          valid: false,
          platform: 'stripe',
          error: `Payment status: ${paymentIntent.status}`
        };
      }
    } catch (error: any) {
      console.error('Stripe receipt validation failed:', error);
      return {
        valid: false,
        platform: 'stripe',
        error: error.message
      };
    }
  }

  /**
   * Validate receipt with Apple server
   */
  private async validateWithAppleServer(receiptData: string, sandbox: boolean): Promise<AppleReceiptResponse> {
    const url = sandbox ? this.appleSandboxUrl : this.appleProductionUrl;

    const response = await axios.post(url, {
      'receipt-data': receiptData
    });

    return response.data;
  }

  /**
   * Parse Apple receipt response
   */
  private parseAppleResponse(response: AppleReceiptResponse, request: ReceiptValidationRequest): ReceiptValidationResponse {
    if (response.status !== 0) {
      return {
        valid: false,
        platform: 'ios',
        error: `Apple validation failed with status: ${response.status}`
      };
    }

    // Find the specific in-app purchase
    const purchase = response.receipt.in_app?.find(
      item => item.transaction_id === request.transactionId || item.product_id === request.productId
    );

    if (!purchase) {
      return {
        valid: false,
        platform: 'ios',
        error: 'Transaction not found in receipt'
      };
    }

    return {
      valid: true,
      platform: 'ios',
      transactionId: purchase.transaction_id,
      productId: purchase.product_id,
      purchaseDate: new Date(parseInt(purchase.purchase_date_ms)),
      expirationDate: purchase.expires_date_ms ? new Date(parseInt(purchase.expires_date_ms)) : undefined,
      metadata: {
        bundleId: response.receipt.bundle_id,
        environment: response.environment,
        quantity: parseInt(purchase.quantity)
      }
    };
  }

  /**
   * Parse Google Play receipt response
   */
  private parseGooglePlayResponse(response: any, request: ReceiptValidationRequest): ReceiptValidationResponse {
    // Google Play purchase states: 0 = purchased, 1 = cancelled
    if (response.purchaseState !== 0) {
      return {
        valid: false,
        platform: 'android',
        error: `Invalid purchase state: ${response.purchaseState}`
      };
    }

    return {
      valid: true,
      platform: 'android',
      transactionId: response.orderId,
      productId: response.productId,
      purchaseDate: new Date(parseInt(response.purchaseTimeMillis)),
      metadata: {
        consumptionState: response.consumptionState,
        acknowledgementState: response.acknowledgementState,
        quantity: response.quantity || 1
      }
    };
  }

  /**
   * Verify receipt signature (for additional security)
   */
  async verifyReceiptSignature(receiptData: string, signature: string, platform: string): Promise<boolean> {
    try {
      switch (platform) {
        case 'ios':
          return await this.verifyAppleSignature(receiptData, signature);
        case 'android':
          return await this.verifyGooglePlaySignature(receiptData, signature);
        default:
          return false;
      }
    } catch (error) {
      console.error('Receipt signature verification failed:', error);
      return false;
    }
  }

  /**
   * Verify Apple receipt signature
   */
  private async verifyAppleSignature(receiptData: string, signature: string): Promise<boolean> {
    // Apple's receipt signature verification
    // This is a simplified implementation - production would use Apple's public key
    const publicKey = process.env.APPLE_RECEIPT_PUBLIC_KEY;

    if (!publicKey) {
      console.warn('Apple public key not configured, skipping signature verification');
      return true; // Allow in development
    }

    // Implementation would verify the signature using Apple's public key
    return true; // Placeholder
  }

  /**
   * Verify Google Play receipt signature
   */
  private async verifyGooglePlaySignature(receiptData: string, signature: string): Promise<boolean> {
    // Google Play uses RSA signature verification
    // Implementation would verify the signature using Google's public key
    return true; // Placeholder
  }

  /**
   * Check if receipt is expired
   */
  isReceiptExpired(expirationDate?: Date): boolean {
    if (!expirationDate) return false;
    return new Date() > expirationDate;
  }

  /**
   * Get subscription status from receipt
   */
  async getSubscriptionStatus(receiptData: string, platform: 'ios' | 'android'): Promise<any> {
    const validation = await this.validateReceipt({
      receiptData,
      platform,
      productId: 'subscription' // or specific subscription product ID
    });

    if (!validation.valid) {
      return {
        active: false,
        error: validation.error
      };
    }

    return {
      active: !this.isReceiptExpired(validation.expirationDate),
      expirationDate: validation.expirationDate,
      productId: validation.productId,
      platform: validation.platform
    };
  }
}

export const receiptValidationService = new ReceiptValidationService();
