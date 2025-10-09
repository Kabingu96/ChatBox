import React, { useState } from "react";
import { apiRequest } from "../../api";

export default function AuthForm({ setUsername }) {
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? "/login" : "/register";
    try {
      const res = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ username: usernameInput, password }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setUsername(usernameInput); // successful login/register
    } catch (err) {
      setError(err.message || "Error");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "100px auto", textAlign: "center" }}>
      <h2>{isLogin ? "Login" : "Register"}</h2>
      {error && <div style={{ color: "red", marginBottom: 10 }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />
        <button type="submit" style={{ padding: 10, width: "100%", marginBottom: 10 }}>
          {isLogin ? "Login" : "Register"}
        </button>
      </form>
      <button onClick={() => setIsLogin(!isLogin)} style={{ padding: 6 }}>
        {isLogin ? "Switch to Register" : "Switch to Login"}
      </button>
    </div>
  );
}
