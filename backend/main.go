package main

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "log"
    "net/http"
    "os"
    "path/filepath"
    "sort"
    "strconv"
    "strings"
    "sync"
    "time"

    "github.com/gorilla/websocket"
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
    "golang.org/x/crypto/bcrypt"
)

// -------------------- CORS --------------------

func enableCors(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        origin := r.Header.Get("Origin")
        allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
        if allowedOrigins == "" {
            allowedOrigins = "http://localhost:3000,https://localhost:3000"
        }
        
        // Check if origin is allowed
        if origin != "" {
            if allowedOrigins == "*" {
                w.Header().Set("Access-Control-Allow-Origin", "*")
            } else {
                for _, allowed := range strings.Split(allowedOrigins, ",") {
                    if strings.TrimSpace(allowed) == origin {
                        w.Header().Set("Access-Control-Allow-Origin", origin)
                        break
                    }
                }
            }
        }
        
        w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        w.Header().Set("Access-Control-Allow-Credentials", "true")
        
        // Security headers
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("X-XSS-Protection", "1; mode=block")
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        
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

// DB integration (optional): enabled when DATABASE_URL is set
var dbPool *pgxpool.Pool
var useDB bool

// In-memory room storage for development
var inMemoryRooms []Room
var inMemoryRoomPasswords = make(map[string][]byte)

func init() {
    // Initialize default rooms
    inMemoryRooms = []Room{
        {ID: 1, Name: "general", Description: "General discussion", Creator: "system", IsPrivate: false, CreatedAt: "2024-01-01 00:00:00"},
        {ID: 2, Name: "random", Description: "Random topics", Creator: "system", IsPrivate: false, CreatedAt: "2024-01-01 00:00:00"},
        {ID: 3, Name: "tech", Description: "Technology discussions", Creator: "system", IsPrivate: false, CreatedAt: "2024-01-01 00:00:00"},
        {ID: 4, Name: "gaming", Description: "Gaming discussions", Creator: "system", IsPrivate: false, CreatedAt: "2024-01-01 00:00:00"},
    }
}

// -------------------- WebSocket / Hub --------------------

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

type Client struct {
    conn     *websocket.Conn
    send     chan []byte
    hub      *Hub
    username string
    room     string
}

type Hub struct {
    clients    map[*Client]bool
    rooms      map[string]map[*Client]bool
    register   chan *Client
    unregister chan *Client
    broadcast  chan Broadcast
}

type Broadcast struct {
    sender  *Client
    message []byte
}

type Message struct {
    ID        int64              `json:"id"`
    Username  string             `json:"username"`
    Text      string             `json:"text"`
    Timestamp string             `json:"timestamp"`
    Reactions map[string][]string `json:"reactions,omitempty"`
    FileURL   string             `json:"fileUrl,omitempty"`
    FileType  string             `json:"fileType,omitempty"`
    FileName  string             `json:"fileName,omitempty"`
    Room      string             `json:"room,omitempty"`
}

func newHub() *Hub {
    return &Hub{
        clients:    make(map[*Client]bool),
        rooms:      make(map[string]map[*Client]bool),
        register:   make(chan *Client),
        unregister: make(chan *Client),
        broadcast:  make(chan Broadcast),
    }
}

func (h *Hub) broadcastUserList() {
    // Broadcast user list per room
    for room, roomClients := range h.rooms {
        users := make([]string, 0, len(roomClients))
        for client := range roomClients {
            users = append(users, client.username)
        }
        
        payload := struct {
            Type  string   `json:"type"`
            Users []string `json:"users"`
            Room  string   `json:"room"`
        }{Type: "users", Users: users, Room: room}
        
        if b, err := json.Marshal(payload); err == nil {
            for client := range roomClients {
                select {
                case client.send <- b:
                default:
                    close(client.send)
                    delete(h.clients, client)
                    delete(roomClients, client)
                }
            }
        }
    }
}

func (h *Hub) run() {
    for {
        select {
        case client := <-h.register:
            h.clients[client] = true
            
            // Add to room
            if h.rooms[client.room] == nil {
                h.rooms[client.room] = make(map[*Client]bool)
            }
            h.rooms[client.room][client] = true
            
            log.Println("✅ Client connected:", client.username, "in room:", client.room)
            h.broadcastUserList()
        case client := <-h.unregister:
            if _, ok := h.clients[client]; ok {
                delete(h.clients, client)
                
                // Remove from room
                if roomClients, exists := h.rooms[client.room]; exists {
                    delete(roomClients, client)
                    if len(roomClients) == 0 {
                        delete(h.rooms, client.room)
                    }
                }
                
                close(client.send)
                log.Println("❌ Client disconnected:", client.username, "from room:", client.room)
                h.broadcastUserList()
            }
        case b := <-h.broadcast:
            // Broadcast only to clients in the same room
            if b.sender != nil {
                if roomClients, exists := h.rooms[b.sender.room]; exists {
                    for client := range roomClients {
                        if client == b.sender {
                            continue
                        }
                        select {
                        case client.send <- b.message:
                        default:
                            close(client.send)
                            delete(h.clients, client)
                            delete(roomClients, client)
                        }
                    }
                }
            } else {
                // Global broadcast (for system messages)
                for client := range h.clients {
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
}

// -------------------- Message Store Helpers --------------------

func saveMessage(m Message) int64 {
    if useDB {
        id, err := dbSaveMessage(context.Background(), m)
        if err != nil {
            log.Println("db save error:", err)
        }
        return id
    }
    messagesMu.Lock()
    defer messagesMu.Unlock()
    m.ID = nextMessageID
    nextMessageID++
    messagesList = append(messagesList, m)
    return m.ID
}

func loadRecentMessages(limit int, room string) []Message {
    if useDB {
        msgs, err := dbLoadRecentMessages(context.Background(), limit)
        if err != nil {
            log.Println("db load history error:", err)
            return nil
        }
        return msgs
    }
    messagesMu.RLock()
    defer messagesMu.RUnlock()
    
    // Filter messages by room
    roomMessages := make([]Message, 0)
    for _, msg := range messagesList {
        if msg.Room == room {
            roomMessages = append(roomMessages, msg)
        }
    }
    
    if limit <= 0 || limit > len(roomMessages) {
        limit = len(roomMessages)
    }
    start := len(roomMessages) - limit
    if start < 0 {
        start = 0
    }
    
    out := make([]Message, limit)
    copy(out, roomMessages[start:])
    return out
}

func editMessageText(id int64, text string) bool {
    if useDB {
        if err := dbEditMessageText(context.Background(), id, text); err != nil {
            log.Println("db edit error:", err)
            return false
        }
        return true
    }
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
    if useDB {
        if err := dbDeleteMessageByID(context.Background(), id); err != nil {
            log.Println("db delete error:", err)
            return false
        }
        return true
    }
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

func toggleReaction(messageID int64, emoji, username string) bool {
    messagesMu.Lock()
    defer messagesMu.Unlock()
    
    for i := range messagesList {
        if messagesList[i].ID == messageID {
            if messagesList[i].Reactions == nil {
                messagesList[i].Reactions = make(map[string][]string)
            }
            
            users := messagesList[i].Reactions[emoji]
            
            // Check if user already reacted with this emoji
            for j, user := range users {
                if user == username {
                    // Remove reaction
                    messagesList[i].Reactions[emoji] = append(users[:j], users[j+1:]...)
                    if len(messagesList[i].Reactions[emoji]) == 0 {
                        delete(messagesList[i].Reactions, emoji)
                    }
                    return true
                }
            }
            
            // Add reaction
            messagesList[i].Reactions[emoji] = append(users, username)
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
            if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
            log.Printf("websocket error: %v", err)
        }
            break
        }

        var inc struct {
            Type      string `json:"type,omitempty"`
            Text      string `json:"text"`
            Timezone  string `json:"timezone,omitempty"`
            ClientID  int64  `json:"clientId,omitempty"`
            Username  string `json:"username,omitempty"`
            IsTyping  bool   `json:"isTyping,omitempty"`
            MessageID int64  `json:"messageId,omitempty"`
            Emoji     string `json:"emoji,omitempty"`
            FileURL   string `json:"fileUrl,omitempty"`
            FileType  string `json:"fileType,omitempty"`
            FileName  string `json:"fileName,omitempty"`
        }
        if err := json.Unmarshal(raw, &inc); err != nil {
            log.Println("unmarshal error:", err)
            continue
        }
        // Handle typing indicator
        if inc.Type == "typing" {
            typingPayload := struct {
                Type     string `json:"type"`
                Username string `json:"username"`
                IsTyping bool   `json:"isTyping"`
            }{Type: "typing", Username: c.username, IsTyping: inc.IsTyping}
            
            if b, err := json.Marshal(typingPayload); err == nil {
                c.hub.broadcast <- Broadcast{sender: c, message: b}
            }
            continue
        }
        
        // Handle reaction
        if inc.Type == "reaction" && inc.MessageID > 0 && inc.Emoji != "" {
            if toggleReaction(inc.MessageID, inc.Emoji, c.username) {
                reactionPayload := struct {
                    Type      string `json:"type"`
                    MessageID int64  `json:"messageId"`
                    Emoji     string `json:"emoji"`
                    Username  string `json:"username"`
                }{Type: "reaction", MessageID: inc.MessageID, Emoji: inc.Emoji, Username: c.username}
                
                if b, err := json.Marshal(reactionPayload); err == nil {
                    c.hub.broadcast <- Broadcast{sender: nil, message: b}
                }
            }
            continue
        }
        
        if inc.Text == "" && inc.FileURL == "" {
            continue
        }

        ts := getTimestamp(inc.Timezone)
        out := Message{
            Username:  c.username,
            Text:      inc.Text,
            Timestamp: ts,
            Reactions: make(map[string][]string),
            FileURL:   inc.FileURL,
            FileType:  inc.FileType,
            FileName:  inc.FileName,
            Room:      c.room,
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

        // Stop typing indicator when message is sent
        typingPayload := struct {
            Type     string `json:"type"`
            Username string `json:"username"`
            IsTyping bool   `json:"isTyping"`
        }{Type: "typing", Username: c.username, IsTyping: false}
        
        if b, err := json.Marshal(typingPayload); err == nil {
            c.hub.broadcast <- Broadcast{sender: c, message: b}
        }
        
        outBytes, _ := json.Marshal(out)
        c.hub.broadcast <- Broadcast{sender: c, message: outBytes}
    }
}

func (c *Client) writePump() {
    defer c.conn.Close()
    for msg := range c.send {
        if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
            if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
            log.Printf("websocket write error: %v", err)
        }
            break
        }
    }
}

func serveWs(h *Hub, username, room string, w http.ResponseWriter, r *http.Request) {
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
        room:     room,
    }
    h.register <- client

    history := loadRecentMessages(200, room)
    if len(history) > 0 {
        payload := struct {
            Type     string    `json:"type"`
            Messages []Message `json:"messages"`
        }{Type: "history", Messages: history}
        if b, err := json.Marshal(payload); err == nil {
            conn.WriteMessage(websocket.TextMessage, b)
        }
    }
    
    // Send initial user list after registration
    go func() {
        time.Sleep(100 * time.Millisecond) // Small delay to ensure client is registered
        h.broadcastUserList()
    }()

    go client.readPump()
    go client.writePump()
}

// -------------------- Authentication --------------------

type User struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

type Room struct {
    ID          int64  `json:"id"`
    Name        string `json:"name"`
    Description string `json:"description"`
    Creator     string `json:"creator"`
    IsPrivate   bool   `json:"isPrivate"`
    CreatedAt   string `json:"createdAt"`
}

type CreateRoomRequest struct {
    Name        string `json:"name"`
    Description string `json:"description"`
    Password    string `json:"password,omitempty"`
    IsPrivate   bool   `json:"isPrivate"`
}

type JoinRoomRequest struct {
    RoomName string `json:"roomName"`
    Password string `json:"password,omitempty"`
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

    // create user
    hash, _ := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
    if useDB {
        if err := dbRegisterUser(context.Background(), u.Username, hash); err != nil {
            http.Error(w, "Username may already exist", http.StatusBadRequest)
            return
        }
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("Registration successful"))
        return
    }
    usersMu.Lock()
    defer usersMu.Unlock()
    if _, exists := usersMap[u.Username]; exists {
        http.Error(w, "Username may already exist", http.StatusBadRequest)
        return
    }
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
    if useDB {
        hash, err := dbGetUserPasswordHash(context.Background(), u.Username)
        if err != nil {
            http.Error(w, "Invalid credentials", http.StatusUnauthorized)
            return
        }
        if err := bcrypt.CompareHashAndPassword(hash, []byte(u.Password)); err != nil {
            http.Error(w, "Invalid credentials", http.StatusUnauthorized)
            return
        }
        resp := map[string]string{"username": u.Username}
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp)
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
    if useDB {
        dm, ok, err := dbGetDarkMode(context.Background(), username)
        if err != nil {
            http.Error(w, "Server error", http.StatusInternalServerError)
            return
        }
        if !ok {
            http.Error(w, "User not found", http.StatusNotFound)
            return
        }
        resp := map[string]bool{"darkMode": dm}
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp)
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
    if useDB {
        if err := dbSetDarkMode(context.Background(), payload.Username, payload.DarkMode); err != nil {
            if strings.Contains(err.Error(), "not found") {
                http.Error(w, "User not found", http.StatusNotFound)
                return
            }
            http.Error(w, "Server error", http.StatusInternalServerError)
            return
        }
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("Dark mode updated"))
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
    // Initialize DB if configured
    if err := initDB(context.Background()); err != nil {
        log.Println("DB init error:", err)
    }

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

    // Room management endpoints
    http.Handle("/rooms/list", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        listRoomsHandler(w, r)
    })))
    http.Handle("/rooms/create", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        createRoomHandler(w, r)
    })))
    http.Handle("/rooms/join", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        joinRoomHandler(w, r)
    })))

    // File upload endpoint
    http.Handle("/upload", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
            http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
            return
        }
        
        // Parse multipart form (10MB max)
        err := r.ParseMultipartForm(10 << 20)
        if err != nil {
            log.Printf("ParseMultipartForm error: %v", err)
            http.Error(w, "File too large or invalid", http.StatusBadRequest)
            return
        }
        
        file, header, err := r.FormFile("file")
        if err != nil {
            log.Printf("FormFile error: %v", err)
            http.Error(w, "No file provided", http.StatusBadRequest)
            return
        }
        defer file.Close()
        
        // Create uploads directory if it doesn't exist
        if err := os.MkdirAll("uploads", 0755); err != nil {
            log.Printf("MkdirAll error: %v", err)
            http.Error(w, "Server error", http.StatusInternalServerError)
            return
        }
        
        // Generate unique filename
        filename := fmt.Sprintf("%d_%s", time.Now().Unix(), header.Filename)
        filePath := filepath.Join("uploads", filename)
        
        // Save file
        dst, err := os.Create(filePath)
        if err != nil {
            log.Printf("Create file error: %v", err)
            http.Error(w, "Failed to create file", http.StatusInternalServerError)
            return
        }
        defer dst.Close()
        
        // Copy file content
        if _, err := file.Seek(0, 0); err != nil {
            log.Printf("File seek error: %v", err)
            http.Error(w, "File read error", http.StatusInternalServerError)
            return
        }
        
        written, err := dst.ReadFrom(file)
        if err != nil {
            log.Printf("File copy error: %v", err)
            http.Error(w, "Failed to save file", http.StatusInternalServerError)
            return
        }
        
        log.Printf("File uploaded successfully: %s (%d bytes)", filename, written)
        
        // Detect content type if not provided
        contentType := header.Header.Get("Content-Type")
        if contentType == "" {
            ext := strings.ToLower(filepath.Ext(header.Filename))
            switch ext {
            case ".jpg", ".jpeg":
                contentType = "image/jpeg"
            case ".png":
                contentType = "image/png"
            case ".gif":
                contentType = "image/gif"
            case ".pdf":
                contentType = "application/pdf"
            case ".txt":
                contentType = "text/plain"
            default:
                contentType = "application/octet-stream"
            }
        }
        
        // Return file URL
        fileURL := fmt.Sprintf("/files/%s", filename)
        response := map[string]string{
            "fileUrl": fileURL,
            "fileName": header.Filename,
            "fileType": contentType,
        }
        
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(response)
    })))
    
    // Serve uploaded files with proper headers
    http.Handle("/files/", enableCors(http.StripPrefix("/files/", http.FileServer(http.Dir("uploads/")))))

    // WebSocket endpoint expects ?username=XYZ&room=ABC from frontend after login
    http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
        username := r.URL.Query().Get("username")
        room := r.URL.Query().Get("room")
        if username == "" {
            http.Error(w, "Username required", http.StatusBadRequest)
            return
        }
        if room == "" {
            room = "general" // Default room
        }
        
        // Validate room exists (for private rooms, password check should be done via /rooms/join first)
        if _, err := dbGetRoom(context.Background(), room); err != nil {
            http.Error(w, "Room not found", http.StatusNotFound)
            return
        }
        
        serveWs(hub, username, room, w, r)
    })

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    fmt.Println("🚀 Server started on :" + port)
    log.Fatal(http.ListenAndServe(":"+port, nil))
}

