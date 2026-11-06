import { createAdminClient } from "@/lib/supabase/admin";
import { EMMI_PLANNER_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { executeResilientText } from "@/lib/ai/client";
import { evaluateActionPermission } from "@/lib/security/permissions";
import { TaskStore } from "./task-store";
import crypto from "crypto";
import { z } from "zod";

export interface PlannerInput {
  objective: string;
  actorId: string;
  context?: string;
  targetBudgetVnd?: number;
}

export interface GeneratedPlan {
  id?: string;
  objective: string;
  priority: number;
  estimatedCostVnd: number;
  expectedResult: string;
  risks: string;
  requiredPermissions: string[];
  completionCriteria: string;
  steps: Array<{
    stepNumber: number;
    description: string;
    taskType: string;
    dependsOn: number[];
  }>;
}

const generatedPlanSchema = z.object({
  id: z.string().optional(),
  objective: z.string().trim().min(1).max(2_000),
  priority: z.number().int().min(1).max(100),
  estimatedCostVnd: z.number().finite().nonnegative(),
  expectedResult: z.string().max(4_000),
  risks: z.string().max(4_000),
  requiredPermissions: z.array(z.string().max(100)).max(30),
  completionCriteria: z.string().max(4_000),
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1).max(30),
    description: z.string().trim().min(1).max(2_000),
    taskType: z.string().trim().min(1).max(100),
    dependsOn: z.array(z.number().int().min(1).max(30)).max(30),
  }).strict()).min(1).max(30),
}).strict();

export async function createAgentPlan(input: PlannerInput): Promise<GeneratedPlan> {
  const prompt = `Mục tiêu kinh doanh cần lập kế hoạch: "${input.objective}"
${input.context ? `Bối cảnh bổ sung: ${input.context}` : ""}
${input.targetBudgetVnd !== undefined ? `Ngân sách tối đa: ${input.targetBudgetVnd} VNĐ` : ""}

Hãy xây dựng kế hoạch thực thi chi tiết theo cấu trúc JSON.`;

  try {
    const response = await executeResilientText({
      system: EMMI_PLANNER_SYSTEM_PROMPT,
      prompt,
      targetModel: "gemini-3.6-flash",
      temperature: 0.3,
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    const cleanedText = jsonMatch
      ? jsonMatch[0]
      : response.text.replace(/```json/gi, "").replace(/```/g, "").trim();

    const planData = generatedPlanSchema.parse(JSON.parse(cleanedText));
    const stepNumbers = new Set(planData.steps.map((step) => step.stepNumber));
    if (
      stepNumbers.size !== planData.steps.length ||
      planData.steps.some((step) =>
        step.dependsOn.some((dependency) => !stepNumbers.has(dependency) || dependency >= step.stepNumber)
      )
    ) {
      throw new Error("Planner returned invalid step dependencies.");
    }

    const planId = crypto.randomUUID();
    planData.id = planId;

    const permissions = await Promise.all(
      planData.steps.map((step) => evaluateActionPermission(step.taskType, step.description))
    );
    if (permissions.some((permission) => !permission.allowed && !permission.requiresApproval)) {
      throw new Error("The generated plan contains a forbidden action or execution is paused.");
    }

    const supabase = createAdminClient();
    const { error: planError } = await supabase
      .from("agent_plans")
      .insert({
        id: planId,
        objective: planData.objective,
        priority: planData.priority,
        estimated_cost_vnd: planData.estimatedCostVnd,
        expected_result: planData.expectedResult,
        risks: planData.risks,
        required_permissions: planData.requiredPermissions,
        completion_criteria: planData.completionCriteria,
        created_by: input.actorId,
        status: "active",
      });
    if (planError) throw new Error(`Could not persist plan: ${planError.message}`);

    const taskIdsByStep = new Map<number, string>();
    try {
      const stepRecords = [];
      for (const step of [...planData.steps].sort((a, b) => a.stepNumber - b.stepNumber)) {
        const index = planData.steps.indexOf(step);
        const permission = permissions[index];
        const task = await TaskStore.addTask({
          plan_id: planId,
          task_type: step.taskType,
          title: `Bước ${step.stepNumber}: ${step.description}`,
          description: step.description,
          status: "QUEUED",
          priority: planData.priority,
          required_permission: permission.category,
          approval_status: permission.requiresApproval ? "pending" : "not_required",
          created_by: input.actorId,
          input_data: { stepNumber: step.stepNumber, planId },
        });
        taskIdsByStep.set(step.stepNumber, task.id);
        stepRecords.push({
          plan_id: planId,
          step_number: step.stepNumber,
          description: step.description,
          status: "pending",
          depends_on: step.dependsOn,
        });
      }

      const { error: stepError } = await supabase.from("agent_plan_steps").insert(stepRecords);
      if (stepError) throw new Error(`Could not persist plan steps: ${stepError.message}`);

      const dependencies = planData.steps.flatMap((step) =>
        step.dependsOn.map((dependency) => ({
          task_id: taskIdsByStep.get(step.stepNumber)!,
          depends_on_task_id: taskIdsByStep.get(dependency)!,
        }))
      );
      if (dependencies.length > 0) {
        const { error: dependencyError } = await supabase
          .from("task_dependencies")
          .insert(dependencies);
        if (dependencyError) throw new Error(`Could not persist task dependencies: ${dependencyError.message}`);
      }
    } catch (taskError) {
      await Promise.all([...taskIdsByStep.values()].map((taskId) =>
        TaskStore.cancelTask(taskId, "Kế hoạch chưa thể lưu đầy đủ; task đã được dừng.")
      ));
      await supabase
        .from("agent_plans")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", planId);
      throw taskError;
    }

    return planData;
  } catch (error) {
    console.error("[Planner] Could not create a verified plan:", error);
    throw error;
  }
}
