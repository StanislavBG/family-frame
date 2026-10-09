import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getUserData, updateUserData, setSharedNote, deleteSharedNote, getAllSharedNotes } from "../firebase";
import { getOrCreateUser } from "../middleware";
import type { Note, Message } from "@shared/schema";
import { insertNoteSchema } from "@shared/schema";

export function registerNotepadRoutes(app: Express): void {
  // ===== NOTEPAD ENDPOINTS =====

  // Get all notes for the user (own notes + shared notes from others)
  app.get("/api/notes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle notes as either array or object (Firebase may convert arrays to objects)
      let myNotes: Note[] = [];
      if (Array.isArray(userData.notes)) {
        myNotes = userData.notes;
      } else if (userData.notes && typeof userData.notes === 'object') {
        myNotes = Object.values(userData.notes);
      }
      
      // Filter out any invalid notes
      myNotes = myNotes.filter((n: any) => n && n.id);
      
      // Sort own notes: pinned first, then by updatedAt descending
      const sortedMyNotes = [...myNotes].sort((a: Note, b: Note) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const dateA = new Date(a.updatedAt || 0).getTime();
        const dateB = new Date(b.updatedAt || 0).getTime();
        return dateB - dateA;
      });

      // Get list of connected user IDs (accepted connections only)
      // Handle connections as either array or object
      let connectionIds: string[] = [];
      if (Array.isArray(userData.connections)) {
        connectionIds = userData.connections;
      } else if (userData.connections && typeof userData.connections === 'object') {
        connectionIds = Object.values(userData.connections);
      }
      const connectedUserIds = new Set(connectionIds);

      // Get shared notes only from connected family members
      const allSharedNotes = await getAllSharedNotes();
      const sharedFromConnections = allSharedNotes
        .filter((note: Note) => {
          // Must be from a connected user and not from self
          return note.authorId && note.authorId !== userId && connectedUserIds.has(note.authorId);
        })
        .sort((a: Note, b: Note) => {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

      res.json({ mine: sortedMyNotes, shared: sharedFromConnections });
    } catch (error) {
      console.error("Get notes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new note
  app.post("/api/notes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const validatedData = insertNoteSchema.safeParse(req.body);
      if (!validatedData.success) {
        res.status(400).json({ error: "Invalid note data", details: validatedData.error.errors });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const now = new Date().toISOString();
      
      const mentions = validatedData.data.mentions || [];
      
      // Handle connections as either array or object
      let connectionIds: string[] = [];
      if (Array.isArray(userData.connections)) {
        connectionIds = userData.connections;
      } else if (userData.connections && typeof userData.connections === 'object') {
        connectionIds = Object.values(userData.connections);
      }
      
      // Validate mentions are connected users
      const validMentions = mentions.filter((mentionId: string) => 
        connectionIds.includes(mentionId)
      );

      const newNote: Note = {
        id: randomUUID(),
        title: validatedData.data.title || "Untitled Note",
        content: validatedData.data.content || "",
        isPinned: validatedData.data.isPinned || false,
        isShared: validatedData.data.isShared || false,
        authorId: userId,
        authorName: username,
        createdAt: now,
        updatedAt: now,
        mentions: validMentions,
      };

      const notes = [...(userData.notes || []), newNote];
      await updateUserData(userId, { notes });

      // If shared, also add to sharedNotes collection
      if (newNote.isShared) {
        await setSharedNote(newNote.id, newNote);
      }

      // Send notification messages to mentioned households
      for (const mentionedUserId of validMentions) {
        const mentionedUserData = await getUserData(mentionedUserId);
        if (mentionedUserData) {
          const notificationMessage: Message = {
            id: randomUUID(),
            fromUserId: userId,
            fromUsername: username,
            toUserId: mentionedUserId,
            toUsername: mentionedUserData.username,
            content: `${username} mentioned you in a note: "${newNote.title}"`,
            createdAt: now,
            isRead: false,
            linkedNoteId: newNote.id,
          };
          
          // Handle messages as either array or object
          let recipientMsgs: Message[] = [];
          if (Array.isArray(mentionedUserData.messages)) {
            recipientMsgs = mentionedUserData.messages;
          } else if (mentionedUserData.messages && typeof mentionedUserData.messages === 'object') {
            recipientMsgs = Object.values(mentionedUserData.messages);
          }
          recipientMsgs.push(notificationMessage);
          await updateUserData(mentionedUserId, { messages: recipientMsgs });
        }
      }

      res.status(201).json(newNote);
    } catch (error) {
      console.error("Create note error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update a note
  app.patch("/api/notes/:noteId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { noteId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle notes as either array or object
      let notes: Note[] = [];
      if (Array.isArray(userData.notes)) {
        notes = userData.notes;
      } else if (userData.notes && typeof userData.notes === 'object') {
        notes = Object.values(userData.notes);
      }
      
      const noteIndex = notes.findIndex((n: Note) => n.id === noteId);

      if (noteIndex === -1) {
        res.status(404).json({ error: "Note not found" });
        return;
      }

      const { title, content, isPinned, isShared, mentions } = req.body;
      
      // Handle connections as either array or object
      let connectionIds: string[] = [];
      if (Array.isArray(userData.connections)) {
        connectionIds = userData.connections;
      } else if (userData.connections && typeof userData.connections === 'object') {
        connectionIds = Object.values(userData.connections);
      }
      
      // Validate partial update fields
      const updateFields: Partial<Note> = {};
      if (title !== undefined) {
        if (typeof title !== "string") {
          res.status(400).json({ error: "Title must be a string" });
          return;
        }
        updateFields.title = title;
      }
      if (content !== undefined) {
        if (typeof content !== "string") {
          res.status(400).json({ error: "Content must be a string" });
          return;
        }
        updateFields.content = content;
      }
      if (isPinned !== undefined) {
        if (typeof isPinned !== "boolean") {
          res.status(400).json({ error: "isPinned must be a boolean" });
          return;
        }
        updateFields.isPinned = isPinned;
      }
      if (isShared !== undefined) {
        if (typeof isShared !== "boolean") {
          res.status(400).json({ error: "isShared must be a boolean" });
          return;
        }
        updateFields.isShared = isShared;
      }
      
      // Handle mentions update
      let validMentions: string[] | undefined;
      if (mentions !== undefined) {
        if (!Array.isArray(mentions)) {
          res.status(400).json({ error: "mentions must be an array" });
          return;
        }
        // Validate mentions are connected users
        validMentions = mentions.filter((mentionId: string) => 
          connectionIds.includes(mentionId)
        );
        updateFields.mentions = validMentions;
      }

      const existingNote = notes[noteIndex];
      const now = new Date().toISOString();
      const updatedNote: Note = {
        ...existingNote,
        ...updateFields,
        authorId: existingNote.authorId || userId,
        authorName: existingNote.authorName || username,
        updatedAt: now,
      };

      notes[noteIndex] = updatedNote;
      await updateUserData(userId, { notes });

      // Sync with sharedNotes collection
      const wasShared = existingNote.isShared || false;
      const nowShared = updatedNote.isShared || false;

      if (nowShared && !wasShared) {
        // Note became shared - add to collection
        await setSharedNote(updatedNote.id, updatedNote);
      } else if (!nowShared && wasShared) {
        // Note became private - remove from collection
        await deleteSharedNote(updatedNote.id);
      } else if (nowShared) {
        // Note was and still is shared - update in collection
        await setSharedNote(updatedNote.id, updatedNote);
      }

      // Send notification messages to NEW mentions only
      if (validMentions) {
        const existingMentions = new Set(existingNote.mentions || []);
        const newMentions = validMentions.filter(id => !existingMentions.has(id));
        
        for (const mentionedUserId of newMentions) {
          const mentionedUserData = await getUserData(mentionedUserId);
          if (mentionedUserData) {
            const notificationMessage: Message = {
              id: randomUUID(),
              fromUserId: userId,
              fromUsername: username,
              toUserId: mentionedUserId,
              toUsername: mentionedUserData.username,
              content: `${username} mentioned you in a note: "${updatedNote.title}"`,
              createdAt: now,
              isRead: false,
              linkedNoteId: updatedNote.id,
            };
            
            // Handle messages as either array or object
            let recipientMsgs: Message[] = [];
            if (Array.isArray(mentionedUserData.messages)) {
              recipientMsgs = mentionedUserData.messages;
            } else if (mentionedUserData.messages && typeof mentionedUserData.messages === 'object') {
              recipientMsgs = Object.values(mentionedUserData.messages);
            }
            recipientMsgs.push(notificationMessage);
            await updateUserData(mentionedUserId, { messages: recipientMsgs });
          }
        }
      }

      res.json(updatedNote);
    } catch (error) {
      console.error("Update note error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete a note
  app.delete("/api/notes/:noteId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { noteId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle notes as either array or object
      let notes: Note[] = [];
      if (Array.isArray(userData.notes)) {
        notes = userData.notes;
      } else if (userData.notes && typeof userData.notes === 'object') {
        notes = Object.values(userData.notes);
      }
      
      const noteIndex = notes.findIndex((n: Note) => n.id === noteId);

      if (noteIndex === -1) {
        res.status(404).json({ error: "Note not found" });
        return;
      }

      const deletedNote = notes[noteIndex];
      notes.splice(noteIndex, 1);
      await updateUserData(userId, { notes });

      // Also remove from sharedNotes if it was shared
      if (deletedNote.isShared) {
        await deleteSharedNote(deletedNote.id);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Delete note error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