// -------------------- DB Helpers --------------------

func initDB(ctx context.Context) error {
    dsn := os.Getenv("DATABASE_URL")
    if strings.TrimSpace(dsn) == "" {
        useDB = false
        return nil
    }
    cfg, err := pgxpool.ParseConfig(dsn)
    if err != nil {
        return err
    }
    pool, err := pgxpool.NewWithConfig(ctx, cfg)
    if err != nil {
        return err
    }
    // test
    if err := pool.Ping(ctx); err != nil {
        return err
    }
    dbPool = pool
    useDB = true
    if err := runMigrations(ctx, dbPool, "migrations"); err != nil {
        return err
    }
    return nil
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool, dir string) error {
    // find .sql files in dir and apply in name order
    entries, err := os.ReadDir(dir)
    if err != nil {
        // If no migrations directory, skip
        if os.IsNotExist(err) {
            return nil
        }
        return err
    }
    files := make([]string, 0, len(entries))
    for _, e := range entries {
        if e.IsDir() {
            continue
        }
        name := e.Name()
        if strings.HasSuffix(strings.ToLower(name), ".sql") {
            files = append(files, filepath.Join(dir, name))
        }
    }
    sort.Strings(files)
    for _, f := range files {
        b, err := os.ReadFile(f)
        if err != nil {
            return err
        }
        sql := string(b)
        sql = strings.TrimSpace(sql)
        if sql == "" {
            continue
        }
        if _, err := pool.Exec(ctx, sql); err != nil {
            return fmt.Errorf("migration %s failed: %w", f, err)
        }
        log.Println("Applied migration:", f)
    }
    return nil
}

