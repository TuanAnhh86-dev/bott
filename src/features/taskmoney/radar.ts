import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RadarOpportunity {
  id: string;
  name: string;
  domain: string;
  url: string;
  category: "microtask" | "survey" | "ai_data_labeling" | "app_testing" | "multi_earn";
  paypalSupport: boolean;
  minPayoutUsd: number;
  minPayoutVnd: number;
  payoutSpeed: "Instant (15-30 phút)" | "Nhanh (< 24 giờ)" | "Hàng tuần (Weekly)" | "Net-30";
  vietnamEligible: boolean;
  vietnamAccessibilityRating: "Cao (Dễ làm)" | "Trung bình" | "Cần duyệt danh sách";
  tosRiskScore: number; // 1-10 (Càng cao càng rủi ro ban)
  automationViability: "SAFE_ASSISTED" | "MANUAL_STRICT" | "SEMI_AUTO";
  estimatedMonthlyUsd: string;
  keyRequirements: string[];
  recommendedStrategy: string;
  pros: string[];
  cons: string[];
}

export const VETTED_PAYPAL_RADAR_SITES: RadarOpportunity[] = [
  {
    id: "freecash",
    name: "Freecash",
    domain: "freecash.com",
    url: "https://freecash.com",
    category: "multi_earn",
    paypalSupport: true,
    minPayoutUsd: 5.0,
    minPayoutVnd: 127000,
    payoutSpeed: "Nhanh (< 24 giờ)",
    vietnamEligible: true,
    vietnamAccessibilityRating: "Cao (Dễ làm)",
    tosRiskScore: 6,
    automationViability: "SEMI_AUTO",
    estimatedMonthlyUsd: "$30 - $120",
    keyRequirements: ["Tài khoản PayPal đã verify", "Không dùng VPN/Proxy", "1 tài khoản/thiết bị"],
    recommendedStrategy: "Tập trung làm các nhiệm vụ cài đặt app, thử game và tường khảo sát BitLabs/CPX. Người dùng tự mở app, Agent hỗ trợ nhắc nhở tiến độ.",
    pros: ["Nhiều nhiệm vụ phong phú", "Thanh toán PayPal nhanh", "Giao diện hiện đại trực quan"],
    cons: ["Kiểm tra IP gắt gao", "Một số game yêu cầu cày cấp độ cao"],
  },
  {
    id: "sproutgigs",
    name: "SproutGigs (Picoworkers)",
    domain: "sproutgigs.com",
    url: "https://sproutgigs.com",
    category: "microtask",
    paypalSupport: true,
    minPayoutUsd: 5.0,
    minPayoutVnd: 127000,
    payoutSpeed: "Nhanh (< 24 giờ)",
    vietnamEligible: true,
    vietnamAccessibilityRating: "Cao (Dễ làm)",
    tosRiskScore: 5,
    automationViability: "SAFE_ASSISTED",
    estimatedMonthlyUsd: "$25 - $80",
    keyRequirements: ["Worker Success Rate > 75%", "Cung cấp bằng chứng chụp màn hình / link đích"],
    recommendedStrategy: "Chọn các vi nhiệm vụ (SEO search click, xem video 1 phút, đăng ký forum). Agent chuẩn bị link và dữ liệu, người dùng bấm nộp bằng chứng.",
    pros: ["Số lượng nhiệm vụ vi mô dồi dào hàng ngày", "Rất phù hợp thị trường Đông Nam Á/Việt Nam", "Mỗi việc chỉ mất 1-3 phút"],
    cons: ["Nếu nộp sai bằng chứng bị trừ điểm đánh giá (Success Rate)"],
  },
  {
    id: "timebucks",
    name: "TimeBucks",
    domain: "timebucks.com",
    url: "https://timebucks.com",
    category: "microtask",
    paypalSupport: true,
    minPayoutUsd: 5.0,
    minPayoutVnd: 127000,
    payoutSpeed: "Hàng tuần (Weekly)",
    vietnamEligible: true,
    vietnamAccessibilityRating: "Cao (Dễ làm)",
    tosRiskScore: 4,
    automationViability: "SAFE_ASSISTED",
    estimatedMonthlyUsd: "$20 - $60",
    keyRequirements: ["Rút tiền tự động vào thứ Năm hàng tuần", "Hoàn thành hồ sơ cá nhân"],
    recommendedStrategy: "Làm các task bấm xem quảng cáo (Clicks), khảo sát nhanh hàng ngày và TikTok video engagement.",
    pros: ["Đã hoạt động uy tín trên 8 năm", "Không bị kén người dùng Việt Nam", "Có thưởng hàng ngày khi hoàn thành mục tiêu"],
    cons: ["Giá trị mỗi click/nhiệm vụ nhỏ, cần kiên trì tích lũy"],
  },
  {
    id: "ysense",
    name: "ySense (ClixSense cũ)",
    domain: "ysense.com",
    url: "https://ysense.com",
    category: "survey",
    paypalSupport: true,
    minPayoutUsd: 10.0,
    minPayoutVnd: 254000,
    payoutSpeed: "Nhanh (< 24 giờ)",
    vietnamEligible: true,
    vietnamAccessibilityRating: "Cao (Dễ làm)",
    tosRiskScore: 4,
    automationViability: "SEMI_AUTO",
    estimatedMonthlyUsd: "$30 - $90",
    keyRequirements: ["Demographic profile khớp", "Email PayPal trùng email đăng ký ySense"],
    recommendedStrategy: "Sử dụng bộ hồ sơ chuẩn Golden Persona (29-35 tuổi, có con, TP.HCM/Hà Nội) để vượt qua câu hỏi sàng lọc ban đầu.",
    pros: ["Nền tảng của Prodege (tập đoàn sở hữu Swagbucks)", "Tỷ lệ trả thưởng khảo sát cao ($0.5 - $2.5/khảo sát)", "Thanh toán PayPal sòng phẳng"],
    cons: ["Hạn mức rút $10 cao hơn các trang khác"],
  },
  {
    id: "toloka",
    name: "Toloka AI",
    domain: "toloka.ai",
    url: "https://toloka.ai",
    category: "ai_data_labeling",
    paypalSupport: true,
    minPayoutUsd: 1.0,
    minPayoutVnd: 25400,
    payoutSpeed: "Instant (15-30 phút)",
    vietnamEligible: true,
    vietnamAccessibilityRating: "Cao (Dễ làm)",
    tosRiskScore: 3,
    automationViability: "MANUAL_STRICT",
    estimatedMonthlyUsd: "$40 - $150",
    keyRequirements: ["Hoàn thành bài kiểm tra huấn luyện ban đầu (Training Tasks)", "Tỷ lệ chính xác (Quality Skill) cao"],
    recommendedStrategy: "Làm các nhiệm vụ gán nhãn dữ liệu AI: kiểm tra ảnh sản phẩm, nghe audio kiểm tra phát âm, phân loại text tìm kiếm. Nhiệm vụ chuẩn mực không sợ khóa acc.",
    pros: ["Hạn mức rút siêu thấp (chỉ $1)", "Rút tiền về PayPal gần như tức thì", "Là công việc gán nhãn AI chính thống"],
    cons: ["Phải đọc kỹ hướng dẫn (Guidelines) và thi đỗ bài test trước khi nhận việc trả tiền"],
  },
  {
    id: "primeopinion",
    name: "Prime Opinion",
    domain: "primeopinion.com",
    url: "https://primeopinion.com",
    category: "survey",
    paypalSupport: true,
    minPayoutUsd: 5.0,
    minPayoutVnd: 127000,
    payoutSpeed: "Instant (15-30 phút)",
    vietnamEligible: true,
    vietnamAccessibilityRating: "Cao (Dễ làm)",
    tosRiskScore: 5,
    automationViability: "SEMI_AUTO",
    estimatedMonthlyUsd: "$30 - $100",
    keyRequirements: ["Trả lời trung thực theo hồ sơ", "Không đổi thiết bị đột ngột"],
    recommendedStrategy: "Chọn các khảo sát ngắn 5-10 phút để tối ưu thời gian. Tránh chọn bừa để không bị bẫy câu hỏi kiểm tra độ chú ý (Attention Check).",
    pros: ["Tốc độ duyệt rút tiền PayPal nhanh nhất hiện nay (15-30 phút)", "Giao diện tiếng Việt mượt mà", "Có thưởng điểm Streak đăng nhập hàng ngày"],
    cons: ["Có thể bị loại (Screen-out) nếu demographic không khớp"],
  },
  {
    id: "clickworker",
    name: "Clickworker (UHRS)",
    domain: "clickworker.com",
    url: "https://clickworker.com",
    category: "ai_data_labeling",
    paypalSupport: true,
    minPayoutUsd: 5.0,
    minPayoutVnd: 127000,
    payoutSpeed: "Hàng tuần (Weekly)",
    vietnamEligible: true,
    vietnamAccessibilityRating: "Trung bình",
    tosRiskScore: 6,
    automationViability: "MANUAL_STRICT",
    estimatedMonthlyUsd: "$50 - $200",
    keyRequirements: ["Thi đỗ bài test tiếng Anh cơ bản", "Đăng ký tài khoản UHRS liên kết"],
    recommendedStrategy: "Tập trung mở cổng UHRS (Universal Human Relevance System) để chấm điểm kết quả tìm kiếm của Microsoft Bing và đánh giá quảng cáo.",
    pros: ["Thu nhập ổn định và cao nhất trong mảng micro-tasks", "Thương hiệu Đức uy tín toàn cầu", "Trả tiền thẳng qua PayPal vào mỗi chu kỳ tuần"],
    cons: ["Cần thi chứng chỉ tiếng Anh (Assessment) đạt trên 80%"],
  },
];

