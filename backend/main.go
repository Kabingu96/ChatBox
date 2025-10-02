package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	_ "github.com/lib/pq"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
)

// -------------------- CORS --------------------

func enableCors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// -------------------- WebSocket / Hub --------------------

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	conn     *websocket.Conn
	send     chan []byte
	hub      *Hub
	db       *sql.DB
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

// -------------------- PostgreSQL --------------------

func initDB() (*sql.DB, error) {
	connStr := "postgres://postgres:Warren7158@localhost:5432/chatbox?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return db, nil
}

func saveMessage(db *sql.DB, m Message) (int64, error) {
	var id int64
	query := `INSERT INTO messages (username, text, timestamp) VALUES ($1, $2, $3) RETURNING id`
	err := db.QueryRow(query, m.Username, m.Text, m.Timestamp).Scan(&id)
	return id, err
}

func loadRecentMessages(db *sql.DB, limit int) ([]Message, error) {
	query := `SELECT id, username, text, timestamp FROM messages ORDER BY id DESC LIMIT $1`
	rows, err := db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rev []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.Username, &msg.Text, &msg.Timestamp); err != nil {
			return nil, err
		}
		rev = append(rev, msg)
	}

	// reverse for chronological order
	for i, j := 0, len(rev)-1; i < j; i, j = i+1, j-1 {
		rev[i], rev[j] = rev[j], rev[i]
	}
	return rev, nil
}

// -------------------- WebSocket Handlers --------------------

// Helper: get timestamp in optional timezone
func getTimestamp(tz string) string {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.Local
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
			Text     string `json:"text"`
			Timezone string `json:"timezone,omitempty"`
		}
		if err := json.Unmarshal(raw, &inc); err != nil {
			log.Println("unmarshal error:", err)
			continue
		}

		ts := getTimestamp(inc.Timezone)
		out := Message{
			Username:  c.username,
			Text:      inc.Text,
			Timestamp: ts,
		}

		id, err := saveMessage(c.db, out)
		if err != nil {
			log.Println("db save error:", err)
		} else {
			out.ID = id
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

func serveWs(h *Hub, db *sql.DB, username string, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}
	client := &Client{
		conn:     conn,
		send:     make(chan []byte, 256),
		hub:      h,
		db:       db,
		username: username,
	}
	h.register <- client

	history, err := loadRecentMessages(db, 200)
	if err == nil && len(history) > 0 {
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

func registerHandler(db *sql.DB, w http.ResponseWriter, r *http.Request) {
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
	hash, _ := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
	_, err := db.Exec("INSERT INTO users (username, password) VALUES ($1, $2)", u.Username, string(hash))
	if err != nil {
		http.Error(w, "Username may already exist", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Registration successful"))
}

func loginHandler(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var u User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	var hashed string
	row := db.QueryRow("SELECT password FROM users WHERE username=$1", u.Username)
	if err := row.Scan(&hashed); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hashed), []byte(u.Password)); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	resp := map[string]string{"username": u.Username}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// -------------------- Dark Mode --------------------

func getDarkModeHandler(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, "Username required", http.StatusBadRequest)
		return
	}
	var darkMode bool
	row := db.QueryRow("SELECT dark_mode FROM users WHERE username=$1", username)
	if err := row.Scan(&darkMode); err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	resp := map[string]bool{"darkMode": darkMode}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func setDarkModeHandler(db *sql.DB, w http.ResponseWriter, r *http.Request) {
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
	_, err := db.Exec("UPDATE users SET dark_mode=$1 WHERE username=$2", payload.DarkMode, payload.Username)
	if err != nil {
		http.Error(w, "Failed to update dark mode", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Dark mode updated"))
}

// -------------------- Message Editing / Deletion --------------------

func editMessageHandler(db *sql.DB, hub *Hub, w http.ResponseWriter, r *http.Request) {
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

	_, err := db.Exec("UPDATE messages SET text=$1 WHERE id=$2", payload.Text, payload.ID)
	if err != nil {
		http.Error(w, "Failed to edit message", http.StatusInternalServerError)
		return
	}

	// broadcast edit to all clients
	broadcastPayload := struct {
		Type string `json:"type"`
		ID   int64  `json:"id"`
		Text string `json:"text"`
	}{
		Type: "edit",
		ID:   payload.ID,
		Text: payload.Text,
	}

	b, _ := json.Marshal(broadcastPayload)
	hub.broadcast <- Broadcast{sender: nil, message: b}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Message edited"))
}

func deleteMessageHandler(db *sql.DB, hub *Hub, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Message ID required", http.StatusBadRequest)
		return
	}

	_, err := db.Exec("DELETE FROM messages WHERE id=$1", id)
	if err != nil {
		http.Error(w, "Failed to delete message", http.StatusInternalServerError)
		return
	}

	// broadcast deletion to all clients
	broadcastPayload := struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}{
		Type: "delete",
		ID:   id,
	}

	b, _ := json.Marshal(broadcastPayload)
	hub.broadcast <- Broadcast{sender: nil, message: b}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Message deleted"))
}

// -------------------- Main --------------------

func main() {
	db, err := initDB()
	if err != nil {
		log.Fatalf("DB init failed: %v", err)
	}
	defer db.Close()

	hub := newHub()
	go hub.run()

	// Auth endpoints with CORS
	http.Handle("/register", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		registerHandler(db, w, r)
	})))
	http.Handle("/login", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		loginHandler(db, w, r)
	})))

	// Dark mode endpoints with CORS
	http.Handle("/get_dark_mode", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		getDarkModeHandler(db, w, r)
	})))
	http.Handle("/set_dark_mode", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setDarkModeHandler(db, w, r)
	})))

	// Message edit/delete endpoints
	http.Handle("/message", enableCors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			editMessageHandler(db, hub, w, r)
		case http.MethodDelete:
			deleteMessageHandler(db, hub, w, r)
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
		serveWs(hub, db, username, w, r)
	})

	fmt.Println("🚀 Server started on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