func dbSaveMessage(ctx context.Context, m Message) (int64, error) {
    var id int64
    // store server-side timestamp as now(); we still broadcast client-formatted timestamp in message
    err := dbPool.QueryRow(ctx, `
        INSERT INTO messages (username, text) VALUES ($1, $2)
        RETURNING id
    `, m.Username, m.Text).Scan(&id)
    return id, err
}

func dbLoadRecentMessages(ctx context.Context, limit int) ([]Message, error) {
    if limit <= 0 {
        limit = 200
    }
    rows, err := dbPool.Query(ctx, `
        SELECT id, username, text, timestamp
        FROM messages
        ORDER BY timestamp DESC
        LIMIT $1
    `, limit)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    out := make([]Message, 0, limit)
    for rows.Next() {
        var (
            id int64
            username string
            text string
            ts time.Time
        )
        if err := rows.Scan(&id, &username, &text, &ts); err != nil {
            return nil, err
        }
        out = append(out, Message{
            ID: id,
            Username: username,
            Text: text,
            Timestamp: ts.Format("2006-01-02 15:04:05 MST"),
            Reactions: make(map[string][]string),
        })
    }
    // reverse to chronological ascending like in-memory version
    for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
        out[i], out[j] = out[j], out[i]
    }
    return out, rows.Err()
}

