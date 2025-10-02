let socket;

export const connect = () => {
  socket = new WebSocket("ws://localhost:8080/ws");

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

export const sendMsg = (msg) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(msg);
  }
};
