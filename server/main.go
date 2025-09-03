package main

import (
    "encoding/json"
    "fmt"
    "io"
    "io/ioutil"
    "log"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "sync"
    "time"

    "github.com/gorilla/websocket"
    "golang.org/x/crypto/ssh"
)

// A unified message structure. The payload will always be a string.
type WebSocketMessage struct {
    Type    string `json:"type"`
    Payload string `json:"payload,omitempty"`
}

var upgrader = websocket.Upgrader{
    CheckOrigin:      func(r *http.Request) bool { return true },
    HandshakeTimeout: 10 * time.Minute,
}

// WebSocket writer with mutex for thread-safe writes
type SafeWebSocketWriter struct {
    ws    *websocket.Conn
    mutex sync.Mutex
}

func (w *SafeWebSocketWriter) WriteJSON(v interface{}) error {
    w.mutex.Lock()
    defer w.mutex.Unlock()
    return w.ws.WriteJSON(v)
}

func runTerraformInTempDir(tempDir string, safeWS *SafeWebSocketWriter) error {
    log.Printf("Starting Terraform execution in directory: %s", tempDir)
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("Working directory: %s\r\n", tempDir)})
    sourceTfFile := "../terraform/setup-weka.tf"
    destTfFile := filepath.Join(tempDir, "main.tf")
    // Copy terraform file to temp directory
    log.Printf("Copying %s to %s", sourceTfFile, destTfFile)
    input, err := ioutil.ReadFile(sourceTfFile)
    if err != nil {
        return fmt.Errorf("failed to read source terraform file: %v", err)
    }
    if err = ioutil.WriteFile(destTfFile, input, 0644); err != nil {
        return fmt.Errorf("failed to write terraform file to temp dir: %v", err)
    }
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("Copied terraform file to: %s\r\n", destTfFile)})
    // Initialize terraform
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: "Running terraform init...\r\n"})
    initCmd := exec.Command("terraform", "init")
    initCmd.Dir = tempDir
    initOutput, err := initCmd.CombinedOutput()
    if err != nil {
        safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(initOutput)})
        return fmt.Errorf("terraform init failed: %v", err)
    }
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(initOutput)})
    // Apply terraform
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: "\r\nRunning terraform apply (this may take up to 5 minutes)...\r\n"})
    applyCmd := exec.Command("terraform", "apply", "-auto-approve")
    applyCmd.Dir = tempDir
    // Use CombinedOutput to avoid concurrent writes
    applyOutput, err := applyCmd.CombinedOutput()
    if err != nil {
        safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(applyOutput)})
        return fmt.Errorf("terraform apply failed: %v", err)
    }
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(applyOutput)})
    // List all files in the directory after terraform apply
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: "\r\n=== Files in terraform directory after apply ===\r\n"})
    files, err := ioutil.ReadDir(tempDir)
    if err == nil {
        for _, file := range files {
            safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("  %s (size: %d bytes)\r\n", file.Name(), file.Size())})
        }
    }
    return nil
}
func runTerraformDestroy(tempDir string) error {
    log.Printf("Starting Terraform destroy in directory: %s", tempDir)
    cmd := exec.Command("terraform", "destroy", "-parallelism=30", "-auto-approve")
    cmd.Dir = tempDir

    output, err := cmd.CombinedOutput()
    if err != nil {
        log.Printf("Terraform destroy command failed. Output:\n%s", string(output))
        return fmt.Errorf("terraform destroy failed: %v", err)
    }

    log.Printf("Terraform destroy completed successfully. Output:\n%s", string(output))
    return nil
}

