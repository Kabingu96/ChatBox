let socket;

const getApiBase = () => {
  return process.env.REACT_APP_API_BASE || 'http://localhost:8080';
};

const getWsBase = () => {
  const wsBase = process.env.REACT_APP_WS_BASE;
  if (wsBase) return wsBase;
  
  const apiBase = getApiBase();
  return apiBase.replace(/^http/, 'ws');
};

export const connect = (username) => {
  const wsUrl = `${getWsBase()}/ws?username=${encodeURIComponent(username)}`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log("WebSocket connected");
  };

  socket.onmessage = (event) => {
    const wsEvent = new CustomEvent("ws-message", { detail: event.data });
    window.dispatchEvent(wsEvent);
  };

  socket.onclose = () => {
    console.log("WebSocket closed");
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
};



export const apiRequest = async (endpoint, options = {}) => {
  const url = `${getApiBase()}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...options.headers
    },
    credentials: 'include',
    ...options
  };
  
  const response = await fetch(url, config);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response;
};
