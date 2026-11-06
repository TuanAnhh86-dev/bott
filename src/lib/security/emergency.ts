import { createAdminClient } from "@/lib/supabase/admin";

let inMemoryDevEmergencyStop = false;

export async function isEmergencyStopActive(): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    return process.env.AI_EMERGENCY_STOP_ENABLED === "true";
  }

  try {
    const supabase = createAdminClient();
    const fetchPromise = supabase
      .from("app_settings")
      .select("value")
      .eq("key", "agent.emergency_stop")
      .single()
      .then(({ data, error }) => {
        if (error || !data) throw new Error("Emergency stop setting is unavailable.");
        return data.value === true || data.value === "true";
      });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fetchPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Emergency stop setting timed out.")), 600);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      return inMemoryDevEmergencyStop;
    }
    console.error("[EmergencyStop] Could not verify database setting; failing closed:", error);
    return true;
  }
}

export async function setEmergencyStop(active: boolean, actorId?: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development") {
    inMemoryDevEmergencyStop = active;
  }

  try {
    if (!actorId) throw new Error("Emergency stop changes require an authenticated administrator.");
    const { data, error } = await createAdminClient().rpc("set_agent_emergency_stop", {
      p_active: active,
      p_actor_id: actorId,
    });
    if (error) throw new Error(`Emergency stop update failed: ${error.message}`);
    return data === true;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    console.error("[EmergencyStop] Atomic setting and audit update failed:", err);
    return false;
  }
}
