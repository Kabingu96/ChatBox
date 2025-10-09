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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [availableRooms] = useState(['general', 'random', 'tech', 'gaming']);
  const [showSidebar, setShowSidebar] = useState(false);
  const endRef = useRef(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationsEnabled(permission === 'granted');
        });
      }
    }
  }, []);

  // Open WebSocket once
  useEffect(() => {
    const socket = new WebSocket(`${backendWs}/ws?username=${username}&room=${currentRoom}`);

    socket.onopen = () => console.log("✅ WebSocket connected to room:", currentRoom);

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
            reactions: m.reactions || {},
            fileUrl: m.fileUrl,
            fileType: m.fileType,
            fileName: m.fileName,
          }));
          setMessages((prev) => [...prev, ...hist]);
          return;
        }

        // single message
        if (payload.username && (payload.text || payload.fileUrl)) {
          const incoming = {
            id: payload.id,
            username: payload.username,
            text: payload.text,
            timestamp: payload.timestamp || new Date().toLocaleString("en-US", { timeZoneName: "short" }),
            fromUser: payload.username === username,
            reactions: payload.reactions || {},
            fileUrl: payload.fileUrl,
            fileType: payload.fileType,
            fileName: payload.fileName,
          };
          setMessages((prev) => [...prev, incoming]);
          
          // Play notification sound and show notification for messages from others
          if (payload.username !== username) {
            playNotificationSound();
            showNotification(payload.username, payload.text);
          }
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
          console.log('Received users list for room:', payload.room, payload.users);
          if (payload.room === currentRoom) {
            setOnlineUsers(payload.users);
          }
        }

        // typing indicator
        if (payload.type === "typing") {
          setTypingUsers((prev) => {
            const filtered = prev.filter(u => u !== payload.username);
            return payload.isTyping ? [...filtered, payload.username] : filtered;
          });
        }

        // reaction update
        if (payload.type === "reaction") {
          setMessages((prev) => [...prev]); // Force re-render
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
  }, [username, backendWs, currentRoom]);

  // Filter messages based on search query
  const filteredMessages = searchQuery.trim() 
    ? messages.filter(m => 
        (m.text && m.text.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.username && m.username.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : messages;

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredMessages]);

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
      reactions: {},
      fileUrl: null,
      fileType: null,
      fileName: null,
    };
    setMessages((prev) => [...prev, local]);

    // send to server
    ws.send(JSON.stringify({ username, text: textTrimmed, timestamp, clientId: local.id, room: currentRoom }));
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

  const addReaction = (messageId, emoji) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ 
      type: "reaction", 
      messageId, 
      emoji, 
      username 
    }));
  };

  const playNotificationSound = () => {
    if (document.hidden && audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  const showNotification = (sender, text) => {
    if (notificationsEnabled && document.hidden) {
      const notification = new Notification(`${sender} says:`, {
        body: text.length > 50 ? text.substring(0, 50) + '...' : text,
        icon: '/favicon.ico',
        tag: 'chatbox-message'
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      
      setTimeout(() => notification.close(), 5000);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`${backendHttp}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const result = await response.json();
      
      // Send file message
      const timestamp = new Date().toLocaleString("en-US", { timeZoneName: "short" });
      const fileMessage = {
        id: Date.now(),
        username,
        text: '',
        timestamp,
        fromUser: true,
        reactions: {},
        fileUrl: result.fileUrl,
        fileType: result.fileType,
        fileName: result.fileName,
      };
      
      setMessages((prev) => [...prev, fileMessage]);
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          username,
          text: '',
          timestamp,
          clientId: fileMessage.id,
          fileUrl: result.fileUrl,
          fileType: result.fileType,
          fileName: result.fileName,
          room: currentRoom,
        }));
      }
    } catch (err) {
      console.error('File upload failed:', err);
      alert('File upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
      e.target.value = ''; // Reset input
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };



  const isMobile = window.innerWidth <= 768;
  
  const containerStyle = {
    display: "flex",
    height: "100vh",
    backgroundColor: darkMode ? "#0f1720" : "#f3f4f6",
    color: darkMode ? "#e5e7eb" : "#0f1720",
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    position: "relative",
  };
  const chatContainerStyle = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  };
  const sidebarStyle = {
    width: "280px",
    backgroundColor: darkMode ? "#0b1220" : "#ffffff",
    borderRight: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
    padding: "16px",
    overflowY: "auto",
    position: "fixed",
    top: 0,
    left: showSidebar ? 0 : "-280px",
    height: "100vh",
    zIndex: 1000,
    transition: "left 0.3s ease",
    boxShadow: showSidebar ? "4px 0 8px rgba(0,0,0,0.1)" : "none",
  };
  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: isMobile ? "8px" : "12px",
    borderBottom: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
    flexWrap: isMobile ? "wrap" : "nowrap",
    gap: isMobile ? "8px" : "0",
    position: "sticky",
    top: 0,
    zIndex: 100,
    backgroundColor: darkMode ? "#0f1720" : "#f3f4f6",
  };
  const messagesWrapStyle = {
    flex: 1,
    padding: isMobile ? "8px" : "16px",
    overflowY: "auto",
    backgroundColor: darkMode ? "#0b1220" : "#ffffff",
  };
  const inputBarStyle = {
    display: "flex",
    gap: isMobile ? "6px" : "10px",
    padding: isMobile ? "8px" : "12px",
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              border: "none",
              backgroundColor: darkMode ? "#374151" : "#e5e7eb",
              color: darkMode ? "#fff" : "#111827",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ☰
          </button>
          <div>
            <strong style={{ fontSize: isMobile ? 16 : 18 }}>ChatBox</strong>
            <div style={{ fontSize: isMobile ? 11 : 12, opacity: 0.8 }}>#{currentRoom} • {username}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: isMobile ? "4px" : "8px", flexWrap: "wrap" }}>
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
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: darkMode ? "#111827" : "#e5e7eb",
              color: darkMode ? "#fff" : "#111827",
              cursor: "pointer",
              fontSize: isMobile ? "11px" : "14px",
            }}
          >
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={() => {
              if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                  setNotificationsEnabled(permission === 'granted');
                });
              }
            }}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: notificationsEnabled ? (darkMode ? "#059669" : "#10b981") : (darkMode ? "#6b7280" : "#9ca3af"),
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            🔔
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: showSearch ? (darkMode ? "#0ea5a4" : "#2563eb") : (darkMode ? "#6b7280" : "#9ca3af"),
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            🔍
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: darkMode ? "#dc2626" : "#ef4444",
              color: "#fff",
              cursor: "pointer",
              fontSize: isMobile ? "11px" : "14px",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {showSearch && (
        <div style={{
          padding: "12px",
          borderBottom: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
          backgroundColor: darkMode ? "#0f1720" : "#f9fafb",
          position: "sticky",
          top: isMobile ? "64px" : "72px",
          zIndex: 99,
        }}>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
              backgroundColor: darkMode ? "#1f2937" : "#fff",
              color: darkMode ? "#e5e7eb" : "#111827",
              outline: "none",
            }}
          />
          {searchQuery && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              Found {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      <div 
        style={messagesWrapStyle}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {filteredMessages.map((m) => {
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
            maxWidth: isMobile ? "85%" : "72%",
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
                  <>
                    {m.text && <div style={textStyle}>{m.text}</div>}
                    {m.fileUrl && (
                      <div style={{ marginTop: m.text ? 8 : 0 }}>
                        {m.fileType && m.fileType.startsWith('image/') ? (
                          <img 
                            src={`${backendHttp}${m.fileUrl}`}
                            alt={m.fileName}
                            style={{
                              maxWidth: isMobile ? '150px' : '200px',
                              maxHeight: isMobile ? '150px' : '200px',
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                            onClick={() => window.open(`${backendHttp}${m.fileUrl}`, '_blank')}
                          />
                        ) : (
                          <a 
                            href={`${backendHttp}${m.fileUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-block',
                              padding: '8px 12px',
                              backgroundColor: darkMode ? '#374151' : '#f3f4f6',
                              borderRadius: 8,
                              textDecoration: 'none',
                              color: darkMode ? '#e5e7eb' : '#111827',
                              fontSize: 12
                            }}
                          >
                            📎 {m.fileName}
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div style={tsStyle} title={m.timestamp}>{formatTimeAgo(m.timestamp)}</div>

                {/* Reactions */}
                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {Object.entries(m.reactions).map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(m.id, emoji)}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 12,
                          border: "1px solid",
                          borderColor: users.includes(username) ? (darkMode ? "#0ea5a4" : "#2563eb") : (darkMode ? "#374151" : "#d1d5db"),
                          backgroundColor: users.includes(username) ? (darkMode ? "#0f2a2a" : "#dbeafe") : "transparent",
                          color: darkMode ? "#e5e7eb" : "#111827",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick reaction buttons */}
                <div style={{ marginTop: 4, display: "flex", gap: 2 }}>
                  {["👍", "❤️", "😂"].map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => addReaction(m.id, emoji)}
                      style={{
                        padding: "2px 4px",
                        borderRadius: 8,
                        border: "none",
                        backgroundColor: "transparent",
                        fontSize: 12,
                        cursor: "pointer",
                        opacity: 0.6,
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = 1}
                      onMouseLeave={(e) => e.target.style.opacity = 0.6}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {isMine && editingId !== m.id && (
                  <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept="image/*,application/pdf,.txt,.doc,.docx"
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            ...btnStyle,
            backgroundColor: uploading ? (darkMode ? '#6b7280' : '#9ca3af') : (darkMode ? '#059669' : '#10b981'),
          }}
        >
          {uploading ? '📤' : '📎'}
        </button>
        <button onClick={sendMessage} style={btnStyle}>
          Send
        </button>
      </div>
      </div>
      
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT" type="audio/wav" />
      </audio>
      
      {showSidebar && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 999,
          }}
          onClick={() => setShowSidebar(false)}
        />
      )}
      <div style={sidebarStyle}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "600" }}>
          Rooms
        </h3>
        <button
          onClick={() => setShowSidebar(false)}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            padding: "4px 8px",
            borderRadius: 4,
            border: "none",
            backgroundColor: darkMode ? "#374151" : "#e5e7eb",
            color: darkMode ? "#fff" : "#111827",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          ✕
        </button>
        {availableRooms.map((room) => (
          <div
            key={room}
            onClick={() => {
              if (room !== currentRoom) {
                setCurrentRoom(room);
                setMessages([]); // Clear messages when switching rooms
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 12px",
              marginBottom: "4px",
              borderRadius: 8,
              cursor: "pointer",
              backgroundColor: room === currentRoom ? (darkMode ? "#0ea5a4" : "#2563eb") : "transparent",
              color: room === currentRoom ? "#fff" : (darkMode ? "#e5e7eb" : "#111827"),
              fontSize: "13px",
            }}
          >
            <span style={{ marginRight: "8px" }}>#</span>
            {room}
          </div>
        ))}
        
        <h3 style={{ margin: "16px 0 12px 0", fontSize: "14px", fontWeight: "600" }}>
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
