package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "strconv"
    "sync"
    "time"

    "github.com/gorilla/websocket"
    "golang.org/x/crypto/bcrypt"
)

// -------------------- CORS --------------------

func enableCors(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Allow any origin so the app can be opened from multiple devices/networks
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusOK)
            return
        }
        next.ServeHTTP(w, r)
    })
}

// -------------------- In-Memory Store --------------------

type storedUser struct {
    Username     string
    PasswordHash []byte
    DarkMode     bool
}

var (
    usersMu  sync.RWMutex
    usersMap = map[string]*storedUser{}

    messagesMu   sync.RWMutex
    messagesList = []Message{}
    nextMessageID int64 = 1
)

// -------------------- WebSocket / Hub --------------------

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

type Client struct {
    conn     *websocket.Conn
    send     chan []byte
    hub      *Hub
    username string
}

type Hub struct {
    clients    map[*Client]bool
    register   chan *Client
    unregister chan *Client
    broadcast  chan Broadcast
}

type Broadcast struct {
    sender  *Client
    message []byte
}

type Message struct {
    ID        int64  `json:"id"`
    Username  string `json:"username"`
    Text      string `json:"text"`
    Timestamp string `json:"timestamp"`
}

func newHub() *Hub {
    return &Hub{
        clients:    make(map[*Client]bool),
        register:   make(chan *Client),
        unregister: make(chan *Client),
        broadcast:  make(chan Broadcast),
    }
}

func (h *Hub) run() {
    for {
        select {
        case client := <-h.register:
            h.clients[client] = true
            log.Println("✅ Client connected:", client.username)
        case client := <-h.unregister:
            if _, ok := h.clients[client]; ok {
                delete(h.clients, client)
                close(client.send)
                log.Println("❌ Client disconnected:", client.username)
            }
        case b := <-h.broadcast:
            for client := range h.clients {
                if client == b.sender {
                    continue
                }
                select {
                case client.send <- b.message:
                default:
                    close(client.send)
                    delete(h.clients, client)
                }
            }
        }
    }
}

// -------------------- Message Store Helpers --------------------

func saveMessage(m Message) int64 {
    messagesMu.Lock()
    defer messagesMu.Unlock()
    m.ID = nextMessageID
    nextMessageID++
    messagesList = append(messagesList, m)
    return m.ID
}

func loadRecentMessages(limit int) []Message {
    messagesMu.RLock()
    defer messagesMu.RUnlock()
    if limit <= 0 || limit > len(messagesList) {
        limit = len(messagesList)
    }
    start := len(messagesList) - limit
    if start < 0 {
        start = 0
    }
    // return a copy to avoid external mutation
    out := make([]Message, limit)
    copy(out, messagesList[start:])
    return out
}

func editMessageText(id int64, text string) bool {
    messagesMu.Lock()
    defer messagesMu.Unlock()
    for i := range messagesList {
        if messagesList[i].ID == id {
            messagesList[i].Text = text
            return true
        }
    }
    return false
}

func deleteMessageByID(id int64) bool {
    messagesMu.Lock()
    defer messagesMu.Unlock()
    for i := range messagesList {
        if messagesList[i].ID == id {
            messagesList = append(messagesList[:i], messagesList[i+1:]...)
            return true
        }
    }
    return false
}

// -------------------- WebSocket Handlers --------------------

// Helper: get timestamp in optional timezone
func getTimestamp(tz string) string {
    loc, err := time.LoadLocation(tz)
    if err != nil || tz == "" {
        loc, _ = time.LoadLocation("Local")
    }
    return time.Now().In(loc).Format("2006-01-02 15:04:05 MST")
}

func (c *Client) readPump() {
    defer func() {
        c.hub.unregister <- c
        c.conn.Close()
    }()
    for {
        _, raw, err := c.conn.ReadMessage()
        if err != nil {
            log.Println("read error:", err)
            break
        }

        var inc struct {
            Text      string `json:"text"`
            Timezone  string `json:"timezone,omitempty"`
            ClientID  int64  `json:"clientId,omitempty"`
        }
        if err := json.Unmarshal(raw, &inc); err != nil {
            log.Println("unmarshal error:", err)
            continue
        }
        if inc.Text == "" {
            continue
        }

        ts := getTimestamp(inc.Timezone)
        out := Message{
            Username:  c.username,
            Text:      inc.Text,
            Timestamp: ts,
        }

        id := saveMessage(out)
        out.ID = id

        // send ack back to sender with mapping clientId -> id
        if inc.ClientID > 0 {
            ack := struct {
                Type     string `json:"type"`
                ClientID int64  `json:"clientId"`
                ID       int64  `json:"id"`
            }{Type: "ack", ClientID: inc.ClientID, ID: id}
            if b, err := json.Marshal(ack); err == nil {
                _ = c.conn.WriteMessage(websocket.TextMessage, b)
            }
        }

        outBytes, _ := json.Marshal(out)
        c.hub.broadcast <- Broadcast{sender: c, message: outBytes}
    }
}

func (c *Client) writePump() {
    defer c.conn.Close()
    for msg := range c.send {
        if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
            log.Println("write error:", err)
            break
        }
    }
}

