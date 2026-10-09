import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { updateUserData } from "../firebase";
import { asyncHandler, getOrCreateUser, toArray } from "../middleware";
import type { Message, Note } from "@shared/schema";
import { insertMessageSchema } from "@shared/schema";

export function registerMessagesRoutes(app: Express): void {
  // ===== MESSAGING ENDPOINTS =====

  // Get all messages for the user
  app.get("/api/messages", asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const messages = toArray<Message>(userData.messages as any);

      // Filter out any invalid messages and ensure they have required fields
      const validMessages = messages.filter((m: any) => m && m.id && m.createdAt);

      // Sort by createdAt descending (newest first)
      const sortedMessages = [...validMessages].sort((a: Message, b: Message) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      res.json(sortedMessages);
  }));

  // Get unread message count
  app.get("/api/messages/unread-count", asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const messages = toArray<Message>(userData.messages as any);
      const unreadCount = messages.filter((m: Message) => !m.isRead).length;

      res.json({ count: unreadCount });
  }));

  // Send a message to a connected user
  app.post("/api/messages", asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized - please sign in again" });
        return;
      }

      const validatedData = insertMessageSchema.safeParse(req.body);
      if (!validatedData.success) {
        res.status(400).json({ error: "Invalid message data", details: validatedData.error.errors });
        return;
      }

      const { toUserId, content, linkedNoteId, linkedEventId } = validatedData.data;

      const userData = await getOrCreateUser(userId, username);
      const connections = toArray<string>(userData.connections as any);

      // Check if recipient is a connected user
      if (!connections.includes(toUserId)) {
        res.status(400).json({ error: "You can only message connected users" });
        return;
      }

      // Recipient's username comes from their stored record, never the request body
      const recipientData = await getOrCreateUser(toUserId, "user");
      const toUsername = recipientData.username;

      const now = new Date().toISOString();
      const messageId = randomUUID();

      // Message for recipient (unread)
      // Note: Firebase doesn't allow undefined values, so only include linkedNoteId if defined
      const recipientMessage: Message = {
        id: messageId,
        fromUserId: userId,
        fromUsername: username,
        toUserId,
        toUsername,
        content,
        createdAt: now,
        isRead: false,
        ...(linkedNoteId ? { linkedNoteId } : {}),
        ...(linkedEventId ? { linkedEventId } : {}),
      };

      // Message copy for sender (marked as read, shown as sent)
      const senderMessage: Message = {
        id: `${messageId}-sent`,
        fromUserId: userId,
        fromUsername: username,
        toUserId,
        toUsername,
        content,
        createdAt: now,
        isRead: true,
        ...(linkedNoteId ? { linkedNoteId } : {}),
        ...(linkedEventId ? { linkedEventId } : {}),
      };

      // Add message to recipient's inbox
      const recipientMsgs = [...toArray<Message>(recipientData.messages as any), recipientMessage];
      await updateUserData(toUserId, { messages: recipientMsgs });

      // Add sent copy to sender's messages
      const senderMsgs = [...toArray<Message>(userData.messages as any), senderMessage];
      await updateUserData(userId, { messages: senderMsgs });

      res.status(201).json(senderMessage);
  }));

  // Mark a message as read
  app.patch("/api/messages/:messageId/read", asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { messageId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const messages = toArray<Message>(userData.messages as any);
      const messageIndex = messages.findIndex((m: Message) => m.id === messageId);

      if (messageIndex === -1) {
        res.status(404).json({ error: "Message not found" });
        return;
      }

      messages[messageIndex].isRead = true;
      await updateUserData(userId, { messages });

      res.json(messages[messageIndex]);
  }));

  // Mark all messages as read
  app.post("/api/messages/mark-all-read", asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const messages = toArray<Message>(userData.messages as any).map((m: Message) => ({
        ...m,
        isRead: true,
      }));

      await updateUserData(userId, { messages });

      res.json({ success: true });
  }));

  // Delete a message
  app.delete("/api/messages/:messageId", asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { messageId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const messages = toArray<Message>(userData.messages as any).filter((m: Message) => m.id !== messageId);

      await updateUserData(userId, { messages });

      res.json({ success: true });
  }));
}