func findPEMFile(tempDir string) (string, error) {
    log.Printf("Searching for .pem files in directory: %s", tempDir)
    matches, err := filepath.Glob(filepath.Join(tempDir, "*.pem"))
    if err != nil {
        return "", fmt.Errorf("error searching for .pem files: %v", err)
    }
    if len(matches) == 0 {
        files, _ := ioutil.ReadDir(tempDir)
        fileList := []string{}
        for _, f := range files {
            fileList = append(fileList, f.Name())
        }
        return "", fmt.Errorf("no .pem files found in %s. Files present: %v", tempDir, fileList)
    }
    if len(matches) > 1 {
        log.Printf("Warning: Multiple .pem files found: %v. Using the first one.", matches)
    }
    pemPath := matches[0]
    log.Printf("Found PEM file: %s", pemPath)
    info, err := os.Stat(pemPath)
    if err != nil {
        return "", fmt.Errorf("cannot stat PEM file %s: %v", pemPath, err)
    }
    log.Printf("PEM file details: %s (size: %d bytes, permissions: %v)", pemPath, info.Size(), info.Mode())
    return pemPath, nil
}
func getInstanceIPFromFile(tempDir string) (string, error) {
    ipFilePath := filepath.Join(tempDir, "scenario_chaos_ip.txt")
    log.Printf("Reading instance IP from: %s", ipFilePath)
    ipBytes, err := ioutil.ReadFile(ipFilePath)
    if err != nil {
        return "", fmt.Errorf("failed to read IP file: %v", err)
    }
    instanceIP := strings.TrimSpace(string(ipBytes))
    log.Printf("Instance IP from file: '%s'", instanceIP)
    return instanceIP, nil
}
func establishSSHConnection(instanceIP, keyPath string, safeWS *SafeWebSocketWriter) (*ssh.Client, error) {
    maxRetries := 30
    retryDelay := 10 * time.Second
    log.Printf("Reading private key from: %s", keyPath)
    key, err := ioutil.ReadFile(keyPath)
    if err != nil {
        return nil, fmt.Errorf("unable to read private key at %s: %v", keyPath, err)
    }
    log.Printf("Successfully read private key (size: %d bytes)", len(key))
    signer, err := ssh.ParsePrivateKey(key)
    if err != nil {
        return nil, fmt.Errorf("unable to parse private key: %v", err)
    }
    config := &ssh.ClientConfig{
        User:            "ec2-user",
        Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
        HostKeyCallback: ssh.InsecureIgnoreHostKey(),
        Timeout:         30 * time.Second,
    }
    for i := 0; i < maxRetries; i++ {
        safeWS.WriteJSON(WebSocketMessage{
            Type:    "pty_output",
            Payload: fmt.Sprintf("Attempting SSH connection to ec2-user@%s (attempt %d/%d)...\r\n", instanceIP, i+1, maxRetries),
        })
        client, err := ssh.Dial("tcp", instanceIP+":22", config)
        if err == nil {
            log.Printf("Successfully connected to %s", instanceIP)
            safeWS.WriteJSON(WebSocketMessage{
                Type:    "pty_output",
                Payload: "\r\n\x1b[32mSSH connection established!\x1b[0m\r\n",
            })
            return client, nil
        }
        log.Printf("SSH connection attempt %d failed: %v", i+1, err)
        if i < maxRetries-1 {
            safeWS.WriteJSON(WebSocketMessage{
                Type:    "pty_output",
                Payload: fmt.Sprintf("Connection failed: %v. Retrying in %v...\r\n", err, retryDelay),
            })
            time.Sleep(retryDelay)
        }
    }
    return nil, fmt.Errorf("failed to connect after %d attempts", maxRetries)
}
func handleConnections(w http.ResponseWriter, r *http.Request) {
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("Failed to upgrade connection: %v", err)
        return
    }
    defer ws.Close()
    safeWS := &SafeWebSocketWriter{ws: ws}

    ws.SetWriteDeadline(time.Now().Add(15 * time.Minute))
    ws.SetReadDeadline(time.Now().Add(15 * time.Minute))

    log.Println("New WebSocket connection established")
    var sessionTempDir string
    var sshClient *ssh.Client
    var sshSession *ssh.Session
    var stdin io.WriteCloser
    var terraformRan bool

    tempDir, err := ioutil.TempDir("", "terraform-session-")
    if err != nil {
        safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to create temp directory: %v", err)})
        return
    }
    sessionTempDir = tempDir
    sessionID := filepath.Base(tempDir)

    log.Printf("Created session directory: %s (Session ID: %s)", sessionTempDir, sessionID)
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("Session ID: %s\r\nWorking directory: %s\r\n", sessionID, sessionTempDir)})

    sshReady := make(chan struct{})

    for {
        ws.SetReadDeadline(time.Now().Add(15 * time.Minute))
        _, msgBytes, err := ws.ReadMessage()
        if err != nil {
            log.Printf("Client disconnected or read error for session %s: %v", sessionID, err)
            break
        }
        var msg WebSocketMessage
        if err := json.Unmarshal(msgBytes, &msg); err != nil {
            log.Printf("Error unmarshaling message: %v", err)
            continue
        }
        switch msg.Type {
        case "run_terraform":
            go func() {
                terraformRan = true
                if err := runTerraformInTempDir(sessionTempDir, safeWS); err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: err.Error()})
                    terraformRan = false
                    ws.Close()
                    return
                }
                safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: "\r\n\x1b[32mTerraform apply completed.\x1b[0m\r\n"})

                instanceIP, err := getInstanceIPFromFile(sessionTempDir)
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to get instance IP: %v", err)})
                    ws.Close()
                    return
                }

                keyPath, err := findPEMFile(sessionTempDir)
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to find PEM file: %v", err)})
                    ws.Close()
                    return
                }

                sshClient, err = establishSSHConnection(instanceIP, keyPath, safeWS)
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to establish SSH connection: %v", err)})
                    ws.Close()
                    return
                }

                sshSession, err = sshClient.NewSession()
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to create SSH session: %v", err)})
                    ws.Close()
                    return
                }

                modes := ssh.TerminalModes{
                    ssh.ECHO:          1,
                    ssh.TTY_OP_ISPEED: 14400,
                    ssh.TTY_OP_OSPEED: 14400,
                }
                if err := sshSession.RequestPty("xterm-256color", 80, 40, modes); err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to request PTY: %v", err)})
                    ws.Close()
                    return
                }

                stdout, err := sshSession.StdoutPipe()
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to get stdout pipe: %v", err)})
                    ws.Close()
                    return
                }
                stdin, err = sshSession.StdinPipe()
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to get stdin pipe: %v", err)})
                    ws.Close()
                    return
                }

                if err := sshSession.Shell(); err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to start shell: %v", err)})
                    ws.Close()
                    return
                }

                // --- THIS IS THE FIX ---
                // Re-introduce io.Copy with a logging writer for robust, verbose output streaming.
                go func() {
                    log.Printf("Starting stdout copy for session %s", sessionID)
                    // The wsWriter wraps our thread-safe writer and adds logging
                    _, copyErr := io.Copy(&wsWriter{safeWS, sessionID}, stdout)
                    if copyErr != nil {
                        log.Printf("Error during stdout copy for session %s: %v", sessionID, copyErr)
                    }
                    log.Printf("Finished stdout copy for session %s", sessionID)
                }()

                close(sshReady)
                safeWS.WriteJSON(WebSocketMessage{Type: "status", Payload: "connected"})

                sshSession.Wait()
                ws.Close()
            }()

        case "pty_input":
            // Add verbose logging to the input path
            log.Printf("-> MSG[IN]: Received %d bytes from client for session %s", len(msg.Payload), sessionID)
            select {
            case <-sshReady:
                if stdin != nil {
                    n, err := stdin.Write([]byte(msg.Payload))
                    if err != nil {
                        log.Printf("-> SSH[ERROR]: Failed to write to stdin for session %s: %v", sessionID, err)
                    } else {
                        log.Printf("-> SSH[OK]: Wrote %d bytes to stdin for session %s", n, sessionID)
                    }
                }
            default:
                log.Printf("-> SSH[WARN]: Input received for session %s before SSH was ready. Input ignored.", sessionID)
            }
        }
    }

    // Cleanup logic remains the same...
    log.Printf("Closing SSH connections for session: %s", sessionID)
    if sshSession != nil {
        sshSession.Close()
    }
    if sshClient != nil {
        sshClient.Close()
    }

    go func(dir string, id string, ran bool) {
        if !ran {
            log.Printf("Terraform did not run successfully, cleaning up local directory only: %s", dir)
            os.RemoveAll(dir)
            log.Printf("Session %s has ended.", id)
            return
        }

        log.Printf("Starting background cleanup for session %s...", id)
        if err := runTerraformDestroy(dir); err != nil {
            log.Printf("CRITICAL: Background Terraform destroy failed for session %s. Directory %s will NOT be deleted for manual inspection. Error: %v", id, dir, err)
        } else {
            log.Printf("Background destroy successful. Deleting session directory: %s", dir)
            if err := os.RemoveAll(dir); err != nil {
                log.Printf("Error deleting session directory %s: %v", dir, err)
            } else {
                log.Printf("Successfully deleted session directory %s", dir)
            }
        }
        log.Printf("Background cleanup for session %s has finished.", id)
    }(sessionTempDir, sessionID, terraformRan)

    log.Printf("Session %s handler is exiting; cleanup will continue in the background.", sessionID)
}