func serveWs(h *Hub, username string, w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("upgrade error:", err)
        return
    }
    client := &Client{
        conn:     conn,
        send:     make(chan []byte, 256),
        hub:      h,
        username: username,
    }
    h.register <- client

    history := loadRecentMessages(200)
    if len(history) > 0 {
        payload := struct {
            Type     string    `json:"type"`
            Messages []Message `json:"messages"`
        }{Type: "history", Messages: history}
        if b, err := json.Marshal(payload); err == nil {
            conn.WriteMessage(websocket.TextMessage, b)
        }
    }

    go client.readPump()
    go client.writePump()
}

// -------------------- Authentication --------------------

type User struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    var u User
    if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    if u.Username == "" || u.Password == "" {
        http.Error(w, "Username and password required", http.StatusBadRequest)
        return
    }

    usersMu.Lock()
    defer usersMu.Unlock()
    if _, exists := usersMap[u.Username]; exists {
        http.Error(w, "Username may already exist", http.StatusBadRequest)
        return
    }
    hash, _ := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
    usersMap[u.Username] = &storedUser{Username: u.Username, PasswordHash: hash}
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Registration successful"))
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    var u User
    if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    usersMu.RLock()
    su, ok := usersMap[u.Username]
    usersMu.RUnlock()
    if !ok {
        http.Error(w, "Invalid credentials", http.StatusUnauthorized)
        return
    }
    if err := bcrypt.CompareHashAndPassword(su.PasswordHash, []byte(u.Password)); err != nil {
        http.Error(w, "Invalid credentials", http.StatusUnauthorized)
        return
    }
    resp := map[string]string{"username": u.Username}
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resp)
}

// -------------------- Dark Mode --------------------

func getDarkModeHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    username := r.URL.Query().Get("username")
    if username == "" {
        http.Error(w, "Username required", http.StatusBadRequest)
        return
    }
    usersMu.RLock()
    su, ok := usersMap[username]
    usersMu.RUnlock()
    if !ok {
        http.Error(w, "User not found", http.StatusNotFound)
        return
    }
    resp := map[string]bool{"darkMode": su.DarkMode}
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resp)
}

func setDarkModeHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    var payload struct {
        Username string `json:"username"`
        DarkMode bool   `json:"darkMode"`
    }
    if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    usersMu.Lock()
    su, ok := usersMap[payload.Username]
    if ok {
        su.DarkMode = payload.DarkMode
    }
    usersMu.Unlock()
    if !ok {
        http.Error(w, "User not found", http.StatusNotFound)
        return
    }
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Dark mode updated"))
}

// -------------------- Message Editing / Deletion --------------------

func editMessageHandler(hub *Hub, w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPut {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    var payload struct {
        ID   int64  `json:"id"`
        Text string `json:"text"`
    }
    if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    if payload.ID <= 0 || payload.Text == "" {
        http.Error(w, "Invalid payload", http.StatusBadRequest)
        return
    }
    if !editMessageText(payload.ID, payload.Text) {
        http.Error(w, "Message not found", http.StatusNotFound)
        return
    }
    // broadcast edit to all clients
    broadcastPayload := struct {
        Type string `json:"type"`
        ID   int64  `json:"id"`
        Text string `json:"text"`
    }{Type: "edit", ID: payload.ID, Text: payload.Text}
    b, _ := json.Marshal(broadcastPayload)
    hub.broadcast <- Broadcast{sender: nil, message: b}
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Message edited"))
}

func deleteMessageHandler(hub *Hub, w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodDelete {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    idStr := r.URL.Query().Get("id")
    if idStr == "" {
        http.Error(w, "Message ID required", http.StatusBadRequest)
        return
    }
    id, err := strconv.ParseInt(idStr, 10, 64)
    if err != nil {
        http.Error(w, "Invalid message ID", http.StatusBadRequest)
        return
    }
    if !deleteMessageByID(id) {
        http.Error(w, "Message not found", http.StatusNotFound)
        return
    }
    // broadcast deletion to all clients
    broadcastPayload := struct {
        Type string `json:"type"`
        ID   int64  `json:"id"`
    }{Type: "delete", ID: id}
    b, _ := json.Marshal(broadcastPayload)
    hub.broadcast <- Broadcast{sender: nil, message: b}
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Message deleted"))
}

// -------------------- Main --------------------

func main() {
    hub := newHub()
    go hub.run()

    // Auth endpoints with CORS
    http.Handle("/register", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        registerHandler(w, r)
    })))
    http.Handle("/login", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        loginHandler(w, r)
    })))

    // Dark mode endpoints with CORS
    http.Handle("/get_dark_mode", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        getDarkModeHandler(w, r)
    })))
    http.Handle("/set_dark_mode", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        setDarkModeHandler(w, r)
    })))

    // Message edit/delete endpoints
    http.Handle("/message", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
        case http.MethodPut:
            editMessageHandler(hub, w, r)
        case http.MethodDelete:
            deleteMessageHandler(hub, w, r)
        default:
            http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        }
    })))

    // WebSocket endpoint expects ?username=XYZ from frontend after login
    http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
        username := r.URL.Query().Get("username")
        if username == "" {
            http.Error(w, "Username required", http.StatusBadRequest)
            return
        }
        serveWs(hub, username, w, r)
    })

    fmt.Println("🚀 Server started on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
