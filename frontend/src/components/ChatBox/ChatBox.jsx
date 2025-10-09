import React, { useState, useEffect } from "react";
import AuthForm from "./AuthForm";
import ChatBoxContent from "./ChatBoxContent";

export default function ChatBox() {
  const [username, setUsername] = useState("");

  // Load username from localStorage on component mount
  useEffect(() => {
    const savedUsername = localStorage.getItem("chatbox-username");
    if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);

  // Save username to localStorage when it changes
  const handleSetUsername = (newUsername) => {
    setUsername(newUsername);
    localStorage.setItem("chatbox-username", newUsername);
  };

  // Logout function
  const handleLogout = () => {
    setUsername("");
    localStorage.removeItem("chatbox-username");
  };

  // if username is empty, show login/register
  if (!username) return <AuthForm setUsername={handleSetUsername} />;

  // once username is set, show chat
  return <ChatBoxContent username={username} onLogout={handleLogout} />;
}
