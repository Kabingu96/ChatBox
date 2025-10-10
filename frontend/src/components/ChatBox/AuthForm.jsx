import React, { useState, useEffect, useRef } from "react";
import { apiRequest } from "../../api";

export default function AuthForm({ setUsername }) {
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);

  // Handle Enter key navigation
  const handleKeyDown = (e, field) => {
    if (e.key === 'Enter') {
      if (field === 'username' && passwordRef.current) {
        e.preventDefault();
        passwordRef.current.focus();
      }
      // If in password field, Enter will submit form (default behavior)
    }
  };

  // Auto-focus username input on mount
  useEffect(() => {
    if (usernameRef.current) {
      usernameRef.current.focus();
    }
  }, []);

  // Detect system dark mode preference
  useEffect(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(isDark);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // Prevent double submission
    setLoading(true);
    setError("");
    const endpoint = isLogin ? "/login" : "/register";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const res = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ username: usernameInput, password }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setUsername(usernameInput); // successful login/register
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timeout. Please try again.');
      } else {
        setError(err.message || "Error");
      }
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: darkMode 
      ? "linear-gradient(135deg, #0c0c0c 0%, #1a0033 25%, #000066 50%, #330066 75%, #0c0c0c 100%)"
      : "linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%)",
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    padding: "20px",
    position: "relative",
    overflow: "hidden",
  };

  const cardStyle = {
    backgroundColor: darkMode ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.9)",
    padding: "40px",
    borderRadius: "20px",
    boxShadow: darkMode 
      ? "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.1)"
      : "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.2)",
    width: "100%",
    maxWidth: "400px",
    border: darkMode ? "1px solid rgba(99, 102, 241, 0.2)" : "1px solid rgba(255, 255, 255, 0.3)",
    backdropFilter: "blur(20px)",
    position: "relative",
    zIndex: 10,
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
    boxSizing: "border-box",
  };

  const buttonStyle = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "none",
    background: darkMode 
      ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)"
      : "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
    marginBottom: "16px",
    transition: "all 0.3s ease",
    boxShadow: darkMode 
      ? "0 8px 32px rgba(99, 102, 241, 0.3)"
      : "0 8px 32px rgba(102, 126, 234, 0.3)",
  };

  const switchButtonStyle = {
    background: "none",
    border: "none",
    color: darkMode ? "#8b5cf6" : "#667eea",
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

  // Add CSS animations
  const animationStyles = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-20px) rotate(180deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.1); }
    }
    @keyframes drift {
      0% { transform: translateX(-100px) translateY(-100px) rotate(0deg); }
      100% { transform: translateX(calc(100vw + 100px)) translateY(calc(100vh + 100px)) rotate(360deg); }
    }
  `;

  return (
    <div style={containerStyle}>
      <style>{animationStyles}</style>
      
      {/* Animated Background Elements */}
      <div style={{
        position: "absolute",
        top: "10%",
        left: "10%",
        width: "100px",
        height: "100px",
        background: darkMode 
          ? "linear-gradient(45deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))"
          : "linear-gradient(45deg, rgba(102, 126, 234, 0.1), rgba(240, 147, 251, 0.1))",
        borderRadius: "50%",
        animation: "float 6s ease-in-out infinite",
        zIndex: 1,
      }} />
      
      <div style={{
        position: "absolute",
        top: "60%",
        right: "15%",
        width: "80px",
        height: "80px",
        background: darkMode 
          ? "linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(139, 92, 246, 0.15))"
          : "linear-gradient(135deg, rgba(245, 87, 108, 0.15), rgba(102, 126, 234, 0.15))",
        borderRadius: "20px",
        animation: "pulse 4s ease-in-out infinite",
        zIndex: 1,
      }} />
      
      <div style={{
        position: "absolute",
        top: "20%",
        right: "5%",
        width: "60px",
        height: "60px",
        border: darkMode 
          ? "2px solid rgba(99, 102, 241, 0.2)"
          : "2px solid rgba(240, 147, 251, 0.2)",
        borderRadius: "50%",
        animation: "drift 20s linear infinite",
        zIndex: 1,
      }} />
      
      <div style={{
        position: "absolute",
        bottom: "10%",
        left: "5%",
        width: "120px",
        height: "120px",
        background: darkMode 
          ? "conic-gradient(from 0deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.1))"
          : "conic-gradient(from 0deg, rgba(102, 126, 234, 0.1), rgba(240, 147, 251, 0.1), rgba(245, 87, 108, 0.1))",
        borderRadius: "30px",
        animation: "float 8s ease-in-out infinite reverse",
        zIndex: 1,
      }} />
      
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
            background: darkMode 
              ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)"
              : "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
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
            ref={usernameRef}
            type="text"
            placeholder="Username"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            required
            style={{
              ...inputStyle,
              opacity: loading ? 0.6 : 1,
            }}
            disabled={loading}
            onFocus={(e) => e.target.style.borderColor = darkMode ? "#0ea5a4" : "#2563eb"}
            onBlur={(e) => e.target.style.borderColor = darkMode ? "#374151" : "#d1d5db"}
            onKeyDown={(e) => handleKeyDown(e, 'username')}
          />
          <div style={{ position: "relative" }}>
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                ...inputStyle,
                paddingRight: "48px",
                boxSizing: "border-box",
                opacity: loading ? 0.6 : 1,
              }}
              disabled={loading}
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
          {isLogin && (
            <div style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "16px",
              fontSize: "14px",
              color: darkMode ? "#9ca3af" : "#6b7280",
            }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  marginRight: "8px",
                  accentColor: darkMode ? "#0ea5a4" : "#2563eb",
                }}
                disabled={loading}
              />
              <label htmlFor="rememberMe" style={{ cursor: "pointer" }}>
                Remember me
              </label>
            </div>
          )}
          <button 
            type="submit" 
            style={buttonStyle}
            disabled={loading}
            onMouseEnter={(e) => !loading && (e.target.style.transform = "translateY(-2px)")}
            onMouseLeave={(e) => !loading && (e.target.style.transform = "translateY(0px)")}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{
                  display: "inline-block",
                  width: "16px",
                  height: "16px",
                  border: "2px solid transparent",
                  borderTop: "2px solid #ffffff",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  marginRight: "8px",
                }} />
                Please wait...
              </span>
            ) : (isLogin ? "Sign In" : "Create Account")}
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