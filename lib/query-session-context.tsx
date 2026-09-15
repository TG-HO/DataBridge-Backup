"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

export interface WebSource {
  title: string;
  snippet: string;
  url: string;
  domain?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  targetedDatabases?: { id: string; name: string; dbType: string }[];
  connectionId?: string;
  rawQuery?: string;
  isError?: boolean;
  errorMessage?: string;
  isWebSearch?: boolean;
  webSources?: WebSource[];
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
  createNewSession: (initialConnIds?: string[]) => Promise<string>;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
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
    "## Executive Intelligence Assistant Ready\n\nAsk any business question in natural language. You can query internal enterprise databases, activate **Live Web Search** for competitor analysis and industry benchmarks, or synthesize both simultaneously.\n\n### Suggested Queries:\n- *\"Competitor analysis: Top retail fuel operators and market positioning.\"*\n- *\"List our top 10 customers by order volume with their status.\"*\n- *\"Compare internal sales performance against current petroleum market trends.\"*",
  timestamp: "Active",
};

const QuerySessionContext = createContext<QuerySessionContextType | null>(null);

export function QuerySessionProvider({
  children,
  userId,
  orgId,
}: {
  children: React.ReactNode;
  userId?: string;
  orgId?: string;
}) {
  const [sessions, setSessions] = useState<QuerySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to generate a fallback local session structure
  const createFallbackSession = useCallback((initialConnIds: string[] = []): QuerySession => {
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

  // 1. Initial Load: Fetch persistent sessions from SQL Server DB
  useEffect(() => {
    if (!userId || !orgId) return;

    let isMounted = true;
    async function loadSessions() {
      try {
        const res = await fetch("/api/chat/sessions");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.sessions) && data.sessions.length > 0) {
            setSessions(data.sessions);
            setActiveSessionId(data.sessions[0].id);
            setIsLoaded(true);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load query sessions from database:", e);
      }

      // If no sessions exist in DB, create initial one via POST
      try {
        const createRes = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Business Inquiry", selectedConnIds: [] }),
        });
        if (createRes.ok) {
          const data = await createRes.json();
          if (isMounted && data.session) {
            setSessions([data.session]);
            setActiveSessionId(data.session.id);
            setIsLoaded(true);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to create initial database session:", e);
      }

      // Fallback
      if (isMounted) {
        const initialSession = createFallbackSession([]);
        setSessions([initialSession]);
        setActiveSessionId(initialSession.id);
        setIsLoaded(true);
      }
    }

    loadSessions();

    return () => {
      isMounted = false;
    };
  }, [userId, orgId, createFallbackSession]);

  // 2. Create a new session in DB
  const createNewSession = useCallback(
    async (initialConnIds: string[] = []) => {
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
          fetch(`/api/chat/sessions/${active.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedConnIds: initialConnIds }),
          }).catch(console.error);
        }
        return active.id;
      }

      try {
        const res = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New Business Inquiry",
            selectedConnIds: initialConnIds,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.session) {
            setSessions((prev) => [data.session, ...prev]);
            setActiveSessionId(data.session.id);
            return data.session.id;
          }
        }
      } catch (e) {
        console.error("Error creating session in database:", e);
      }

      // Fallback local session if DB request failed
      const newSession = createFallbackSession(initialConnIds);
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      return newSession.id;
    },
    [sessions, activeSessionId, createFallbackSession]
  );

  // 3. Select Session
  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  // 4. Delete Session from DB and state
  const deleteSession = useCallback(
    async (id: string) => {
      // Optimistic delete
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        if (remaining.length === 0) {
          const fresh = createFallbackSession([]);
          setActiveSessionId(fresh.id);
          return [fresh];
        }
        if (activeSessionId === id) {
          setActiveSessionId(remaining[0].id);
        }
        return remaining;
      });

      try {
        await fetch(`/api/chat/sessions?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch (e) {
        console.error("Failed to delete session from database:", e);
      }
    },
    [activeSessionId, createFallbackSession]
  );

  // 5. Update Messages of the Active Session & Sync to DB
  const updateActiveSessionMessages = useCallback(
    (messagesOrUpdater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setSessions((prev) => {
        const targetSession = prev.find((s) => s.id === activeSessionId);
        if (!targetSession) return prev;

        const updatedMessages =
          typeof messagesOrUpdater === "function"
            ? messagesOrUpdater(targetSession.messages)
            : messagesOrUpdater;

        // Auto-generate title from the first user query if still generic
        let newTitle = targetSession.title;
        const firstUserMsg = updatedMessages.find((m) => m.role === "user");
        if (
          firstUserMsg &&
          (targetSession.title === "New Business Inquiry" || targetSession.title.startsWith("New Query"))
        ) {
          const cleanPrompt = firstUserMsg.content.trim().replace(/^["']|["']$/g, "");
          newTitle =
            cleanPrompt.length > 38 ? cleanPrompt.substring(0, 38) + "..." : cleanPrompt;
        }

        const updatedSession = {
          ...targetSession,
          title: newTitle,
          updatedAt: Date.now(),
          messages: updatedMessages,
        };

        // Debounce DB sync to avoid spamming while streaming
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
          if (activeSessionId) {
            fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: newTitle,
                messages: updatedMessages,
              }),
            }).catch((err) =>
              console.warn("Failed to persist messages to database:", err)
            );
          }
        }, 500);

        return prev.map((s) => (s.id === activeSessionId ? updatedSession : s));
      });
    },
    [activeSessionId]
  );

  // 6. Update Selected Connections for Active Session & Sync to DB
  const updateActiveSessionConnections = useCallback(
    (connIds: string[]) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? { ...session, selectedConnIds: connIds, updatedAt: Date.now() }
            : session
        )
      );

      if (activeSessionId) {
        fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedConnIds: connIds }),
        }).catch(console.error);
      }
    },
    [activeSessionId]
  );

  // 7. Clear Active Session Messages
  const clearActiveSessionMessages = useCallback(() => {
    const freshWelcome: ChatMessage = {
      id: `welcome-${Date.now()}`,
      role: "assistant",
      content:
        "Conversation history cleared. Ready for your next business inquiry across connected databases.",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSessionId) return session;
        return {
          ...session,
          title: "New Business Inquiry",
          updatedAt: Date.now(),
          messages: [freshWelcome],
        };
      })
    );

    if (activeSessionId) {
      fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Business Inquiry",
          messages: [freshWelcome],
        }),
      }).catch(console.error);
    }
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
