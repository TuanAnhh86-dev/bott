import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(16_000),
}).strict();

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
}).strict();

export function parseChatMessages(input: unknown) {
  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success) return null;

  const { messages } = parsed.data;
  const totalCharacters = messages.reduce((total, message) => total + message.content.length, 0);

  if (
    totalCharacters > 64_000 ||
    messages[messages.length - 1]?.role !== "user"
  ) {
    return null;
  }

  return messages;
}
