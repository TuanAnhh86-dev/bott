import fs from "node:fs";
import path from "node:path";
import { TaskStore } from "@/features/agent/task-store";

export interface BridgeMessage {
  id: string;
  sender: "user" | "be_bo";
  content: string;
  timestamp: string;
  detectedUrls?: string[];
  isTaskRequest?: boolean;
}

export function recordBridgeMessage(message: {
  sender: "user" | "be_bo";
  content: string;
  timestamp?: string;
}): BridgeMessage {
  const bridgeFile = path.resolve(process.cwd(), "bridge_inbox.json");
  const timestamp = message.timestamp || new Date().toISOString();

  // Extract URLs if any
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const detectedUrls = message.content.match(urlRegex) || [];

  const lower = message.content.toLowerCase();
  const isTaskRequest =
    detectedUrls.length > 0 ||
    lower.includes("nhiệm vụ") ||
    lower.includes("tài khoản") ||
    lower.includes("kiếm tiền") ||
    lower.includes("làm giúp") ||
    lower.includes("hướng dẫn");

  const entry: BridgeMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sender: message.sender,
    content: message.content,
    timestamp,
    detectedUrls: detectedUrls.length > 0 ? detectedUrls : undefined,
    isTaskRequest,
  };

  try {
    let list: BridgeMessage[] = [];
    if (fs.existsSync(bridgeFile)) {
      const raw = fs.readFileSync(bridgeFile, "utf-8");
      list = JSON.parse(raw);
    }
    list.push(entry);
    if (list.length > 100) list = list.slice(-100);
    fs.writeFileSync(bridgeFile, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Bridge] Error updating bridge_inbox.json:", err);
  }

  // If user dispatched a task/link, auto-register into TaskStore
  if (message.sender === "user" && isTaskRequest) {
    const firstUrl = detectedUrls[0] || "";
    const taskTitle = firstUrl
      ? `Thực thi nhiệm vụ trực tuyến tại: ${firstUrl.slice(0, 50)}...`
      : `Nhiệm vụ trực tuyến từ Bác: ${message.content.slice(0, 45)}...`;

    TaskStore.addTask({
      title: taskTitle,
      task_type: "public_web_research",
      description: message.content,
      priority: 99,
      status: "PENDING",
      input_data: {
        rawMessage: message.content,
        urls: detectedUrls,
        source: "web_admin_chat_be_bo",
        createdAt: timestamp,
      },
    }).catch((err) => {
      console.warn("[Bridge] Could not auto-queue task from chat:", err);
    });
  }

  return entry;
}

export function getRecentBridgeMessages(limit: number = 20): BridgeMessage[] {
  const bridgeFile = path.resolve(process.cwd(), "bridge_inbox.json");
  try {
    if (fs.existsSync(bridgeFile)) {
      const raw = fs.readFileSync(bridgeFile, "utf-8");
      const list: BridgeMessage[] = JSON.parse(raw);
      return list.slice(-limit);
    }
  } catch (err) {
    console.warn("[Bridge] Error reading bridge_inbox.json:", err);
  }
  return [];
}
