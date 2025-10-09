import React, { useState, useEffect } from "react";
import { apiRequest } from "../../api";

export default function AuthForm({ setUsername }) {
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Detect system dark mode preference
  useEffect(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
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
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: darkMode ? "#0f1720" : "#f3f4f6",
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    padding: "20px",
  };

  const cardStyle = {
    backgroundColor: darkMode ? "#1f2937" : "#ffffff",
    padding: "40px",
    borderRadius: "16px",
    boxShadow: darkMode ? "0 20px 25px -5px rgba(0, 0, 0, 0.3)" : "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    width: "100%",
    maxWidth: "400px",
    border: darkMode ? "1px solid #374151" : "1px solid #e5e7eb",
  };

  const titleStyle = {
    fontSize: "28px",
    fontWeight: "700",
    color: darkMode ? "#f9fafb" : "#111827",
    marginBottom: "8px",
    textAlign: "center",
  };

  const subtitleStyle = {
    fontSize: "14px",
    color: darkMode ? "#9ca3af" : "#6b7280",
    textAlign: "center",
    marginBottom: "32px",
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "8px",
    border: `1px solid ${darkMode ? "#374151" : "#d1d5db"}`,
    backgroundColor: darkMode ? "#111827" : "#ffffff",
    color: darkMode ? "#f9fafb" : "#111827",
    fontSize: "16px",
    marginBottom: "16px",
    outline: "none",
    transition: "border-color 0.2s",
  };

  const buttonStyle = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
    marginBottom: "16px",
    transition: "all 0.2s",
  };

  const switchButtonStyle = {
    background: "none",
    border: "none",
    color: darkMode ? "#0ea5a4" : "#2563eb",
    fontSize: "14px",
    cursor: "pointer",
    textDecoration: "underline",
    padding: "8px",
  };

  const errorStyle = {
    backgroundColor: darkMode ? "#7f1d1d" : "#fef2f2",
    color: darkMode ? "#fca5a5" : "#dc2626",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "14px",
    border: `1px solid ${darkMode ? "#991b1b" : "#fecaca"}`,
  };

  const toggleStyle = {
    position: "absolute",
    top: "20px",
    right: "20px",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: darkMode ? "#374151" : "#e5e7eb",
    color: darkMode ? "#f9fafb" : "#111827",
    cursor: "pointer",
    fontSize: "12px",
  };

  return (
    <div style={containerStyle}>
      <button
        onClick={() => setDarkMode(!darkMode)}
        style={toggleStyle}
      >
        {darkMode ? "☀️" : "🌙"}
      </button>
      
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            backgroundColor: darkMode ? "#0ea5a4" : "#2563eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: "24px",
          }}>
            💬
          </div>
          <h1 style={titleStyle}>ChatBox</h1>
          <p style={subtitleStyle}>
            {isLogin ? "Welcome back! Sign in to your account" : "Create your account to get started"}
          </p>
        </div>

        {error && <div style={errorStyle}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            required
            style={inputStyle}
            onFocus={(e) => e.target.style.borderColor = darkMode ? "#0ea5a4" : "#2563eb"}
            onBlur={(e) => e.target.style.borderColor = darkMode ? "#374151" : "#d1d5db"}
          />
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                ...inputStyle,
                paddingRight: "48px",
              }}
              onFocus={(e) => e.target.style.borderColor = darkMode ? "#0ea5a4" : "#2563eb"}
              onBlur={(e) => e.target.style.borderColor = darkMode ? "#374151" : "#d1d5db"}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                color: darkMode ? "#9ca3af" : "#6b7280",
                padding: "4px",
              }}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button 
            type="submit" 
            style={buttonStyle}
            disabled={loading}
            onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = darkMode ? "#0d9488" : "#1d4ed8")}
            onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = darkMode ? "#0ea5a4" : "#2563eb")}
          >
            {loading ? "Please wait..." : (isLogin ? "Sign In" : "Create Account")}
          </button>
        </form>
        
        <div style={{ textAlign: "center" }}>
          <span style={{ color: darkMode ? "#9ca3af" : "#6b7280", fontSize: "14px" }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}
          </span>
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            style={switchButtonStyle}
            onMouseEnter={(e) => e.target.style.opacity = "0.8"}
            onMouseLeave={(e) => e.target.style.opacity = "1"}
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
