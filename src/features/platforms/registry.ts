import { BasePlatformAdapter, PlatformAdapter } from "./adapter";

export class PatreonAdapter extends BasePlatformAdapter {
  platformSlug = "patreon";
  name = "Patreon";
  category = "subscription_ppv";
  websiteUrl = "https://patreon.com";
}

export class FanvueAdapter extends BasePlatformAdapter {
  platformSlug = "fanvue";
  name = "Fanvue";
  category = "subscription_ppv";
  websiteUrl = "https://fanvue.com";
}

export class AdobeStockAdapter extends BasePlatformAdapter {
  platformSlug = "adobe-stock";
  name = "Adobe Stock";
  category = "stock_media";
  websiteUrl = "https://stock.adobe.com";
}

export class ShutterstockAdapter extends BasePlatformAdapter {
  platformSlug = "shutterstock";
  name = "Shutterstock";
  category = "stock_media";
  websiteUrl = "https://shutterstock.com";
}

export class BilloAdapter extends BasePlatformAdapter {
  platformSlug = "billo";
  name = "Billo UGC";
  category = "ugc_brand";
  websiteUrl = "https://billo.app";
}

export class GumroadAdapter extends BasePlatformAdapter {
  platformSlug = "gumroad";
  name = "Gumroad";
  category = "digital_products";
  websiteUrl = "https://gumroad.com";
}

export class PlatformRegistry {
  private static adapters: Map<string, PlatformAdapter> = new Map([
    ["patreon", new PatreonAdapter()],
    ["fanvue", new FanvueAdapter()],
    ["adobe-stock", new AdobeStockAdapter()],
    ["shutterstock", new ShutterstockAdapter()],
    ["billo", new BilloAdapter()],
    ["gumroad", new GumroadAdapter()],
  ]);

  static getAdapter(slug: string): PlatformAdapter | undefined {
    return this.adapters.get(slug);
  }

  static getAllAdapters(): PlatformAdapter[] {
    return Array.from(this.adapters.values());
  }
}

