"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  targetedDatabases?: { id: string; name: string; dbType: string }[];
}

export interface QuerySession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  selectedConnIds: string[];
  messages: ChatMessage[];
}

interface QuerySessionContextType {
  sessions: QuerySession[];
  activeSessionId: string | null;
  activeSession: QuerySession | null;
  createNewSession: (initialConnIds?: string[]) => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateActiveSessionMessages: (
    messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
  ) => void;
  updateActiveSessionConnections: (connIds: string[]) => void;
  clearActiveSessionMessages: () => void;
}

const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  id: "welcome-message",
  role: "assistant",
  content:
    "## Executive Database Assistant Ready\n\nAsk any business or operational question in natural language. You can query a single database or select multiple databases simultaneously to synthesize cross-system intelligence.\n\n### Suggested Queries:\n- *\"List our top 10 customers by order volume with their status.\"*\n- *\"Show customer breakdown across retail and enterprise databases.\"*\n- *\"Summarize overall transaction performance and key metrics.\"*",
  timestamp: "Active",
};

const QuerySessionContext = createContext<QuerySessionContextType | null>(null);

const STORAGE_KEY = "databridge_ai_query_sessions_v1";

export function QuerySessionProvider({
  children,
  userId,
  orgId,
}: {
  children: React.ReactNode;
  userId?: string;
  orgId?: string;
}) {
  const storageKey = `${STORAGE_KEY}_${orgId || "default"}_${userId || "anon"}`;
  const [sessions, setSessions] = useState<QuerySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Helper to generate a fresh new session
  const createNewSessionInternal = useCallback((initialConnIds: string[] = []): QuerySession => {
    const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    return {
      id,
      title: "New Business Inquiry",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      selectedConnIds: initialConnIds,
      messages: [{ ...DEFAULT_WELCOME_MESSAGE, id: `welcome-${Date.now()}` }],
    };
  }, []);

  // 1. Initial Load from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as QuerySession[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          setIsLoaded(true);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to read query sessions from localStorage:", e);
    }

    // Default fallback initial session
    const initialSession = createNewSessionInternal([]);
    setSessions([initialSession]);
    setActiveSessionId(initialSession.id);
    setIsLoaded(true);
  }, [storageKey, createNewSessionInternal]);

  // 2. Persist to LocalStorage whenever sessions change
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch (e) {
      console.warn("Failed to persist query sessions to localStorage:", e);
    }
  }, [sessions, storageKey, isLoaded]);

  // 3. Create a new session
  const createNewSession = useCallback(
    (initialConnIds: string[] = []) => {
      // Re-use current empty session if active session already has no user messages
      const active = sessions.find((s) => s.id === activeSessionId);
      const hasUserMessages = active?.messages.some((m) => m.role === "user");
      if (active && !hasUserMessages) {
        if (initialConnIds.length > 0) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === active.id ? { ...s, selectedConnIds: initialConnIds } : s
            )
          );
        }
        return active.id;
      }

      const newSession = createNewSessionInternal(initialConnIds);
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      return newSession.id;
    },
    [sessions, activeSessionId, createNewSessionInternal]
  );

  // 4. Select Session
  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  // 5. Delete Session
  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        if (remaining.length === 0) {
          const fresh = createNewSessionInternal([]);
          setActiveSessionId(fresh.id);
          return [fresh];
        }
        if (activeSessionId === id) {
          setActiveSessionId(remaining[0].id);
        }
        return remaining;
      });
    },
    [activeSessionId, createNewSessionInternal]
  );

  // 6. Update Messages of the Active Session & Auto-generate Title
  const updateActiveSessionMessages = useCallback(
    (messagesOrUpdater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setSessions((prev) => {
        return prev.map((session) => {
          if (session.id !== activeSessionId) return session;

          const updatedMessages =
            typeof messagesOrUpdater === "function"
              ? messagesOrUpdater(session.messages)
              : messagesOrUpdater;

          // Auto-generate title from the first user query if still generic
          let newTitle = session.title;
          const firstUserMsg = updatedMessages.find((m) => m.role === "user");
          if (
            firstUserMsg &&
            (session.title === "New Business Inquiry" || session.title.startsWith("New Query"))
          ) {
            const cleanPrompt = firstUserMsg.content.trim().replace(/^["']|["']$/g, "");
            newTitle =
              cleanPrompt.length > 38 ? cleanPrompt.substring(0, 38) + "..." : cleanPrompt;
          }

          return {
            ...session,
            title: newTitle,
            updatedAt: Date.now(),
            messages: updatedMessages,
          };
        });
      });
    },
    [activeSessionId]
  );

  // 7. Update Selected Connections for Active Session
  const updateActiveSessionConnections = useCallback(
    (connIds: string[]) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? { ...session, selectedConnIds: connIds, updatedAt: Date.now() }
            : session
        )
      );
    },
    [activeSessionId]
  );

  // 8. Clear Active Session Messages
  const clearActiveSessionMessages = useCallback(() => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSessionId) return session;
        return {
          ...session,
          title: "New Business Inquiry",
          updatedAt: Date.now(),
          messages: [
            {
              id: `welcome-${Date.now()}`,
              role: "assistant",
              content:
                "Conversation history cleared. Ready for your next business inquiry across connected databases.",
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ],
        };
      })
    );
  }, [activeSessionId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  return (
    <QuerySessionContext.Provider
      value={{
        sessions,
        activeSessionId,
        activeSession,
        createNewSession,
        selectSession,
        deleteSession,
        updateActiveSessionMessages,
        updateActiveSessionConnections,
        clearActiveSessionMessages,
      }}
    >
      {children}
    </QuerySessionContext.Provider>
  );
}

export function useQuerySessions() {
  const context = useContext(QuerySessionContext);
  if (!context) {
    throw new Error("useQuerySessions must be used within a QuerySessionProvider");
  }
  return context;
}
