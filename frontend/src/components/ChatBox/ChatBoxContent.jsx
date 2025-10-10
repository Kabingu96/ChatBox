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

// Generate avatar from username
const getAvatar = (username) => {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const hash = username.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const color = colors[hash % colors.length];
  const initial = username.charAt(0).toUpperCase();
  return { color, initial };
};

// Format message text with markdown-style formatting, @mentions, and search highlighting
const formatMessage = (text, currentUsername, searchTerm = '') => {
  if (!text) return null;
  
  const parts = [];
  let currentIndex = 0;
  
  // Regex patterns for formatting (including @mentions and search highlighting)
  const patterns = [
    { regex: /\*\*(.*?)\*\*/g, tag: 'strong' },
    { regex: /\*(.*?)\*/g, tag: 'em' },
    { regex: /__(.*?)__/g, tag: 'strong' },
    { regex: /_(.*?)_/g, tag: 'em' },
    { regex: /`(.*?)`/g, tag: 'code' },
    { regex: /@(\w+)/g, tag: 'mention' },
  ];
  
  // Add search highlighting pattern if search term exists
  if (searchTerm && searchTerm.trim()) {
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push({ regex: new RegExp(`(${escapedTerm})`, 'gi'), tag: 'highlight' });
  }
  
  const matches = [];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        tag: pattern.tag,
        full: match[0]
      });
    }
  });
  
  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);
  
  // Remove overlapping matches
  const validMatches = [];
  matches.forEach(match => {
    if (!validMatches.some(vm => 
      (match.start >= vm.start && match.start < vm.end) ||
      (match.end > vm.start && match.end <= vm.end)
    )) {
      validMatches.push(match);
    }
  });
  
  if (validMatches.length === 0) {
    return text;
  }
  
  let lastIndex = 0;
  const elements = [];
  
  validMatches.forEach((match, index) => {
    // Add text before match
    if (match.start > lastIndex) {
      elements.push(text.slice(lastIndex, match.start));
    }
    
    // Add formatted element
    const key = `format-${index}`;
    if (match.tag === 'strong') {
      elements.push(React.createElement('strong', { key }, match.content));
    } else if (match.tag === 'em') {
      elements.push(React.createElement('em', { key }, match.content));
    } else if (match.tag === 'code') {
      elements.push(React.createElement('code', { 
        key, 
        style: { 
          backgroundColor: 'rgba(255,255,255,0.1)', 
          padding: '2px 4px', 
          borderRadius: 3, 
          fontSize: '0.9em' 
        } 
      }, match.content));
    } else if (match.tag === 'mention') {
      const isCurrentUser = match.content.toLowerCase() === currentUsername.toLowerCase();
      elements.push(React.createElement('span', { 
        key, 
        style: { 
          backgroundColor: isCurrentUser ? '#fbbf24' : '#3b82f6',
          color: isCurrentUser ? '#000' : '#fff',
          padding: '2px 6px', 
          borderRadius: 12, 
          fontSize: '0.9em',
          fontWeight: 'bold'
        } 
      }, `@${match.content}`));
    } else if (match.tag === 'highlight') {
      elements.push(React.createElement('mark', { 
        key, 
        style: { 
          backgroundColor: '#fbbf24',
          color: '#000',
          padding: '1px 2px',
          borderRadius: 2,
          fontWeight: 'bold'
        } 
      }, match.content));
    }
    
    lastIndex = match.end;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }
  
  return elements;
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
  const [availableRooms, setAvailableRooms] = useState([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [newRoomIsPrivate, setNewRoomIsPrivate] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [keywords, setKeywords] = useState(['urgent', 'help', 'meeting']);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [userStatus, setUserStatus] = useState('online');
  const [searchFilters, setSearchFilters] = useState({
    dateRange: 'all', // 'today', 'week', 'month', 'all'
    userFilter: 'all',
    fileTypeFilter: 'all' // 'images', 'files', 'text', 'all'
  });
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [isRichTextMode, setIsRichTextMode] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState({
    avatar: null,
    customStatus: '',
    bio: ''
  });
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [expandedReactions, setExpandedReactions] = useState({});
  const [roomJoinTime, setRoomJoinTime] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const recordingInterval = useRef(null);
  const endRef = useRef(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const recordingRef = useRef(null);

  // Resolve backend base URL with env overrides for production
  const isSecure = window.location.protocol === "https:";
  const httpProto = isSecure ? "https" : "http";
  const wsProto = isSecure ? "wss" : "ws";
  const host = window.location.hostname;
  const backendHttp =
    process.env.REACT_APP_API_BASE || `${httpProto}://${host}:8080`;
  const backendWs =
    process.env.REACT_APP_WS_BASE || `${wsProto}://${host}:8080`;

  // Load dark mode preference and rooms from backend
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
    
    const fetchRooms = async () => {
      try {
        const res = await fetch(`${backendHttp}/rooms/list`);
        if (res.ok) {
          const rooms = await res.json();
          setAvailableRooms(rooms);
        }
      } catch (err) {
        console.error("Failed to load rooms:", err);
        // Fallback to default rooms
        setAvailableRooms([
          {name: 'general', description: 'General discussion', isPrivate: false},
          {name: 'random', description: 'Random topics', isPrivate: false},
          {name: 'tech', description: 'Technology discussions', isPrivate: false},
          {name: 'gaming', description: 'Gaming discussions', isPrivate: false}
        ]);
      }
    };
    
    fetchDarkMode();
    fetchRooms();
    
    // Load user profile
    const savedProfile = localStorage.getItem(`chatbox-profile-${username}`);
    if (savedProfile) {
      try {
        setUserProfile(JSON.parse(savedProfile));
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    }
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

    socket.onopen = () => {
      console.log("✅ WebSocket connected to room:", currentRoom);
      setConnectionStatus('connected');
      setRoomJoinTime(new Date());
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        // ack from server to map local temp id -> real id
        if (payload.type === "ack" && payload.clientId && payload.id) {
          setMessages((prev) => prev.map((m) => (m.id === payload.clientId ? { ...m, id: payload.id, status: "sent" } : m)));
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
            status: "delivered",
            replyTo: m.replyTo,
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
            status: "delivered",
            replyTo: payload.replyTo,
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

    socket.onclose = () => {
      console.log("❌ WebSocket closed, attempting reconnect...");
      setConnectionStatus('reconnecting');
      setTimeout(() => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          console.log("🔄 Reconnecting WebSocket...");
          const newSocket = new WebSocket(`${backendWs}/ws?username=${username}&room=${currentRoom}`);
          setWs(newSocket);
        }
      }, 3000);
    };
    socket.onerror = (err) => console.error("WebSocket error:", err);

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [username, backendWs, currentRoom]);

  // Advanced message filtering
  const filteredMessages = (() => {
    let filtered = messages;
    
    // Text search
    if (searchQuery.trim()) {
      filtered = filtered.filter(m => 
        (m.text && m.text.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.username && m.username.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    // Date range filter
    if (searchFilters.dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      
      switch (searchFilters.dateRange) {
        case 'today':
          cutoff.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          break;
      }
      
      filtered = filtered.filter(m => new Date(m.timestamp) >= cutoff);
    }
    
    // User filter
    if (searchFilters.userFilter !== 'all') {
      filtered = filtered.filter(m => m.username === searchFilters.userFilter);
    }
    
    // File type filter
    if (searchFilters.fileTypeFilter !== 'all') {
      switch (searchFilters.fileTypeFilter) {
        case 'images':
          filtered = filtered.filter(m => m.fileType && m.fileType.indexOf('image/') === 0);
          break;
        case 'files':
          filtered = filtered.filter(m => m.fileUrl && (!m.fileType || m.fileType.indexOf('image/') !== 0));
          break;
        case 'text':
          filtered = filtered.filter(m => m.text && !m.fileUrl);
          break;
      }
    }
    
    return filtered;
  })();

  // Scroll to bottom (only if auto-scroll is enabled)
  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredMessages, autoScroll]);

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

  const createRoomHandler = async (roomData) => {
    try {
      const res = await fetch(`${backendHttp}/rooms/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Username': username
        },
        body: JSON.stringify(roomData)
      });
      
      if (res.ok) {
        const newRoom = await res.json();
        setAvailableRooms(prev => [...prev, newRoom]);
        return newRoom;
      } else {
        throw new Error(await res.text());
      }
    } catch (err) {
      throw err;
    }
  };
  
  const joinRoomHandler = async (roomName, password = '') => {
    try {
      const res = await fetch(`${backendHttp}/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, password })
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      return true;
    } catch (err) {
      throw err;
    }
  };
  
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
      status: "sending",
      replyTo: replyingTo,
    };
    
    // Clear reply state
    setReplyingTo(null);
    setMessages((prev) => [...prev, local]);

    // send to server
    ws.send(JSON.stringify({ username, text: textTrimmed, timestamp, clientId: local.id, room: currentRoom, replyTo: replyingTo }));
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

  const showNotification = (sender, text, isSpecial = false) => {
    if (notificationsEnabled) {
      // Check for @mentions
      const isMentioned = text.toLowerCase().includes(`@${username.toLowerCase()}`);
      
      // Check for keywords
      const hasKeyword = keywords.some(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // Show notification if hidden OR if mentioned/keyword
      if (document.hidden || isMentioned || hasKeyword || isSpecial) {
        let title = `${sender} says:`;
        let body = text.length > 50 ? text.substring(0, 50) + '...' : text;
        
        if (isMentioned) {
          title = `🔔 ${sender} mentioned you:`;
        } else if (hasKeyword) {
          title = `⚠️ ${sender} (keyword alert):`;
        }
        
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: 'chatbox-message',
          requireInteraction: isMentioned || hasKeyword,
          badge: '/favicon.ico',
          vibrate: isMentioned ? [200, 100, 200] : [100]
        });
        
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        
        setTimeout(() => notification.close(), isMentioned || hasKeyword ? 10000 : 5000);
      }
    }
  };
  
  // Service Worker for push notifications when tab is closed
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').catch(err => 
        console.log('SW registration failed:', err)
      );
    }
  }, []);

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
        status: "sending",
        replyTo: replyingTo,
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
          replyTo: replyingTo,
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

  const insertEmoji = (emoji) => {
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);
        sendVoiceMessage(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingInterval.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Recording failed:', err);
      alert('Microphone access denied or not available');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      clearInterval(recordingInterval.current);
    }
  };
  
  const sendVoiceMessage = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice-message.webm');
    
    try {
      const response = await fetch(`${backendHttp}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const result = await response.json();
      
      const timestamp = new Date().toLocaleString("en-US", { timeZoneName: "short" });
      const voiceMessage = {
        id: Date.now(),
        username,
        text: '',
        timestamp,
        fromUser: true,
        reactions: {},
        fileUrl: result.fileUrl,
        fileType: 'audio/webm',
        fileName: 'Voice Message',
        status: "sending",
        isVoiceMessage: true,
      };
      
      setMessages((prev) => [...prev, voiceMessage]);
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          username,
          text: '',
          timestamp,
          clientId: voiceMessage.id,
          fileUrl: result.fileUrl,
          fileType: 'audio/webm',
          fileName: 'Voice Message',
          room: currentRoom,
          isVoiceMessage: true,
        }));
      }
    } catch (err) {
      console.error('Voice message upload failed:', err);
      alert('Voice message upload failed. Please try again.');
    }
  };

  const commonEmojis = [
    '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😋',
    '😎', '🤔', '😴', '😢', '😭', '😡', '🤯', '😱',
    '👍', '👎', '👏', '🙌', '👋', '🤝', '💪', '🙏',
    '❤️', '💕', '💖', '💯', '🔥', '⭐', '✨', '🎉',
    '🎊', '🎈', '🎁', '🍕', '🍔', '🍟', '☕', '🍺',
    '🌟', '🌈', '🌸', '🌺', '🎵', '🎶', '⚡', '💎',
    '🚀', '🎆', '🌎', '🌙', '☀️', '⛅', '☔', '⛄'
  ];



  const isMobile = window.innerWidth <= 768;
  
  // Use CSS classes instead of inline styles for theming
  const chatContainerStyle = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  };
  const sidebarStyle = {
    width: isMobile ? "100vw" : "280px",
    backgroundColor: darkMode ? "#0b1220" : "#ffffff",
    borderRight: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
    padding: "16px",
    overflowY: "auto",
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    zIndex: 1000,
    boxShadow: "4px 0 8px rgba(0,0,0,0.1)",
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
    position: "relative",
  };
  const inputBarStyle = {
    display: "flex",
    gap: isMobile ? "2px" : "4px",
    padding: isMobile ? "6px" : "10px",
    borderTop: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
    alignItems: "center",
    backgroundColor: darkMode ? "#071018" : "#fafafa",
  };
  // Use CSS classes for input styling
  const btnStyle = {
    padding: "10px 16px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
    color: "#fff",
  };

  // Add CSS animation for typing indicators
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.1); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div className={`chat-container ${darkMode ? 'dark' : ''}`}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div className="chat-header">
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: getAvatar(username).color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: "bold",
              color: "white",
            }}>
              {getAvatar(username).initial}
            </div>
            <div>
              <strong style={{ fontSize: isMobile ? 16 : 18 }}>ChatBox</strong>
              <div style={{ fontSize: isMobile ? 11 : 12, opacity: 0.8 }}>
                #{currentRoom} • {username} • {filteredMessages.length} messages
                {roomJoinTime && (
                  <span style={{ marginLeft: 8, fontSize: 10 }}>
                    • Joined {formatTimeAgo(roomJoinTime.toISOString())}
                  </span>
                )}
                <span style={{ 
                  marginLeft: 8, 
                  color: connectionStatus === 'connected' ? '#10b981' : connectionStatus === 'reconnecting' ? '#f59e0b' : '#ef4444',
                  fontSize: 10
                }}>
                  {connectionStatus === 'connected' ? '• Online' : connectionStatus === 'reconnecting' ? '• Reconnecting...' : '• Offline'}
                </span>
              </div>
            </div>
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
            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: showAdvancedSearch ? (darkMode ? "#7c3aed" : "#8b5cf6") : (darkMode ? "#6b7280" : "#9ca3af"),
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
            }}
            title="Advanced search filters"
          >
            🎛️
          </button>
          <select
            value={userStatus}
            onChange={(e) => setUserStatus(e.target.value)}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: darkMode ? "#374151" : "#e5e7eb",
              color: darkMode ? "#fff" : "#111827",
              cursor: "pointer",
              fontSize: isMobile ? "10px" : "12px",
            }}
          >
            <option value="online">🟢 Online</option>
            <option value="away">🟡 Away</option>
            <option value="busy">🔴 Busy</option>
          </select>
          <button
            onClick={() => setShowProfile(!showProfile)}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: showProfile ? (darkMode ? "#7c3aed" : "#8b5cf6") : (darkMode ? "#6b7280" : "#9ca3af"),
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
            }}
            title="Profile settings"
          >
            👤
          </button>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: autoScroll ? (darkMode ? "#10b981" : "#059669") : (darkMode ? "#6b7280" : "#9ca3af"),
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
            }}
            title={autoScroll ? "Auto-scroll ON (click to disable)" : "Auto-scroll OFF (click to enable)"}
          >
            {autoScroll ? "⬇️" : "⏸️"}
          </button>
          <button
            onClick={() => {
              if (window.confirm('Clear all messages from this room? This only clears your local view.')) {
                setMessages([]);
              }
            }}
            style={{
              padding: isMobile ? "4px 6px" : "6px 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              backgroundColor: darkMode ? "#f59e0b" : "#fbbf24",
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
            }}
            title="Clear chat history (local only)"
          >
            🧽
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
          {(searchQuery || searchFilters.dateRange !== 'all' || searchFilters.userFilter !== 'all' || searchFilters.fileTypeFilter !== 'all') && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              Found {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
      
      {showAdvancedSearch && (
        <div style={{
          padding: "12px",
          borderBottom: `1px solid ${darkMode ? "#1f2937" : "#e5e7eb"}`,
          backgroundColor: darkMode ? "#111827" : "#ffffff",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "8px" }}>
            <select
              value={searchFilters.dateRange}
              onChange={(e) => setSearchFilters(prev => ({ ...prev, dateRange: e.target.value }))}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                backgroundColor: darkMode ? "#1f2937" : "#fff",
                color: darkMode ? "#e5e7eb" : "#111827",
                fontSize: "12px",
              }}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            
            <select
              value={searchFilters.userFilter}
              onChange={(e) => setSearchFilters(prev => ({ ...prev, userFilter: e.target.value }))}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                backgroundColor: darkMode ? "#1f2937" : "#fff",
                color: darkMode ? "#e5e7eb" : "#111827",
                fontSize: "12px",
              }}
            >
              <option value="all">All Users</option>
              {[...new Set(messages.map(m => m.username))].map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
            
            <select
              value={searchFilters.fileTypeFilter}
              onChange={(e) => setSearchFilters(prev => ({ ...prev, fileTypeFilter: e.target.value }))}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                backgroundColor: darkMode ? "#1f2937" : "#fff",
                color: darkMode ? "#e5e7eb" : "#111827",
                fontSize: "12px",
              }}
            >
              <option value="all">All Content</option>
              <option value="text">Text Only</option>
              <option value="images">Images</option>
              <option value="files">Files</option>
            </select>
          </div>
          
          <button
            onClick={() => {
              setSearchFilters({ dateRange: 'all', userFilter: 'all', fileTypeFilter: 'all' });
              setSearchQuery('');
            }}
            style={{
              marginTop: "8px",
              padding: "4px 8px",
              borderRadius: 4,
              border: "none",
              backgroundColor: darkMode ? "#374151" : "#e5e7eb",
              color: darkMode ? "#fff" : "#111827",
              cursor: "pointer",
              fontSize: "11px",
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      <div 
        className="messages-wrap"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onScroll={(e) => {
          if (!autoScroll) {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
            setShowScrollToBottom(!isAtBottom);
          }
        }}
      >
        {filteredMessages.map((m) => {
          const isMine = !!m.fromUser;
          const wrapperStyle = {
            display: "flex",
            justifyContent: isMine ? "flex-end" : "flex-start",
            marginBottom: 10,
          };
          const nameStyle = { fontSize: 12, fontWeight: 700, marginBottom: 4, opacity: 0.9 };
          const textStyle = { whiteSpace: "pre-wrap" };
          const tsStyle = { fontSize: 11, textAlign: "right", marginTop: 6, opacity: 0.7 };

          return (
            <div key={m.id} className="message-wrapper">
              <div className={`message-bubble ${isMine ? 'mine' : 'other'}`}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                  {!isMine && (
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      backgroundColor: getAvatar(m.username).color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: "bold",
                      color: "white",
                      marginRight: 6,
                    }}>
                      {getAvatar(m.username).initial}
                    </div>
                  )}
                  <div style={nameStyle}>{isMine ? "You" : m.username}</div>
                </div>
                
                {m.replyTo && (
                  <div style={{
                    backgroundColor: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                    padding: "4px 8px",
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 11,
                    opacity: 0.8,
                    borderLeft: `2px solid ${darkMode ? "#0ea5a4" : "#2563eb"}`,
                  }}>
                    ↳ Replying to: {m.replyTo.text ? m.replyTo.text.substring(0, 50) + (m.replyTo.text.length > 50 ? '...' : '') : 'File'}
                  </div>
                )}

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
                    {m.text && <div style={textStyle}>{formatMessage(m.text, username, searchQuery)}</div>}
                    {m.fileUrl && (
                      <div style={{ marginTop: m.text ? 8 : 0 }}>
                        {m.fileType && m.fileType.indexOf('image/') === 0 ? (
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
                        ) : m.isVoiceMessage || (m.fileType && m.fileType.indexOf('audio/') === 0) ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            backgroundColor: darkMode ? '#374151' : '#f3f4f6',
                            borderRadius: 8,
                            fontSize: 12
                          }}>
                            <button
                              onClick={() => {
                                const audio = new Audio(`${backendHttp}${m.fileUrl}`);
                                audio.play().catch(e => console.log('Audio play failed:', e));
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: 'none',
                                backgroundColor: darkMode ? '#0ea5a4' : '#2563eb',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '10px'
                              }}
                            >
                              ▶️ Play
                            </button>
                            <span>🎤 Voice Message</span>
                          </div>
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

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <div style={tsStyle} title={m.timestamp}>{formatTimeAgo(m.timestamp)}</div>
                  {isMine && (
                    <div style={{ fontSize: 10, opacity: 0.6, marginLeft: 8 }}>
                      {m.status === "sending" && "⏳"}
                      {m.status === "sent" && "✓"}
                      {m.status === "delivered" && "✓✓"}
                      {m.status === "read" && "👁️"}
                    </div>
                  )}
                </div>

                {/* Reactions */}
                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {Object.entries(m.reactions).map(([emoji, users]) => (
                        <button
                          key={emoji}
                          onClick={() => addReaction(m.id, emoji)}
                          onDoubleClick={() => setExpandedReactions(prev => ({
                            ...prev,
                            [`${m.id}-${emoji}`]: !prev[`${m.id}-${emoji}`]
                          }))}
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
                          title="Click to react, double-click to see who reacted"
                        >
                          {emoji} {users.length}
                        </button>
                      ))}
                    </div>
                    {/* Expanded reactions panel */}
                    {Object.entries(m.reactions).map(([emoji, users]) => 
                      expandedReactions[`${m.id}-${emoji}`] && (
                        <div
                          key={`expanded-${emoji}`}
                          style={{
                            marginTop: 6,
                            padding: "8px",
                            backgroundColor: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                            borderRadius: 6,
                            fontSize: 11,
                          }}
                        >
                          <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                            {emoji} Reactions ({users.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {users.map(user => (
                              <div
                                key={user}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 6px",
                                  backgroundColor: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                                  borderRadius: 8,
                                }}
                              >
                                <div style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  backgroundColor: getAvatar(user).color,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 7,
                                  fontWeight: "bold",
                                  color: "white",
                                }}>
                                  {getAvatar(user).initial}
                                </div>
                                <span>{user === username ? "You" : user}</span>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => setExpandedReactions(prev => ({
                              ...prev,
                              [`${m.id}-${emoji}`]: false
                            }))}
                            style={{
                              marginTop: 4,
                              padding: "2px 6px",
                              borderRadius: 4,
                              border: "none",
                              backgroundColor: "transparent",
                              color: darkMode ? "#9ca3af" : "#6b7280",
                              fontSize: 9,
                              cursor: "pointer",
                              opacity: 0.7,
                            }}
                          >
                            ✕ Close
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Quick reaction buttons */}
                <div style={{ marginTop: 4, display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {["👍", "❤️", "😂", "🔥", "🎉", "😍", "👏", "💯"].map(emoji => (
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
                      title={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setReplyingTo({ id: m.id, username: m.username, text: m.text })}
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: "none",
                      backgroundColor: "transparent",
                      color: darkMode ? "#9ca3af" : "#6b7280",
                      fontSize: 10,
                      cursor: "pointer",
                      opacity: 0.7,
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = 1}
                    onMouseLeave={(e) => e.target.style.opacity = 0.7}
                  >
                    ↳ Reply
                  </button>
                  {isMine && editingId !== m.id && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(m.id);
                          setEditInput(m.text);
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "none",
                          backgroundColor: "transparent",
                          color: darkMode ? "#9ca3af" : "#6b7280",
                          fontSize: 10,
                          cursor: "pointer",
                          opacity: 0.7,
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = 1}
                        onMouseLeave={(e) => e.target.style.opacity = 0.7}
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => deleteMessage(m.id)}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "none",
                          backgroundColor: "transparent",
                          color: darkMode ? "#9ca3af" : "#6b7280",
                          fontSize: 10,
                          cursor: "pointer",
                          opacity: 0.7,
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = 1}
                        onMouseLeave={(e) => e.target.style.opacity = 0.7}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {typingUsers.length > 0 && (
          <div style={{ 
            padding: "8px 16px", 
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "12px", 
            opacity: 0.7,
            fontStyle: "italic"
          }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {typingUsers.slice(0, 3).map((user, index) => (
                <div
                  key={user}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: getAvatar(user).color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: "bold",
                    color: "white",
                    animation: `pulse 1.5s ease-in-out ${index * 0.2}s infinite`,
                  }}
                  title={user}
                >
                  {getAvatar(user).initial}
                </div>
              ))}
            </div>
            <span>
              {typingUsers.length === 1 
                ? `${typingUsers[0]} is typing...` 
                : `${typingUsers.slice(0, 2).join(", ")}${typingUsers.length > 2 ? ` and ${typingUsers.length - 2} others` : ""} are typing...`
              }
            </span>
          </div>
        )}
        <div ref={endRef} />
        
        {/* Scroll to bottom button */}
        {!autoScroll && showScrollToBottom && (
          <button
            onClick={() => {
              endRef.current?.scrollIntoView({ behavior: "smooth" });
              setShowScrollToBottom(false);
            }}
            style={{
              position: "absolute",
              bottom: "20px",
              right: "20px",
              padding: "8px 12px",
              borderRadius: "20px",
              border: "none",
              backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
              color: "#fff",
              cursor: "pointer",
              fontSize: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Scroll to bottom"
          >
            ⬇️ Latest
          </button>
        )}
      </div>

      {replyingTo && (
        <div style={{
          padding: "8px 12px",
          backgroundColor: darkMode ? "#1f2937" : "#f3f4f6",
          borderTop: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
          fontSize: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>↳ Replying to <strong>{replyingTo.username}</strong>: {replyingTo.text ? replyingTo.text.substring(0, 40) + (replyingTo.text.length > 40 ? '...' : '') : 'File'}</span>
          <button
            onClick={() => setReplyingTo(null)}
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              border: "none",
              backgroundColor: darkMode ? "#374151" : "#e5e7eb",
              color: darkMode ? "#fff" : "#111827",
              cursor: "pointer",
              fontSize: 10,
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      <div className="input-bar">
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            gap: "4px",
            zIndex: 10,
          }}>
            <button
              onClick={() => {
                setInput(prev => prev + '**bold**');
              }}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "none",
                backgroundColor: darkMode ? '#374151' : '#e5e7eb',
                color: darkMode ? '#fff' : '#111827',
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "bold",
              }}
              title="Insert bold text (**bold**)"
            >
              B
            </button>
            <button
              onClick={() => {
                setInput(prev => prev + '*italic*');
              }}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "none",
                backgroundColor: darkMode ? '#374151' : '#e5e7eb',
                color: darkMode ? '#fff' : '#111827',
                cursor: "pointer",
                fontSize: "12px",
                fontStyle: "italic",
              }}
              title="Insert italic text (*italic*)"
            >
              I
            </button>
            <button
              onClick={() => {
                setInput(prev => prev + '`code`');
              }}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "none",
                backgroundColor: darkMode ? '#374151' : '#e5e7eb',
                color: darkMode ? '#fff' : '#111827',
                cursor: "pointer",
                fontSize: "10px",
                fontFamily: "monospace",
              }}
              title="Insert code (`code`)"
            >
              {"{}"}
            </button>
            <button
              onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "none",
                backgroundColor: showMarkdownPreview ? (darkMode ? '#7c3aed' : '#8b5cf6') : (darkMode ? '#374151' : '#e5e7eb'),
                color: showMarkdownPreview ? '#fff' : (darkMode ? '#fff' : '#111827'),
                cursor: "pointer",
                fontSize: "12px",
              }}
              title="Toggle markdown preview"
            >
              👁️
            </button>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "none",
                backgroundColor: showEmojiPicker ? (darkMode ? '#0ea5a4' : '#2563eb') : (darkMode ? '#374151' : '#e5e7eb'),
                color: showEmojiPicker ? '#fff' : (darkMode ? '#fff' : '#111827'),
                cursor: "pointer",
                fontSize: "12px",
              }}
              title="Emoji picker"
            >
              😀
            </button>
          </div>
          {isRichTextMode ? (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="input-bar-field"
              style={{
                paddingLeft: isMobile ? "90px" : "100px",
                minHeight: "40px",
                maxHeight: "120px",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          ) : (
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type your message..."
              className="input-bar-field"
              style={{
                paddingLeft: isMobile ? "90px" : "100px",
              }}
            />
          )}
          {showEmojiPicker && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: 0,
              right: 0,
              backgroundColor: darkMode ? "#1f2937" : "#ffffff",
              border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
              borderRadius: 8,
              padding: "12px",
              marginBottom: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 1000,
              maxHeight: "200px",
              overflowY: "auto",
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gap: "4px",
              }}>
                {commonEmojis.map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => insertEmoji(emoji)}
                    style={{
                      padding: "6px",
                      border: "none",
                      backgroundColor: "transparent",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = darkMode ? "#374151" : "#f3f4f6"}
                    onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {showMarkdownPreview && input.trim() && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: 0,
              right: 0,
              backgroundColor: darkMode ? "#111827" : "#f9fafb",
              border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
              borderRadius: 8,
              padding: "12px",
              marginBottom: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 999,
              maxHeight: "150px",
              overflowY: "auto",
            }}>
              <div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "6px" }}>Preview:</div>
              <div style={{ fontSize: "14px", lineHeight: "1.4" }}>
                {formatMessage(input, username)}
              </div>
            </div>
          )}
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept="image/*,application/pdf,.txt,.doc,.docx"
        />
        <button
          onClick={() => {
            const newKeyword = prompt('Add keyword for notifications:', '');
            if (newKeyword && newKeyword.trim()) {
              setKeywords(prev => [...prev, newKeyword.trim().toLowerCase()]);
            }
          }}
          style={{
            padding: "0",
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            backgroundColor: darkMode ? '#6b7280' : '#9ca3af',
            color: "#fff",
            fontSize: isMobile ? '10px' : '12px',
            width: isMobile ? '24px' : '28px',
            height: isMobile ? '24px' : '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
          title={`Keyword alerts: ${keywords.join(', ')}`}
        >
          🔔
        </button>
        <button
          onClick={() => setIsRichTextMode(!isRichTextMode)}
          style={{
            padding: "0",
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            backgroundColor: isRichTextMode ? (darkMode ? '#7c3aed' : '#8b5cf6') : (darkMode ? '#6b7280' : '#9ca3af'),
            color: "#fff",
            fontSize: isMobile ? '10px' : '12px',
            width: isMobile ? '24px' : '28px',
            height: isMobile ? '24px' : '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
          title={isRichTextMode ? 'Switch to single line' : 'Switch to multi-line editor'}
        >
          {isRichTextMode ? '📝' : '📄'}
        </button>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          style={{
            padding: "0",
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            backgroundColor: isRecording ? '#ef4444' : (darkMode ? '#8b5cf6' : '#7c3aed'),
            color: "#fff",
            position: 'relative',
            fontSize: isMobile ? '10px' : '12px',
            width: isMobile ? '24px' : '28px',
            height: isMobile ? '24px' : '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
          title={isRecording ? `Recording... ${recordingTime}s` : 'Record voice message'}
        >
          {isRecording ? '⏹️' : '🎤'}
          {isRecording && (
            <div style={{
              position: 'absolute',
              top: '-18px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '9px',
              color: '#ef4444',
              fontWeight: 'bold'
            }}>
              {recordingTime}s
            </div>
          )}
        </button>
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "0",
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            backgroundColor: uploading ? (darkMode ? '#6b7280' : '#9ca3af') : (darkMode ? '#059669' : '#10b981'),
            color: "#fff",
            fontSize: isMobile ? '10px' : '12px',
            width: isMobile ? '24px' : '28px',
            height: isMobile ? '24px' : '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          {uploading ? '📤' : '📎'}
        </button>
        <button 
          onClick={sendMessage} 
          style={{
            padding: isMobile ? "6px 10px" : "8px 12px",
            borderRadius: "999px",
            border: "none",
            cursor: "pointer",
            backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
            color: "#fff",
            fontSize: isMobile ? '11px' : '13px',
            fontWeight: '600',
            flexShrink: 0,
            minWidth: isMobile ? '50px' : '60px'
          }}
        >
          Send
        </button>
      </div>
      </div>
      
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT" type="audio/wav" />
      </audio>
      
      {showSidebar && (
        <>
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
        <button
          onClick={() => setShowCreateRoom(true)}
          style={{
            width: "100%",
            padding: "8px 12px",
            marginBottom: "8px",
            borderRadius: 8,
            border: `1px dashed ${darkMode ? "#374151" : "#d1d5db"}`,
            backgroundColor: "transparent",
            color: darkMode ? "#9ca3af" : "#6b7280",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          + Create Room
        </button>
        
        {availableRooms.map((room) => {
          const roomName = typeof room === 'string' ? room : room.name;
          const roomDesc = typeof room === 'string' ? '' : room.description;
          const isPrivate = typeof room === 'string' ? false : room.isPrivate;
          
          return (
            <div
              key={roomName}
              onClick={async () => {
                if (roomName !== currentRoom) {
                  // Check if private room needs password
                  if (isPrivate) {
                    const password = prompt(`Enter password for #${roomName}:`);
                    if (!password) return;
                    
                    try {
                      const res = await fetch(`${backendHttp}/rooms/join`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roomName, password })
                      });
                      
                      if (!res.ok) {
                        alert('Invalid password or room access denied');
                        return;
                      }
                    } catch (err) {
                      alert('Failed to join room');
                      return;
                    }
                  }
                  
                  setCurrentRoom(roomName);
                  setMessages([]); // Clear messages when switching rooms
                  setRoomJoinTime(null); // Reset join time when switching rooms
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                marginBottom: "4px",
                borderRadius: 8,
                cursor: "pointer",
                backgroundColor: roomName === currentRoom ? (darkMode ? "#0ea5a4" : "#2563eb") : "transparent",
                color: roomName === currentRoom ? "#fff" : (darkMode ? "#e5e7eb" : "#111827"),
                fontSize: "13px",
                position: "relative",
              }}
            >
              <span style={{ marginRight: "8px" }}>#</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: roomName === currentRoom ? "600" : "400" }}>
                  {roomName} {isPrivate && "🔒"}
                </div>
                {roomDesc && (
                  <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "2px" }}>
                    {roomDesc}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        <h3 style={{ margin: "16px 0 12px 0", fontSize: "14px", fontWeight: "600" }}>
          Online Users ({onlineUsers.length})
        </h3>
        {onlineUsers.map((user, index) => {
          const userName = typeof user === 'string' ? user : user.username;
          const userStatus = typeof user === 'string' ? 'online' : user.status;
          const statusColor = userStatus === 'online' ? '#10b981' : userStatus === 'away' ? '#f59e0b' : '#ef4444';
          
          return (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 0",
                fontSize: "13px",
              }}
            >
              <div style={{ position: "relative", marginRight: "8px" }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  backgroundColor: getAvatar(userName).color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: "bold",
                  color: "white",
                }}>
                  {getAvatar(userName).initial}
                </div>
                <div style={{
                  position: "absolute",
                  bottom: -1,
                  right: -1,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: statusColor,
                  border: `2px solid ${darkMode ? "#0b1220" : "#ffffff"}`,
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: userName === username ? "600" : "400" }}>
                  {userName === username ? "You" : userName}
                </span>
                {userStatus !== 'online' && (
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    {userStatus}
                  </div>
                )}
              </div>
            </div>
          );
        })}
          </div>
        </>
      )}
      
      {/* Create Room Modal */}
      {showCreateRoom && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 1001,
            }}
            onClick={() => setShowCreateRoom(false)}
          />
          <div style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: darkMode ? "#1f2937" : "#ffffff",
            padding: "24px",
            borderRadius: "12px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            zIndex: 1002,
            width: "90%",
            maxWidth: "400px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>
              Create New Room
            </h3>
            
            <input
              type="text"
              placeholder="Room name (e.g., my-room)"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
              style={{
                width: "100%",
                padding: "8px 12px",
                marginBottom: "12px",
                borderRadius: 6,
                border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                backgroundColor: darkMode ? "#111827" : "#ffffff",
                color: darkMode ? "#e5e7eb" : "#111827",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            
            <textarea
              placeholder="Room description (optional)"
              value={newRoomDescription}
              onChange={(e) => setNewRoomDescription(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                marginBottom: "12px",
                borderRadius: 6,
                border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                backgroundColor: darkMode ? "#111827" : "#ffffff",
                color: darkMode ? "#e5e7eb" : "#111827",
                outline: "none",
                resize: "vertical",
                minHeight: "60px",
                boxSizing: "border-box",
              }}
            />
            
            <div style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "12px",
              fontSize: "14px",
            }}>
              <input
                type="checkbox"
                id="privateRoom"
                checked={newRoomIsPrivate}
                onChange={(e) => setNewRoomIsPrivate(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <label htmlFor="privateRoom" style={{ cursor: "pointer" }}>
                Private room (requires password)
              </label>
            </div>
            
            {newRoomIsPrivate && (
              <input
                type="password"
                placeholder="Room password"
                value={newRoomPassword}
                onChange={(e) => setNewRoomPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  marginBottom: "12px",
                  borderRadius: 6,
                  border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                  backgroundColor: darkMode ? "#111827" : "#ffffff",
                  color: darkMode ? "#e5e7eb" : "#111827",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
            
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowCreateRoom(false);
                  setNewRoomName('');
                  setNewRoomDescription('');
                  setNewRoomPassword('');
                  setNewRoomIsPrivate(false);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                  backgroundColor: "transparent",
                  color: darkMode ? "#e5e7eb" : "#111827",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newRoomName.trim()) {
                    alert('Room name is required');
                    return;
                  }
                  
                  if (newRoomIsPrivate && !newRoomPassword.trim()) {
                    alert('Password is required for private rooms');
                    return;
                  }
                  
                  try {
                    const newRoom = await createRoomHandler({
                      name: newRoomName.trim(),
                      description: newRoomDescription.trim(),
                      password: newRoomPassword,
                      isPrivate: newRoomIsPrivate
                    });
                    
                    setCurrentRoom(newRoom.name);
                    setMessages([]);
                    setRoomJoinTime(null);
                    setShowCreateRoom(false);
                    setNewRoomName('');
                    setNewRoomDescription('');
                    setNewRoomPassword('');
                    setNewRoomIsPrivate(false);
                  } catch (err) {
                    console.error('Room creation error:', err);
                    alert(err.message || 'Failed to create room');
                  }
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Create Room
              </button>
            </div>
          </div>
        </>
      )}
      
      {/* Profile Modal */}
      {showProfile && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 1001,
            }}
            onClick={() => setShowProfile(false)}
          />
          <div style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: darkMode ? "#1f2937" : "#ffffff",
            padding: "24px",
            borderRadius: "12px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            zIndex: 1002,
            width: "90%",
            maxWidth: "400px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>
              Profile Settings
            </h3>
            
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                backgroundColor: userProfile.avatar ? "transparent" : getAvatar(username).color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: "bold",
                color: "white",
                margin: "0 auto 12px",
                backgroundImage: userProfile.avatar ? `url(${userProfile.avatar})` : "none",
                backgroundSize: "cover",
                backgroundPosition: "center",
                border: `3px solid ${darkMode ? "#374151" : "#e5e7eb"}`,
              }}>
                {!userProfile.avatar && getAvatar(username).initial}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      setUserProfile(prev => ({ ...prev, avatar: e.target.result }));
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                style={{ display: "none" }}
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: darkMode ? "#374151" : "#e5e7eb",
                  color: darkMode ? "#fff" : "#111827",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "inline-block",
                }}
              >
                Change Avatar
              </label>
            </div>
            
            <input
              type="text"
              placeholder="Custom status message"
              value={userProfile.customStatus}
              onChange={(e) => setUserProfile(prev => ({ ...prev, customStatus: e.target.value }))}
              style={{
                width: "100%",
                padding: "8px 12px",
                marginBottom: "12px",
                borderRadius: 6,
                border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                backgroundColor: darkMode ? "#111827" : "#ffffff",
                color: darkMode ? "#e5e7eb" : "#111827",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            
            <textarea
              placeholder="Bio (optional)"
              value={userProfile.bio}
              onChange={(e) => setUserProfile(prev => ({ ...prev, bio: e.target.value }))}
              style={{
                width: "100%",
                padding: "8px 12px",
                marginBottom: "16px",
                borderRadius: 6,
                border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                backgroundColor: darkMode ? "#111827" : "#ffffff",
                color: darkMode ? "#e5e7eb" : "#111827",
                outline: "none",
                resize: "vertical",
                minHeight: "60px",
                boxSizing: "border-box",
              }}
            />
            
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowProfile(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
                  backgroundColor: "transparent",
                  color: darkMode ? "#e5e7eb" : "#111827",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Save profile to localStorage
                  localStorage.setItem(`chatbox-profile-${username}`, JSON.stringify(userProfile));
                  setShowProfile(false);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Save Profile
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
