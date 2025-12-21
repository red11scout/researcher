import { Dub } from "dub";

interface CreateLinkOptions {
  url: string;
  customSlug?: string;
  externalId?: string;
  metadata?: {
    title?: string;
    description?: string;
  };
}

interface LinkResult {
  id: string;
  shortLink: string;
  qrCode: string;
  clicks: number;
  createdAt: string;
}

class DubService {
  private client: Dub | null = null;
  private maxRetries = 3;
  private baseDelay = 1000;

  private getClient(): Dub {
    if (!this.client) {
      const token = process.env.DUB_API_KEY;
      if (!token) {
        throw new Error("DUB_API_KEY environment variable is required");
      }
      this.client = new Dub({ token });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!process.env.DUB_API_KEY;
  }

  async createLink(options: CreateLinkOptions): Promise<LinkResult> {
    return this.withRetry(async () => {
      const client = this.getClient();
      const link = await client.links.create({
        url: options.url,
        key: options.customSlug,
        externalId: options.externalId,
        title: options.metadata?.title,
        description: options.metadata?.description,
        proxy: options.metadata ? true : false,
        trackConversion: true
      });

      return {
        id: link.id,
        shortLink: link.shortLink,
        qrCode: link.qrCode || "",
        clicks: link.clicks ?? 0,
        createdAt: link.createdAt
      };
    });
  }

  async createReportLink(
    reportUrl: string,
    reportId: string,
    companyName: string
  ): Promise<LinkResult> {
    const slug = `report-${reportId}`;
    return this.createLink({
      url: reportUrl,
      customSlug: slug,
      externalId: `report_${reportId}`,
      metadata: {
        title: `${companyName} AI Assessment Report`,
        description: "BlueAlly Insight - Enterprise AI Opportunity Assessment"
      }
    });
  }

  async getLink(linkId: string): Promise<LinkResult | null> {
    try {
      const client = this.getClient();
      const link = await client.links.get({ linkId });
      return {
        id: link.id,
        shortLink: link.shortLink,
        qrCode: link.qrCode || "",
        clicks: link.clicks ?? 0,
        createdAt: link.createdAt
      };
    } catch (error: any) {
      if (error.statusCode === 404) return null;
      throw error;
    }
  }

  async getLinkByExternalId(externalId: string): Promise<LinkResult | null> {
    try {
      const client = this.getClient();
      const link = await client.links.get({ 
        externalId: externalId 
      });
      return {
        id: link.id,
        shortLink: link.shortLink,
        qrCode: link.qrCode || "",
        clicks: link.clicks ?? 0,
        createdAt: link.createdAt
      };
    } catch (error: any) {
      if (error.statusCode === 404) return null;
      throw error;
    }
  }

  async deleteLink(linkId: string): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.links.delete(linkId);
      return true;
    } catch {
      return false;
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      const isRateLimited = error.statusCode === 429;
      const isServerError = error.statusCode >= 500;
      
      if ((isRateLimited || isServerError) && attempt <= this.maxRetries) {
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        console.log(`Dub API retry attempt ${attempt} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(operation, attempt + 1);
      }
      
      throw error;
    }
  }
}

export const dubService = new DubService();