func dbEditMessageText(ctx context.Context, id int64, text string) error {
    ct, err := dbPool.Exec(ctx, `UPDATE messages SET text=$1 WHERE id=$2`, text, id)
    if err != nil {
        return err
    }
    if ct.RowsAffected() == 0 {
        return fmt.Errorf("not found")
    }
    return nil
}

func dbDeleteMessageByID(ctx context.Context, id int64) error {
    ct, err := dbPool.Exec(ctx, `DELETE FROM messages WHERE id=$1`, id)
    if err != nil {
        return err
    }
    if ct.RowsAffected() == 0 {
        return fmt.Errorf("not found")
    }
    return nil
}

func dbRegisterUser(ctx context.Context, username string, passwordHash []byte) error {
    _, err := dbPool.Exec(ctx, `
        INSERT INTO users (username, password_hash) VALUES ($1, $2)
        ON CONFLICT (username) DO NOTHING
    `, username, passwordHash)
    if err != nil {
        return err
    }
    // Verify created
    var exists bool
    _ = dbPool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE username=$1)`, username).Scan(&exists)
    if !exists {
        return fmt.Errorf("username may already exist")
    }
    return nil
}

func dbGetUserPasswordHash(ctx context.Context, username string) ([]byte, error) {
    var hash []byte
    err := dbPool.QueryRow(ctx, `SELECT password_hash FROM users WHERE username=$1`, username).Scan(&hash)
    if err != nil {
        return nil, err
    }
    return hash, nil
}

func dbGetDarkMode(ctx context.Context, username string) (bool, bool, error) {
    var dm bool
    err := dbPool.QueryRow(ctx, `SELECT dark_mode FROM users WHERE username=$1`, username).Scan(&dm)
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            return false, false, nil
        }
        return false, false, err
    }
    return dm, true, nil
}

func dbSetDarkMode(ctx context.Context, username string, dark bool) error {
    ct, err := dbPool.Exec(ctx, `UPDATE users SET dark_mode=$1 WHERE username=$2`, dark, username)
    if err != nil {
        return err
    }
    if ct.RowsAffected() == 0 {
        return fmt.Errorf("not found")
    }
    return nil
}

// -------------------- Room Management --------------------

func listRoomsHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    rooms, err := dbListRooms(context.Background())
    if err != nil {
        http.Error(w, "Failed to load rooms", http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(rooms)
}

func createRoomHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    var req CreateRoomRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    
    username := r.Header.Get("X-Username")
    if username == "" {
        http.Error(w, "Username required", http.StatusBadRequest)
        return
    }
    
    if req.Name == "" {
        http.Error(w, "Room name required", http.StatusBadRequest)
        return
    }
    
    var passwordHash []byte
    if req.IsPrivate && req.Password != "" {
        hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
        if err != nil {
            http.Error(w, "Password hashing failed", http.StatusInternalServerError)
            return
        }
        passwordHash = hash
    }
    
    room, err := dbCreateRoom(context.Background(), req.Name, req.Description, username, passwordHash, req.IsPrivate)
    if err != nil {
        if strings.Contains(err.Error(), "already exists") {
            http.Error(w, "Room name already exists", http.StatusConflict)
            return
        }
        log.Printf("Room creation error: %v", err)
        http.Error(w, "Failed to create room", http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(room)
}

func joinRoomHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    var req JoinRoomRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    
    if req.RoomName == "" {
        http.Error(w, "Room name required", http.StatusBadRequest)
        return
    }
    
    room, err := dbGetRoom(context.Background(), req.RoomName)
    if err != nil {
        http.Error(w, "Room not found", http.StatusNotFound)
        return
    }
    
    if room.IsPrivate && len(room.PasswordHash) > 0 {
        if req.Password == "" {
            http.Error(w, "Password required for private room", http.StatusUnauthorized)
            return
        }
        if err := bcrypt.CompareHashAndPassword(room.PasswordHash, []byte(req.Password)); err != nil {
            http.Error(w, "Invalid password", http.StatusUnauthorized)
            return
        }
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Joined room successfully"})
}

func dbListRooms(ctx context.Context) ([]Room, error) {
    if !useDB {
        // Return in-memory rooms
        return inMemoryRooms, nil
    }
    
    rows, err := dbPool.Query(ctx, `
        SELECT id, name, description, creator, is_private, created_at
        FROM rooms
        ORDER BY created_at ASC
    `)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var rooms []Room
    for rows.Next() {
        var room Room
        var createdAt time.Time
        if err := rows.Scan(&room.ID, &room.Name, &room.Description, &room.Creator, &room.IsPrivate, &createdAt); err != nil {
            return nil, err
        }
        room.CreatedAt = createdAt.Format("2006-01-02 15:04:05")
        rooms = append(rooms, room)
    }
    
    return rooms, rows.Err()
}

func dbCreateRoom(ctx context.Context, name, description, creator string, passwordHash []byte, isPrivate bool) (*Room, error) {
    if !useDB {
        // In-memory room creation for development
        room := &Room{
            ID:          int64(len(inMemoryRooms) + 1),
            Name:        name,
            Description: description,
            Creator:     creator,
            IsPrivate:   isPrivate,
            CreatedAt:   time.Now().Format("2006-01-02 15:04:05"),
        }
        
        // Check if room already exists
        for _, existingRoom := range inMemoryRooms {
            if existingRoom.Name == name {
                return nil, fmt.Errorf("room name already exists")
            }
        }
        
        // Store password hash if private
        if isPrivate && len(passwordHash) > 0 {
            inMemoryRoomPasswords[name] = passwordHash
        }
        
        inMemoryRooms = append(inMemoryRooms, *room)
        return room, nil
    }
    
    var room Room
    var createdAt time.Time
    err := dbPool.QueryRow(ctx, `
        INSERT INTO rooms (name, description, creator, password_hash, is_private)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, description, creator, is_private, created_at
    `, name, description, creator, passwordHash, isPrivate).Scan(
        &room.ID, &room.Name, &room.Description, &room.Creator, &room.IsPrivate, &createdAt,
    )
    if err != nil {
        if strings.Contains(err.Error(), "unique") {
            return nil, fmt.Errorf("room name already exists")
        }
        return nil, err
    }
    
    room.CreatedAt = createdAt.Format("2006-01-02 15:04:05")
    return &room, nil
}

type RoomWithPassword struct {
    Room
    PasswordHash []byte
}

func dbGetRoom(ctx context.Context, name string) (*RoomWithPassword, error) {
    if !useDB {
        // Check in-memory rooms
        for _, room := range inMemoryRooms {
            if room.Name == name {
                roomWithPassword := &RoomWithPassword{
                    Room: room,
                }
                if passwordHash, exists := inMemoryRoomPasswords[name]; exists {
                    roomWithPassword.PasswordHash = passwordHash
                }
                return roomWithPassword, nil
            }
        }
        return nil, fmt.Errorf("room not found")
    }
    
    var room RoomWithPassword
    var createdAt time.Time
    err := dbPool.QueryRow(ctx, `
        SELECT id, name, description, creator, password_hash, is_private, created_at
        FROM rooms WHERE name = $1
    `, name).Scan(
        &room.ID, &room.Name, &room.Description, &room.Creator, &room.PasswordHash, &room.IsPrivate, &createdAt,
    )
    if err != nil {
        return nil, err
    }
    
    room.CreatedAt = createdAt.Format("2006-01-02 15:04:05")
    return &room, nil
}
