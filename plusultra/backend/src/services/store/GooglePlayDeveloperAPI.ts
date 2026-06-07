import { google, androidpublisher_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';

/**
 * Google Play Developer API Client
 * Implements real Google Play Console REST API integration
 * Docs: https://developers.google.com/android-publisher
 */

export interface GooglePlayConfig {
  serviceAccountEmail: string;
  serviceAccountKey: string; // JSON key or file path
  packageName: string;
}

export interface AppEdit {
  id: string;
  expiryTimeSeconds: string;
}

export interface AppDetails {
  defaultLanguage: string;
  contactEmail: string;
  contactPhone?: string;
  contactWebsite?: string;
}

export interface Listing {
  language: string;
  title: string;
  fullDescription: string;
  shortDescription: string;
  video?: string;
}

export interface Track {
  track: 'internal' | 'alpha' | 'beta' | 'production';
  releases: Array<{
    name?: string;
    versionCodes: number[];
    status: 'draft' | 'inProgress' | 'halted' | 'completed';
    releaseNotes?: Array<{
      language: string;
      text: string;
    }>;
  }>;
}

export interface Bundle {
  versionCode: number;
  sha256: string;
}

export interface PlayStoreSubmissionResult {
  submissionId: string;
  platform: 'android';
  status: 'submitted' | 'pending' | 'processing' | 'rejected' | 'approved';
  storeUrl: string;
  submittedAt: Date;
  track: 'internal' | 'alpha' | 'beta' | 'production';
  versionCode?: number;
}

export class GooglePlayDeveloperAPI {
  private androidPublisher: androidpublisher_v3.Androidpublisher;
  private auth: JWT;
  private config: GooglePlayConfig;

  constructor(config: GooglePlayConfig) {
    this.config = config;
    this.auth = this.createAuthClient();
    this.androidPublisher = google.androidpublisher({
      version: 'v3',
      auth: this.auth,
    });
  }

  /**
   * Create authenticated Google API client
   */
  private createAuthClient(): JWT {
    let keyData: any;

    // If serviceAccountKey is a JSON string, parse it
    try {
      keyData = JSON.parse(this.config.serviceAccountKey);
    } catch (error) {
      // If it's a file path, we'll handle it differently
      throw new Error('Service account key must be valid JSON or a file path');
    }

    return new JWT({
      email: this.config.serviceAccountEmail,
      key: keyData.private_key,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
  }

  /**
   * Load service account key from file
   */
  static async loadServiceAccountKey(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  }

  /**
   * Create a new edit (required for all modifications)
   */
  async createEdit(): Promise<AppEdit> {
    try {
      const response = await this.androidPublisher.edits.insert({
        packageName: this.config.packageName,
      });

      if (!response.data.id || !response.data.expiryTimeSeconds) {
        throw new Error('Invalid edit response');
      }

      return {
        id: response.data.id,
        expiryTimeSeconds: response.data.expiryTimeSeconds,
      };
    } catch (error) {
      console.error('Failed to create edit:', error);
      throw new Error(`Failed to create edit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Commit an edit (apply all changes)
   */
  async commitEdit(editId: string): Promise<void> {
    try {
      await this.androidPublisher.edits.commit({
        packageName: this.config.packageName,
        editId: editId,
      });
    } catch (error) {
      console.error('Failed to commit edit:', error);
      throw new Error(`Failed to commit edit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete an edit (cancel changes)
   */
  async deleteEdit(editId: string): Promise<void> {
    try {
      await this.androidPublisher.edits.delete({
        packageName: this.config.packageName,
        editId: editId,
      });
    } catch (error) {
      console.error('Failed to delete edit:', error);
      throw new Error(`Failed to delete edit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload AAB (Android App Bundle)
   */
  async uploadBundle(editId: string, bundlePath: string): Promise<Bundle> {
    try {
      const fileStats = await fs.stat(bundlePath);
      const fileStream = require('fs').createReadStream(bundlePath);

      const response = await this.androidPublisher.edits.bundles.upload({
        packageName: this.config.packageName,
        editId: editId,
        media: {
          mimeType: 'application/octet-stream',
          body: fileStream,
        },
      });

      if (!response.data.versionCode) {
        throw new Error('No version code returned from bundle upload');
      }

      return {
        versionCode: response.data.versionCode,
        sha256: response.data.sha256 || '',
      };
    } catch (error) {
      console.error('Failed to upload bundle:', error);
      throw new Error(`Failed to upload bundle: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload APK (Android Package)
   */
  async uploadApk(editId: string, apkPath: string): Promise<Bundle> {
    try {
      const fileStream = require('fs').createReadStream(apkPath);

      const response = await this.androidPublisher.edits.apks.upload({
        packageName: this.config.packageName,
        editId: editId,
        media: {
          mimeType: 'application/vnd.android.package-archive',
          body: fileStream,
        },
      });

      if (!response.data.versionCode) {
        throw new Error('No version code returned from APK upload');
      }

      return {
        versionCode: response.data.versionCode,
        sha256: response.data.binary?.sha256 || '',
      };
    } catch (error) {
      console.error('Failed to upload APK:', error);
      throw new Error(`Failed to upload APK: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update app details
   */
  async updateDetails(editId: string, details: AppDetails): Promise<void> {
    try {
      await this.androidPublisher.edits.details.update({
        packageName: this.config.packageName,
        editId: editId,
        requestBody: {
          defaultLanguage: details.defaultLanguage,
          contactEmail: details.contactEmail,
          contactPhone: details.contactPhone,
          contactWebsite: details.contactWebsite,
        },
      });
    } catch (error) {
      console.error('Failed to update details:', error);
      throw new Error(`Failed to update details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update listing information
   */
  async updateListing(editId: string, listing: Listing): Promise<void> {
    try {
      await this.androidPublisher.edits.listings.update({
        packageName: this.config.packageName,
        editId: editId,
        language: listing.language,
        requestBody: {
          title: listing.title,
          fullDescription: listing.fullDescription,
          shortDescription: listing.shortDescription,
          video: listing.video,
        },
      });
    } catch (error) {
      console.error('Failed to update listing:', error);
      throw new Error(`Failed to update listing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload screenshot
   */
  async uploadScreenshot(
    editId: string,
    language: string,
    imageType: 'phoneScreenshots' | 'sevenInchScreenshots' | 'tenInchScreenshots' | 'tvScreenshots' | 'wearScreenshots',
    imagePath: string
  ): Promise<{ id: string; url: string }> {
    try {
      const fileStream = require('fs').createReadStream(imagePath);

      const response = await this.androidPublisher.edits.images.upload({
        packageName: this.config.packageName,
        editId: editId,
        language: language,
        imageType: imageType,
        media: {
          mimeType: 'image/png',
          body: fileStream,
        },
      });

      return {
        id: (response.data as any).id || '',
        url: (response.data as any).url || '',
      };
    } catch (error) {
      console.error('Failed to upload screenshot:', error);
      throw new Error(`Failed to upload screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete screenshot
   */
  async deleteScreenshot(
    editId: string,
    language: string,
    imageType: 'phoneScreenshots' | 'sevenInchScreenshots' | 'tenInchScreenshots' | 'tvScreenshots' | 'wearScreenshots',
    imageId: string
  ): Promise<void> {
    try {
      await this.androidPublisher.edits.images.delete({
        packageName: this.config.packageName,
        editId: editId,
        language: language,
        imageType: imageType,
        imageId: imageId,
      });
    } catch (error) {
      console.error('Failed to delete screenshot:', error);
      throw new Error(`Failed to delete screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload feature graphic
   */
  async uploadFeatureGraphic(editId: string, language: string, imagePath: string): Promise<{ id: string; url: string }> {
    try {
      const fileStream = require('fs').createReadStream(imagePath);

      const response = await this.androidPublisher.edits.images.upload({
        packageName: this.config.packageName,
        editId: editId,
        language: language,
        imageType: 'featureGraphic',
        media: {
          mimeType: 'image/png',
          body: fileStream,
        },
      });

      return {
        id: (response.data as any).id || '',
        url: (response.data as any).url || '',
      };
    } catch (error) {
      console.error('Failed to upload feature graphic:', error);
      throw new Error(`Failed to upload feature graphic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update track (release to internal/alpha/beta/production)
   */
  async updateTrack(editId: string, track: Track): Promise<void> {
    try {
      await this.androidPublisher.edits.tracks.update({
        packageName: this.config.packageName,
        editId: editId,
        track: track.track,
        requestBody: {
          track: track.track,
          releases: track.releases.map(r => ({
            ...r,
            versionCodes: r.versionCodes.map(v => String(v)),
          })),
        },
      } as any);
    } catch (error) {
      console.error('Failed to update track:', error);
      throw new Error(`Failed to update track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get track information
   */
  async getTrack(
    editId: string,
    trackName: 'internal' | 'alpha' | 'beta' | 'production'
  ): Promise<Track | null> {
    try {
      const response = await this.androidPublisher.edits.tracks.get({
        packageName: this.config.packageName,
        editId: editId,
        track: trackName,
      });

      if (!response.data.track || !response.data.releases) {
        return null;
      }

      return {
        track: response.data.track as any,
        releases: response.data.releases as any,
      };
    } catch (error) {
      console.error('Failed to get track:', error);
      return null;
    }
  }

  /**
   * Complete submission workflow
   */
  async submitApp(data: {
    bundlePath: string;
    track: 'internal' | 'alpha' | 'beta' | 'production';
    releaseNotes: Array<{ language: string; text: string }>;
    listing: Listing;
    details: AppDetails;
    screenshots?: {
      language: string;
      phoneScreenshots?: string[];
      featureGraphic?: string;
    }[];
  }): Promise<PlayStoreSubmissionResult> {
    let editId: string | null = null;

    try {
      // Step 1: Create edit
      const edit = await this.createEdit();
      editId = edit.id;

      // Step 2: Upload bundle
      const bundle = await this.uploadBundle(editId, data.bundlePath);

      // Step 3: Update details
      await this.updateDetails(editId, data.details);

      // Step 4: Update listing
      await this.updateListing(editId, data.listing);

      // Step 5: Upload screenshots
      if (data.screenshots) {
        for (const screenshotSet of data.screenshots) {
          if (screenshotSet.phoneScreenshots) {
            for (const screenshot of screenshotSet.phoneScreenshots) {
              await this.uploadScreenshot(
                editId,
                screenshotSet.language,
                'phoneScreenshots',
                screenshot
              );
            }
          }

          if (screenshotSet.featureGraphic) {
            await this.uploadFeatureGraphic(
              editId,
              screenshotSet.language,
              screenshotSet.featureGraphic
            );
          }
        }
      }

      // Step 6: Update track (release)
      await this.updateTrack(editId, {
        track: data.track,
        releases: [
          {
            versionCodes: [bundle.versionCode],
            status: 'completed',
            releaseNotes: data.releaseNotes,
          },
        ],
      });

      // Step 7: Commit edit
      await this.commitEdit(editId);

      return {
        submissionId: `playstore_${Date.now()}_${bundle.versionCode}`,
        platform: 'android',
        status: 'submitted',
        storeUrl: `https://play.google.com/store/apps/details?id=${this.config.packageName}`,
        submittedAt: new Date(),
        track: data.track,
        versionCode: bundle.versionCode,
      };
    } catch (error) {
      // If edit was created but failed, try to delete it
      if (editId) {
        try {
          await this.deleteEdit(editId);
        } catch (deleteError) {
          console.error('Failed to clean up edit:', deleteError);
        }
      }

      console.error('Failed to submit app:', error);
      throw new Error(`Failed to submit app: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get app information
   */
  async getAppDetails(): Promise<any> {
    try {
      // Create temporary edit to read data
      const edit = await this.createEdit();

      const detailsResponse = await this.androidPublisher.edits.details.get({
        packageName: this.config.packageName,
        editId: edit.id,
      });

      // Clean up edit
      await this.deleteEdit(edit.id);

      return detailsResponse.data;
    } catch (error) {
      console.error('Failed to get app details:', error);
      throw new Error(`Failed to get app details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get reviews
   */
  async getReviews(maxResults: number = 100): Promise<any[]> {
    try {
      const response = await this.androidPublisher.reviews.list({
        packageName: this.config.packageName,
        maxResults: maxResults,
      });

      return response.data.reviews || [];
    } catch (error) {
      console.error('Failed to get reviews:', error);
      throw new Error(`Failed to get reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Reply to review
   */
  async replyToReview(reviewId: string, replyText: string): Promise<void> {
    try {
      await this.androidPublisher.reviews.reply({
        packageName: this.config.packageName,
        reviewId: reviewId,
        requestBody: {
          replyText: replyText,
        },
      });
    } catch (error) {
      console.error('Failed to reply to review:', error);
      throw new Error(`Failed to reply to review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default GooglePlayDeveloperAPI;
