import React, { useState, useEffect, useRef } from "react";

// Helper function to format timestamps
const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffMs = now - messageTime;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return messageTime.toLocaleDateString();
};

export default function ChatBoxContent({ username, onLogout }) {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editInput, setEditInput] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const endRef = useRef(null);

  // Resolve backend base URL with env overrides for production
  const isSecure = window.location.protocol === "https:";
  const httpProto = isSecure ? "https" : "http";
  const wsProto = isSecure ? "wss" : "ws";
  const host = window.location.hostname;
  const backendHttp =
    process.env.REACT_APP_API_BASE || `${httpProto}://${host}:8080`;
  const backendWs =
    process.env.REACT_APP_WS_BASE || `${wsProto}://${host}:8080`;

  // Load dark mode preference from backend
  useEffect(() => {
    const fetchDarkMode = async () => {
      try {
        const res = await fetch(`${backendHttp}/get_dark_mode?username=${username}`);
        if (res.ok) {
          const data = await res.json();
          setDarkMode(data.darkMode);
        }
      } catch (err) {
        console.error("Failed to load dark mode:", err);
      }
    };
    fetchDarkMode();
  }, [username, backendHttp]);

  // Open WebSocket once
  useEffect(() => {
    const socket = new WebSocket(`${backendWs}/ws?username=${username}`);

    socket.onopen = () => console.log("✅ WebSocket connected");

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        // ack from server to map local temp id -> real id
        if (payload.type === "ack" && payload.clientId && payload.id) {
          setMessages((prev) => prev.map((m) => (m.id === payload.clientId ? { ...m, id: payload.id } : m)));
          return;
        }

        // history from server
        if (payload.type === "history" && Array.isArray(payload.messages)) {
          const hist = payload.messages.map((m) => ({
            id: m.id,
            username: m.username,
            text: m.text,
            timestamp: m.timestamp || new Date().toLocaleString("en-US", { timeZoneName: "short" }),
            fromUser: m.username === username,
          }));
          setMessages((prev) => [...prev, ...hist]);
          return;
        }

        // single message
        if (payload.username && payload.text) {
          const incoming = {
            id: payload.id,
            username: payload.username,
            text: payload.text,
            timestamp: payload.timestamp || new Date().toLocaleString("en-US", { timeZoneName: "short" }),
            fromUser: payload.username === username,
          };
          setMessages((prev) => [...prev, incoming]);
        }

        // deleted message
        if (payload.type === "delete" && payload.id) {
          setMessages((prev) => prev.filter((m) => m.id !== payload.id));
        }

        // edited message
        if (payload.type === "edit" && payload.id) {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.id ? { ...m, text: payload.text } : m))
          );
        }

        // online users list
        if (payload.type === "users" && Array.isArray(payload.users)) {
          setOnlineUsers(payload.users);
        }

        // typing indicator
        if (payload.type === "typing") {
          setTypingUsers((prev) => {
            const filtered = prev.filter(u => u !== payload.username);
            return payload.isTyping ? [...filtered, payload.username] : filtered;
          });
        }
      } catch (err) {
        console.error("Invalid message received:", event.data);
      }
    };

    socket.onclose = () => console.log("❌ WebSocket closed");
    socket.onerror = (err) => console.error("WebSocket error:", err);

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [username, backendWs]);

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Typing indicator with debounce
  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const timeoutId = setTimeout(() => {
      ws.send(JSON.stringify({ type: "typing", username, isTyping: false }));
    }, 1000);

    if (input.trim()) {
      ws.send(JSON.stringify({ type: "typing", username, isTyping: true }));
    }

    return () => clearTimeout(timeoutId);
  }, [input, ws, username]);

  const sendMessage = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const textTrimmed = input.trim();
    if (!textTrimmed) return;
    
    // Stop typing indicator
    ws.send(JSON.stringify({ type: "typing", username, isTyping: false }));

    // Use timezone-aware timestamp
    const timestamp = new Date().toLocaleString("en-US", { timeZoneName: "short" });

    // local immediate message
    const local = {
      id: Date.now(), // temporary id until ack maps to real id
      username,
      text: textTrimmed,
      timestamp,
      fromUser: true,
    };
    setMessages((prev) => [...prev, local]);

    // send to server
    ws.send(JSON.stringify({ username, text: textTrimmed, timestamp, clientId: local.id }));
    setInput("");
  };

  const editMessage = async (id) => {
    if (!editInput.trim()) return;
    try {
      const res = await fetch(`${backendHttp}/message`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text: editInput }),
      });
      if (res.ok) setEditingId(null);
    } catch (err) {
      console.error("Edit failed:", err);
    }
  };

  const deleteMessage = async (id) => {
    try {
      const res = await fetch(`${backendHttp}/message?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) console.error("Delete failed");
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  const containerStyle = {
    display: "flex",
    height: "100vh",
    backgroundColor: darkMode ? "#0f1720" : "#f3f4f6",
    color: darkMode ? "#e5e7eb" : "#0f1720",
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
  };
  const chatContainerStyle = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
  };
  const sidebarStyle = {
    width: "200px",
    backgroundColor: darkMode ? "#0b1220" : "#ffffff",
    borderLeft: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
    padding: "16px",
    overflowY: "auto",
  };
  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    borderBottom: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
  };
  const messagesWrapStyle = {
    flex: 1,
    padding: "16px",
    overflowY: "auto",
    backgroundColor: darkMode ? "#0b1220" : "#ffffff",
  };
  const inputBarStyle = {
    display: "flex",
    gap: "10px",
    padding: "12px",
    borderTop: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
    alignItems: "center",
    backgroundColor: darkMode ? "#071018" : "#fafafa",
  };
  const inputStyle = {
    flex: 1,
    padding: "12px 16px",
    borderRadius: "999px",
    border: `1px solid ${darkMode ? "#334155" : "#d1d5db"}`,
    outline: "none",
    backgroundColor: darkMode ? "#0b1220" : "#fff",
    color: darkMode ? "#e5e7eb" : "#111827",
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
  };
  const btnStyle = {
    padding: "10px 16px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
    color: "#fff",
  };

  return (
    <div style={containerStyle}>
      <div style={chatContainerStyle}>
      <div style={headerStyle}>
        <div>
          <strong style={{ fontSize: 18 }}>ChatBox</strong>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Your username: {username}</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={async () => {
              const newMode = !darkMode;
              setDarkMode(newMode);
              try {
                await fetch(`${backendHttp}/set_dark_mode`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ username, darkMode: newMode }),
                });
              } catch (err) {
                console.error("Failed to save dark mode:", err);
              }
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: darkMode ? "#111827" : "#e5e7eb",
              color: darkMode ? "#fff" : "#111827",
              cursor: "pointer",
            }}
          >
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: darkMode ? "#dc2626" : "#ef4444",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={messagesWrapStyle}>
        {messages.map((m) => {
          const isMine = !!m.fromUser;
          const wrapperStyle = {
            display: "flex",
            justifyContent: isMine ? "flex-end" : "flex-start",
            marginBottom: 10,
          };
          const bubbleStyle = {
            backgroundColor: isMine ? (darkMode ? "#064e4e" : "#dcf8c6") : (darkMode ? "#1f2937" : "#ffffff"),
            color: darkMode ? "#fff" : "#111827",
            padding: "8px 12px",
            borderRadius: 12,
            maxWidth: "72%",
            boxShadow: isMine ? "0 3px 8px rgba(2,6,23,0.2)" : "0 1px 3px rgba(2,6,23,0.06)",
          };
          const nameStyle = { fontSize: 12, fontWeight: 700, marginBottom: 4, opacity: 0.9 };
          const textStyle = { whiteSpace: "pre-wrap" };
          const tsStyle = { fontSize: 11, textAlign: "right", marginTop: 6, opacity: 0.7 };

          return (
            <div key={m.id} style={wrapperStyle}>
              <div style={bubbleStyle}>
                <div style={nameStyle}>{isMine ? "You" : m.username}</div>

                {editingId === m.id ? (
                  <>
                    <input
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && editMessage(m.id)}
                      style={{ width: "100%", padding: 4, marginBottom: 4 }}
                    />
                    <button onClick={() => editMessage(m.id)} style={btnStyle}>
                      Save
                    </button>
                  </>
                ) : (
                  <div style={textStyle}>{m.text}</div>
                )}

                <div style={tsStyle} title={m.timestamp}>{formatTimeAgo(m.timestamp)}</div>

                {isMine && editingId !== m.id && (
                  <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                    <button
                      onClick={() => {
                        setEditingId(m.id);
                        setEditInput(m.text);
                      }}
                      style={btnStyle}
                    >
                      Edit
                    </button>
                    <button onClick={() => deleteMessage(m.id)} style={btnStyle}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {typingUsers.length > 0 && (
          <div style={{ 
            padding: "8px 16px", 
            fontSize: "12px", 
            opacity: 0.7,
            fontStyle: "italic"
          }}>
            {typingUsers.length === 1 
              ? `${typingUsers[0]} is typing...` 
              : `${typingUsers.slice(0, 2).join(", ")}${typingUsers.length > 2 ? ` and ${typingUsers.length - 2} others` : ""} are typing...`
            }
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={inputBarStyle}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your message..."
          style={inputStyle}
        />
        <button onClick={sendMessage} style={btnStyle}>
          Send
        </button>
      </div>
      </div>
      
      <div style={sidebarStyle}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "600" }}>
          Online Users ({onlineUsers.length})
        </h3>
        {onlineUsers.map((user, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 0",
              fontSize: "13px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                marginRight: "8px",
              }}
            />
            <span style={{ fontWeight: user === username ? "600" : "400" }}>
              {user === username ? "You" : user}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
