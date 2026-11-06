export interface PlatformPolicyInfo {
  policyType: string;
  summary: string;
  sourceUrl: string;
  verifiedAt: string;
  isCompliant: boolean;
}

export interface PlatformCapabilityInfo {
  name: string;
  isSupported: boolean;
  status: "unsupported" | "manual" | "automated";
  notes?: string;
}

export interface PlatformAdapter {
  platformSlug: string;
  getPlatformInfo(): Promise<{
    name: string;
    category: string;
    websiteUrl: string;
    integrationStatus: string;
  }>;
  getPolicies(): Promise<PlatformPolicyInfo[]>;
  getCapabilities(): Promise<PlatformCapabilityInfo[]>;
  getAccountStatus(): Promise<{ connected: boolean; username?: string; statusText: string }>;
  listAssets(): Promise<unknown[]>;
  createDraft(data: Record<string, unknown>): Promise<{ draftId: string; status: string }>;
  publishContent(draftId: string): Promise<{ success: boolean; publishedUrl?: string; error?: string }>;
  getAnalytics(): Promise<{ views: number; clicks: number; conversions: number }>;
  getRevenue(): Promise<{ grossVnd: number; feeVnd: number; netVnd: number; currency: string }>;
}

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract platformSlug: string;
  abstract name: string;
  abstract category: string;
  abstract websiteUrl: string;

  async getPlatformInfo() {
    return {
      name: this.name,
      category: this.category,
      websiteUrl: this.websiteUrl,
      integrationStatus: "manual",
    };
  }

  async getPolicies(): Promise<PlatformPolicyInfo[]> {
    return [];
  }

  async getCapabilities(): Promise<PlatformCapabilityInfo[]> {
    return [
      { name: "read_analytics", isSupported: false, status: "unsupported", notes: "Chưa có kết nối tài khoản." },
      { name: "draft_content", isSupported: false, status: "unsupported", notes: "Chưa có nơi lưu bản nháp." },
      { name: "direct_publish", isSupported: false, status: "unsupported", notes: "Chưa có tích hợp API đã xác minh." },
    ];
  }

  async getAccountStatus() {
    return {
      connected: false,
      statusText: "Chế độ quản lý thủ công (Manual Tracking)",
    };
  }

  async listAssets(): Promise<unknown[]> {
    throw new Error(`Asset access is unavailable for ${this.name}; no platform integration is configured.`);
  }

  async createDraft(_data: Record<string, unknown>): Promise<{ draftId: string; status: string }> {
    void _data;
    throw new Error(`Draft storage is unavailable for ${this.name}; no content repository is configured.`);
  }

  async publishContent(_draftId: string) {
    void _draftId;
    // Safety: Real publishing requires verified API or admin confirmation
    return {
      success: false,
      error: "Nền tảng chưa kích hoạt Direct API. Vui lòng xuất bản thủ công qua Admin Dashboard.",
    };
  }

  async getAnalytics(): Promise<{ views: number; clicks: number; conversions: number }> {
    throw new Error(`Analytics are unavailable for ${this.name}; no platform integration is configured.`);
  }

  async getRevenue(): Promise<{ grossVnd: number; feeVnd: number; netVnd: number; currency: string }> {
    throw new Error(`Revenue data is unavailable for ${this.name}; no platform integration is configured.`);
  }
}
