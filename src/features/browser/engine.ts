import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { validateTargetUrl } from "./ssrf-guard";
import type { PageInspectionResult, ScreenshotEvidence, BrowserEventType } from "./types";

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

export function resolveChromiumExecutable(): string | undefined {
  for (const p of EDGE_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

export interface BrowserSessionOptions {
  executionId: string;
  botId: string;
  allowLocalTest?: boolean;
  onEvent?: (eventType: BrowserEventType, details?: Record<string, unknown>, url?: string) => void;
}

export class RealBrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isDisposed = false;

  constructor(private readonly options: BrowserSessionOptions) {}

  public async initialize(): Promise<void> {
    const executablePath = resolveChromiumExecutable();

    this.options.onEvent?.("BROWSER_LAUNCHED", {
      engine: executablePath ? "Edge/Chromium System Binary" : "Playwright Default",
      executablePath,
    });

    this.browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    });

    this.page = await this.context.newPage();
  }

  public async navigate(targetUrl: string, timeoutMs = 30000): Promise<PageInspectionResult> {
    if (!this.page) {
      throw new Error("Browser session chưa được khởi tạo. Hãy gọi initialize() trước.");
    }

    // SSRF Security Check
    const ssrfCheck = validateTargetUrl(targetUrl, this.options.allowLocalTest);
    if (!ssrfCheck.isAllowed) {
      throw new Error(ssrfCheck.reason || "URL bị từ chối bởi SSRF Guard.");
    }

    const safeUrl = ssrfCheck.sanitizedUrl || targetUrl;
    this.options.onEvent?.("PAGE_NAVIGATED", { targetUrl: safeUrl }, safeUrl);

    try {
      await this.page.goto(safeUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
    } catch (navErr) {
      const msg = navErr instanceof Error ? navErr.message : String(navErr);
      throw new Error(`Lỗi điều hướng đến ${safeUrl}: ${msg}`);
    }

    // Inspect loaded DOM
    const inspection = await this.inspectCurrentPage();
    this.options.onEvent?.("DOM_INSPECTED", {
      title: inspection.title,
      finalUrl: inspection.finalUrl,
      hasBarrier: inspection.hasBarrier,
      barrierType: inspection.barrierType,
    }, inspection.finalUrl);

    if (inspection.hasBarrier) {
      this.options.onEvent?.("BARRIER_DETECTED", {
        barrierType: inspection.barrierType,
        reason: "Phát hiện chốt chặn bảo vệ (CAPTCHA / OTP / Cloudflare). Yêu cầu Human-in-the-Loop.",
      }, inspection.finalUrl);
    }

    return inspection;
  }

  public async inspectCurrentPage(): Promise<PageInspectionResult> {
    if (!this.page) throw new Error("Browser page rỗng.");

    const title = await this.page.title();
    const finalUrl = this.page.url();

    const domInfo = await this.page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll("h1, h2"))
        .map((h) => (h.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 5);

      const bodyText = document.body ? (document.body.innerText || "") : "";
      const textClean = bodyText.replace(/\s+/g, " ").trim().slice(0, 500);

      const formInputCount = document.querySelectorAll("input, textarea, select").length;
      const buttonCount = document.querySelectorAll("button, input[type='submit']").length;

      // Barrier detection heuristics
      const htmlLower = document.documentElement.outerHTML.toLowerCase();
      let hasBarrier = false;
      let barrierType: "CAPTCHA" | "PHONE_OTP" | "LOGIN_2FA" | "CLOUDFLARE_CHALLENGE" | undefined;

      if (
        htmlLower.includes("turnstile") ||
        htmlLower.includes("challenges.cloudflare.com") ||
        document.querySelector("iframe[src*='challenges.cloudflare.com']")
      ) {
        hasBarrier = true;
        barrierType = "CLOUDFLARE_CHALLENGE";
      } else if (
        htmlLower.includes("g-recaptcha") ||
        htmlLower.includes("h-captcha") ||
        document.querySelector("iframe[src*='recaptcha'], iframe[src*='hcaptcha']")
      ) {
        hasBarrier = true;
        barrierType = "CAPTCHA";
      } else if (
        htmlLower.includes("enter verification code") ||
        htmlLower.includes("mã xác thực") ||
        document.querySelector("input[name*='otp'], input[name*='code'], input[id*='otp']")
      ) {
        hasBarrier = true;
        barrierType = "PHONE_OTP";
      }

      return {
        headings,
        visibleTextSnippet: textClean,
        formInputCount,
        buttonCount,
        hasBarrier,
        barrierType,
      };
    });

    return {
      title,
      finalUrl,
      ...domInfo,
    };
  }

  public async captureEvidence(stepLabel = "step"): Promise<ScreenshotEvidence> {
    if (!this.page) throw new Error("Browser page rỗng.");

    const evidenceDir = path.resolve(process.cwd(), "public", "evidence", "screenshots");
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }

    const filename = `${this.options.executionId}_${Date.now()}_${stepLabel}.png`;
    const fullPath = path.join(evidenceDir, filename);

    const buffer = await this.page.screenshot({ fullPage: false });
    fs.writeFileSync(fullPath, buffer);

    // Create a compact base64 thumbnail (first 30KB representation)
    const base64Thumbnail = `data:image/png;base64,${buffer.toString("base64")}`;

    this.options.onEvent?.("SCREENSHOT_CAPTURED", {
      filename,
      sizeBytes: buffer.length,
    }, this.page.url());

    return {
      evidenceId: filename,
      filePath: `/evidence/screenshots/${filename}`,
      base64Thumbnail,
      capturedAt: new Date().toISOString(),
    };
  }

  public async clickElement(selector: string, timeoutMs = 10000): Promise<boolean> {
    if (!this.page) throw new Error("Browser page rỗng.");
    try {
      await this.page.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
      await this.page.click(selector);
      this.options.onEvent?.("ELEMENT_CLICKED", { selector }, this.page.url());
      return true;
    } catch (clickErr) {
      const msg = clickErr instanceof Error ? clickErr.message : String(clickErr);
      throw new Error(`Không thể click phần tử '${selector}': ${msg}`);
    }
  }

  public async fillInput(selector: string, value: string, timeoutMs = 10000): Promise<boolean> {
    if (!this.page) throw new Error("Browser page rỗng.");
    try {
      await this.page.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
      await this.page.fill(selector, value);
      this.options.onEvent?.("FORM_FILLED", { selector, valueLength: value.length }, this.page.url());
      return true;
    } catch (fillErr) {
      const msg = fillErr instanceof Error ? fillErr.message : String(fillErr);
      throw new Error(`Không thể nhập dữ liệu vào '${selector}': ${msg}`);
    }
  }

  public async close(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;

    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch (closeErr) {
      console.warn("[RealBrowserSession] Lỗi đóng browser:", closeErr);
    }
  }
}
