import React, { useState } from "react";
import AuthForm from "./AuthForm";
import ChatBoxContent from "./ChatBoxContent";

export default function ChatBox() {
  const [username, setUsername] = useState("");

  // if username is empty, show login/register
  if (!username) return <AuthForm setUsername={setUsername} />;

  // once username is set, show chat
  return <ChatBoxContent username={username} />;
}
