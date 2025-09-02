package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// Configure the Upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all connections for this example.
		return true
	},
}

// Structs for our messages
type PtyOutput struct {
	Output string `json:"output"`
}
type TerminalInput struct {
	Input string `json:"input"`
}

// This function handles the WebSocket connection for the terminal
func terminalHandler(w http.ResponseWriter, r *http.Request) {
	// Upgrade the HTTP connection to a WebSocket connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade failed: ", err)
		return
	}
	defer conn.Close()
	log.Println("WebSocket client connected")

	// Send a welcome message
	welcomeMessage := PtyOutput{Output: "\r\n\x1b[32mSUCCESS! Standard WebSocket Connected.\x1b[0m\r\n"}
	conn.WriteJSON(welcomeMessage)

	// Loop to read messages from the client (the echo part)
	for {
		var msg TerminalInput
		// Read message from browser
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Println("read failed:", err)
			break
		}

		log.Printf("Received from client: %s", msg.Input)
		
		// Echo the message back to the browser
		echoMessage := PtyOutput{Output: msg.Input}
		if err := conn.WriteJSON(echoMessage); err != nil {
			log.Println("write failed:", err)
			break
		}
	}
}

// This is our simple REST API endpoint from before
func scenarioHandler(w http.ResponseWriter, r *http.Request) {
	// --- START: CORRECTED CORS LOGIC ---
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type") // This was the missing header
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	
	// Handle the preflight OPTIONS request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// --- END: CORRECTED CORS LOGIC ---

	// Handle the actual POST request
	if r.Method == "POST" {
		w.Header().Set("Content-Type", "application/json")
		response := map[string]string{
			"message":       "Scenario started!",
			"sessionId":     "fake-session-id-123",
			"websocketPath": "/terminal", // Note the new, simpler path
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Disallow other methods like GET, PUT, etc.
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func main() {
	http.HandleFunc("/api/scenarios", scenarioHandler)
	http.HandleFunc("/terminal", terminalHandler)

	log.Println("Go server listening on :5000")
	if err := http.ListenAndServe(":5000", nil); err != nil {
		log.Fatal(err)
	}
}
