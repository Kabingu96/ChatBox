import React, { useState } from "react";
import { sendMsg } from "./api"; // Corrected path to api/index.js

const ChatBox = () => {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim() !== "") {
      sendMsg(message);
      setMessage("");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message..."
        style={{ padding: "10px", width: "300px" }}
      />
      <button onClick={handleSend} style={{ marginLeft: "10px", padding: "10px" }}>
        Send
      </button>
    </div>
  );
};

export default ChatBox;
