import "server-only";
import { TaskMoneyResearcher } from "./researcher";
import { TaskMoneyTask, TaskStatus, TaskMoneySite, SiteAnalysis } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OrchestrationResult {
  allowed: boolean;
  reason: string;
  site?: TaskMoneySite;
  analysis?: SiteAnalysis;
  task?: TaskMoneyTask;
}

export class TaskMoneyOrchestrator {
  /**
   * Evaluate a user-submitted link, research ToS and decide whether it's safe to automate
   */
  static async evaluateAndPlan(url: string, sampleToSText?: string): Promise<OrchestrationResult> {
    const { site, analysis } = await TaskMoneyResearcher.analyzeSite({ url, sampleToSText });

    // Strict Fail-Closed Gate:
    if (!site.tosAutomationAllowed || site.riskScore >= 8) {
      return {
        allowed: false,
        reason: `Chặn bởi Chính Sách ToS: Website ${site.domain} (Điểm rủi ro: ${site.riskScore}/10) nghiêm cấm hành vi tự động hóa. Hệ thống từ chối can thiệp để bảo vệ an toàn cho tài khoản.`,
        site,
        analysis,
      };
    }

    if (site.requiresKyc) {
      return {
        allowed: false,
        reason: `Yêu Cầu Xác Minh Danh Tính (KYC): Website yêu cầu CCCD/Hộ chiếu cá nhân. Hệ thống AI không hỗ trợ giả mạo danh tính. Cần người dùng tự xác minh.`,
        site,
        analysis,
      };
    }

    // Create a safe, bounded task
    const task: TaskMoneyTask = {
      id: crypto.randomUUID(),
      siteId: site.id,
      title: `Thực hiện nhiệm vụ được duyệt trên ${site.siteName}`,
      taskUrl: url,
      instructionSteps: [
        "1. Điều hướng đến trang nhiệm vụ",
        "2. Kiểm tra phần tử giao diện & form tương tác",
        "3. Thực hiện thao tác an toàn với độ trễ jitter tự nhiên",
        "4. Xác nhận hoàn tất và chụp bằng chứng",
      ],
      expectedRewardVnd: 15000,
      maxDurationSeconds: 180,
      status: "READY",
      priority: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const supabase = createAdminClient();
      await supabase.from("taskmoney_tasks").insert({
        id: task.id,
        site_id: task.siteId,
        title: task.title,
        task_url: task.taskUrl,
        instruction_steps: task.instructionSteps,
        expected_reward_vnd: task.expectedRewardVnd,
        max_duration_seconds: task.maxDurationSeconds,
        status: task.status,
        priority: task.priority,
      });
    } catch (err) {
      console.warn("[TaskMoneyOrchestrator] Task record persistence skipped/fallback:", err);
    }

    return {
      allowed: true,
      reason: `Đã phê duyệt: Website ${site.domain} an toàn, mức rủi ro ${site.riskScore}/10. Nhiệm vụ đã sẵn sàng thực thi.`,
      site,
      analysis,
      task,
    };
  }

  /**
   * Update task state in database
   */
  static async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    try {
      const supabase = createAdminClient();
      await supabase
        .from("taskmoney_tasks")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", taskId);
    } catch (err) {
      console.warn("[TaskMoneyOrchestrator] Could not update task status:", err);
    }
  }
}
