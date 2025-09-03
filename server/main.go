package main

import (
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "strings"

    "github.com/creack/pty"
    "github.com/gorilla/websocket"
)

// Updated message structure for clarity
type WebSocketMessage struct {
    Type    string `json:"type"`
    Payload string `json:"payload,omitempty"` // Payload is now always a string
}

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
}

func runTerraformInTempDir() (string, error) {
    log.Println("Starting Terraform execution...")
    tempDir, err := os.MkdirTemp("", "chaos-tf-run-*")
    if err != nil { return "", fmt.Errorf("failed to create temp directory: %w", err) }
    defer os.RemoveAll(tempDir)
    log.Printf("Created temporary directory: %s", tempDir)

    sourceTfFile := "../terraform/setup-weka.tf"
    sourceFileBytes, err := os.ReadFile(sourceTfFile)
    if err != nil { return "", fmt.Errorf("failed to read source .tf file: %w", sourceTfFile) }
    destTfFile := filepath.Join(tempDir, "main.tf")
    if err := os.WriteFile(destTfFile, sourceFileBytes, 0644); err != nil { return "", fmt.Errorf("failed to write .tf file: %w", err) }
    
    initCmd := exec.Command("terraform", "init")
    initCmd.Dir = tempDir
    if output, err := initCmd.CombinedOutput(); err != nil { return "", fmt.Errorf("terraform init failed: %w\n%s", err, output) }
    log.Println("Terraform init successful.")

    applyCmd := exec.Command("terraform", "apply", "--auto-approve")
    applyCmd.Dir = tempDir
    if output, err := applyCmd.CombinedOutput(); err != nil { return "", fmt.Errorf("terraform apply failed: %w\n%s", err, output) }
    log.Println("Terraform apply successful.")

    pemFiles, err := filepath.Glob(filepath.Join(tempDir, "*.pem"))
    if err != nil || len(pemFiles) == 0 { return "", fmt.Errorf("could not find .pem key file in %s", tempDir) }
    pemKeyPath := pemFiles[0]
    log.Printf("Found PEM key: %s", pemKeyPath)

    ipBytes, err := os.ReadFile(filepath.Join(tempDir, "scenario_chaos_ip.txt"))
    if err != nil { return "", fmt.Errorf("could not read scenario_chaos_ip.txt in %s", tempDir) }
    ipAddress := strings.TrimSpace(string(ipBytes))
    log.Printf("Found IP address: %s", ipAddress)
    
    // *** THE FIX for the SSH command ***
    // Add flags to automatically accept host keys and prevent interactive prompts.
    sshCommand := fmt.Sprintf("ssh -i %s -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ec2-user@%s\n", pemKeyPath, ipAddress)
    log.Printf("Constructed SSH command: %s", sshCommand)
    return sshCommand, nil
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil { log.Printf("Failed to upgrade connection: %v", err); return }
    defer ws.Close()
    log.Println("WebSocket client connected")

    cmd := exec.Command("bash")
    ptmx, err := pty.Start(cmd)
    if err != nil { log.Printf("Failed to start pty: %v", err); return }
    defer ptmx.Close()

    // Goroutine to stream PTY output to the client inside JSON messages
    go func() {
        buffer := make([]byte, 1024)
        for {
            n, err := ptmx.Read(buffer)
            if err != nil {
                log.Printf("PTY read error: %v", err)
                return
            }
            // *** THE FIX for UI lag ***
            // Wrap all PTY output in a structured JSON message
            msg := WebSocketMessage{
                Type:    "pty_output",
                Payload: string(buffer[:n]),
            }
            if err := ws.WriteJSON(msg); err != nil {
                log.Printf("WebSocket write error: %v", err)
                return
            }
        }
    }()
    
    // Loop to handle incoming messages
    for {
        _, msgBytes, err := ws.ReadMessage()
        if err != nil { log.Printf("Client disconnected: %v", err); break }

        var msg WebSocketMessage
        if err := json.Unmarshal(msgBytes, &msg); err != nil { log.Printf("Error unmarshaling message: %v", err); continue }

        switch msg.Type {
        case "run_terraform":
            go func() {
                sshCommand, err := runTerraformInTempDir()
                if err != nil {
                    log.Printf("Terraform error: %v", err)
                    // Send error back to client
                    errorMsg := WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("\r\nTerraform failed: %v\r\n", err)}
                    ws.WriteJSON(errorMsg)
                    return
                }
                // Send the command to be executed
                execMsg := WebSocketMessage{Type: "pty_input", Payload: sshCommand}
                ptmx.Write([]byte(execMsg.Payload))
            }()
        case "pty_input":
            // Forward user input from the client to the PTY
            ptmx.Write([]byte(msg.Payload))
        }
    }
}

func main() {
    http.HandleFunc("/terminal", handleConnections)
    log.Println("Go server listening on :5000")
    if err := http.ListenAndServe(":5000", nil); err != nil { log.Fatal("ListenAndServe: ", err) }
}