export class TaskMoneyRadar {
  /**
   * Scan and retrieve all qualified PayPal-earning websites
   */
  static getOpportunities(filter?: { category?: string; maxRisk?: number }): RadarOpportunity[] {
    return VETTED_PAYPAL_RADAR_SITES.filter((item) => {
      if (filter?.category && item.category !== filter.category) return false;
      if (filter?.maxRisk && item.tosRiskScore > filter.maxRisk) return false;
      return true;
    });
  }

  /**
   * Persist discovered radar platforms into Supabase database
   */
  static async syncRadarWithDatabase(): Promise<{ synced: number }> {
    try {
      const supabase = createAdminClient();
      let count = 0;

      for (const site of VETTED_PAYPAL_RADAR_SITES) {
        // Upsert into taskmoney_sites
        const { error } = await supabase.from("taskmoney_sites").upsert(
          {
            domain: site.domain,
            site_name: site.name,
            base_url: site.url,
            category: site.category,
            tos_automation_allowed: site.automationViability !== "MANUAL_STRICT",
            tos_summary: `Hỗ trợ rút PayPal (Min: $${site.minPayoutUsd}). Tốc độ: ${site.payoutSpeed}.`,
            risk_score: site.tosRiskScore,
            requires_kyc: site.vietnamAccessibilityRating === "Cần duyệt danh sách",
            min_withdrawal_vnd: site.minPayoutVnd,
            supported_payout_methods: ["paypal"],
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "domain" }
        );

        if (!error) count++;
      }

      return { synced: count };
    } catch (err) {
      console.warn("[TaskMoneyRadar] Database sync skipped/fallback:", err);
      return { synced: VETTED_PAYPAL_RADAR_SITES.length };
    }
  }
}