// Helper struct to wrap SafeWebSocketWriter for io.Copy and add logging
type wsWriter struct {
    *SafeWebSocketWriter
    sessionID string
}

func (w *wsWriter) Write(p []byte) (n int, err error) {
    // Verbose log for outgoing data
    log.Printf("<- MSG[OUT]: Sending %d bytes to client for session %s", len(p), w.sessionID)
    err = w.WriteJSON(WebSocketMessage{
        Type:    "pty_output",
        Payload: string(p),
    })
    if err != nil {
        log.Printf("<- WS[ERROR]: Failed to send message for session %s: %v", w.sessionID, err)
        return 0, err
    }
    return len(p), nil
}


func main() {
    cwd, _ := os.Getwd()
    log.Printf("Server starting in directory: %s", cwd)
    if _, err := exec.LookPath("terraform"); err != nil {
        log.Fatal("terraform binary not found in PATH")
    }
    tfPath := "../terraform/setup-weka.tf"
    if _, err := os.Stat(tfPath); err != nil {
        log.Printf("Warning: Cannot find terraform file at %s: %v", tfPath, err)
    }
    http.HandleFunc("/terminal", handleConnections)
    log.Println("Go server listening on :5000")
    log.Println("WebSocket endpoint: ws://localhost:5000/terminal")
    if err := http.ListenAndServe(":5000", nil); err != nil {
        log.Fatal("ListenAndServe: ", err)
    }
}
