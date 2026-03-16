"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const INTRO_MESSAGE = "";

const STORAGE_KEYS = {
  messages: "ragebait_messages",
  facts: "ragebait_facts",
  visits: "ragebait_visits",
};

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [facts, setFacts] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Load persisted state on mount
  useEffect(() => {
    const savedMessages = loadFromStorage<Message[]>(
      STORAGE_KEYS.messages,
      []
    );
    const savedFacts = loadFromStorage<string[]>(STORAGE_KEYS.facts, []);
    const visits = loadFromStorage<number>(STORAGE_KEYS.visits, 0);

    setMessages(savedMessages);

    setFacts(savedFacts);
    localStorage.setItem(STORAGE_KEYS.visits, JSON.stringify(visits + 1));
    setMounted(true);
  }, []);

  // Persist messages and facts
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
  }, [messages, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEYS.facts, JSON.stringify(facts));
  }, [facts, mounted]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Keep focus on mobile to prevent keyboard dismiss
    setTimeout(() => inputRef.current?.focus(), 10);

    try {
      // Only send last 20 messages for context window management
      const contextMessages = newMessages.slice(-20);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: contextMessages, facts }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Something broke on my end. ${data.error || "Try again."}`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
        if (data.newFacts && data.newFacts.length > 0) {
          setFacts((prev) => {
            const combined = [...prev, ...data.newFacts];
            // Dedupe and cap at 50 facts
            const unique = [...new Set(combined)];
            return unique.slice(-50);
          });
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Connection died. Probably couldn't handle being near you either.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, facts]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    localStorage.removeItem(STORAGE_KEYS.messages);
    localStorage.removeItem(STORAGE_KEYS.facts);
    setMessages([]);
    setFacts([]);
  };

  if (!mounted) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingScreen}>
          <span style={styles.logo}>RAGEBAIT</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Title bar */}
      <div style={styles.header}>
        <span style={styles.logo}>RAGEBAIT</span>
        <button onClick={clearChat} style={styles.clearBtn}>
          clear
        </button>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} style={styles.messagesContainer}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.messageBubble,
              ...(msg.role === "user" ? styles.userBubble : styles.botBubble),
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ ...styles.messageBubble, ...styles.botBubble }}>
            <span style={styles.dots}>...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={styles.inputBar}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="talk shit or get roasted trying"
          style={styles.input}
          autoComplete="off"
          autoCorrect="off"
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            ...styles.sendBtn,
            opacity: loading || !input.trim() ? 0.4 : 1,
          }}
        >
          &#x2191;
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    maxWidth: 600,
    margin: "0 auto",
    background: "#0a0a0a",
  },
  loadingScreen: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },
  logo: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 2,
    color: "#ff4444",
  },
  clearBtn: {
    background: "none",
    border: "1px solid #333",
    color: "#666",
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  messagesContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    WebkitOverflowScrolling: "touch",
  },
  messageBubble: {
    maxWidth: "85%",
    padding: "10px 14px",
    borderRadius: 16,
    fontSize: 15,
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "#1c1c1c",
    color: "#e0e0e0",
    borderBottomRightRadius: 4,
  },
  botBubble: {
    alignSelf: "flex-start",
    background: "#141414",
    color: "#e0e0e0",
    borderBottomLeftRadius: 4,
    borderLeft: "2px solid #ff4444",
  },
  dots: {
    color: "#ff4444",
    fontWeight: "bold",
    letterSpacing: 2,
    animation: "pulse 1s infinite",
  },
  inputBar: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
    borderTop: "1px solid #1a1a1a",
    background: "#0a0a0a",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 20,
    padding: "10px 16px",
    color: "#e0e0e0",
    fontSize: 15,
    outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    border: "none",
    background: "#ff4444",
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
