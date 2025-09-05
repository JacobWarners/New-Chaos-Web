package main

import (
    "context"
    "database/sql"
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

    _ "github.com/jackc/pgx/v5/stdlib" // PostgreSQL driver
    "github.com/joho/godotenv"
    "golang.org/x/crypto/ssh"

    "github.com/gorilla/websocket"
)

// WebSocketMessage is a unified message structure.
type WebSocketMessage struct {
    Type    string `json:"type"`
    Payload string `json:"payload,omitempty"`
}

// SessionStatusPayload is the structured data for session status updates.
type SessionStatusPayload struct {
    ExpiresAt time.Time `json:"ExpiresAt"`
    Message   string    `json:"Message,omitempty"`
}

var upgrader = websocket.Upgrader{
    CheckOrigin:      func(r *http.Request) bool { return true },
    HandshakeTimeout: 10 * time.Minute,
}

// SafeWebSocketWriter provides a thread-safe way to write to a WebSocket connection.
type SafeWebSocketWriter struct {
    ws    *websocket.Conn
    mutex sync.Mutex
}

func (w *SafeWebSocketWriter) WriteJSON(v interface{}) error {
    w.mutex.Lock()
    defer w.mutex.Unlock()
    return w.ws.WriteJSON(v)
}

// connectToDB reads credentials from environment variables and connects to Postgres.
func connectToDB() (*sql.DB, error) {
    connStr := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=require",
        os.Getenv("DB_USER"),
        os.Getenv("DB_PASSWORD"),
        os.Getenv("DB_HOST"),
        os.Getenv("DB_PORT"),
        os.Getenv("DB_NAME"),
    )
    db, err := sql.Open("pgx", connStr)
    if err != nil {
        return nil, fmt.Errorf("failed to open database connection: %w", err)
    }
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }
    log.Println("Successfully connected to the database.")
    return db, nil
}

// startSessionWatcher is a background worker to clean up expired sessions.
func startSessionWatcher(db *sql.DB) {
    log.Println("Starting background session watcher...")
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        log.Println("Watcher: Checking for expired sessions...")
        query := `
            UPDATE sessions
            SET status = 'destroying'
            WHERE id IN (
                SELECT id FROM sessions
                WHERE status = 'active' AND expires_at <= NOW()
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, terraform_dir;
        `
        rows, err := db.QueryContext(context.Background(), query)
        if err != nil {
            log.Printf("Watcher: Error querying for expired sessions: %v", err)
            continue
        }
        defer rows.Close()

        for rows.Next() {
            var sessionID, terraformDir string
            if err := rows.Scan(&sessionID, &terraformDir); err != nil {
                log.Printf("Watcher: Error scanning expired session row: %v", err)
                continue
            }
            log.Printf("Watcher: Session %s has expired. Triggering Terraform destroy in %s", sessionID, terraformDir)
            go func(dir, sID string) {
                if err := runTerraformDestroy(dir); err != nil {
                    log.Printf("CRITICAL: Background Terraform destroy failed for session %s. Error: %v", sID, err)
                    db.ExecContext(context.Background(), "UPDATE sessions SET status = 'destroy_failed' WHERE id = $1", sID)
                } else {
                    log.Printf("Background destroy successful for session %s. Deleting session directory: %s", sID, dir)
                    if err := os.RemoveAll(dir); err != nil {
                        log.Printf("Error deleting session directory %s: %v", dir, err)
                    }
                    _, err := db.ExecContext(context.Background(), "UPDATE sessions SET status = 'destroyed' WHERE id = $1", sID)
                    if err != nil {
                        log.Printf("Watcher: Failed to update session %s status to destroyed: %v", sID, err)
                    }
                }
            }(terraformDir, sessionID)
        }
    }
}

// handleConnections manages the lifecycle of a WebSocket connection.
func handleConnections(w http.ResponseWriter, r *http.Request, db *sql.DB) {
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("Failed to upgrade connection: %v", err)
        return
    }
    defer ws.Close()
    safeWS := &SafeWebSocketWriter{ws: ws}
    log.Println("New WebSocket connection established")

    var sessionID string
    var sshClient *ssh.Client
    var sshSession *ssh.Session
    var stdin io.WriteCloser
    sshReady := make(chan struct{})

    defer func() {
        log.Printf("Closing SSH connections for session: %s", sessionID)
        if sshSession != nil { sshSession.Close() }
        if sshClient != nil { sshClient.Close() }

        if sessionID != "" {
            go func(sID string) {
                log.Printf("Starting immediate cleanup for disconnected session %s...", sID)
                
                // --- THIS IS THE FIX ---
                // Atomically check and update the session status from 'active' to 'destroying'.
                // If this affects 0 rows, it means the watcher already claimed it, and we should do nothing.
                var terraformDir string
                query := `
                    UPDATE sessions 
                    SET status = 'destroying' 
                    WHERE id = $1 AND status = 'active'
                    RETURNING terraform_dir;
                `
                err := db.QueryRowContext(context.Background(), query, sID).Scan(&terraformDir)
                if err != nil {
                    // If err is sql.ErrNoRows, the watcher already got it. This is not an error.
                    if err == sql.ErrNoRows {
                        log.Printf("Session %s was already being processed for cleanup. Defer cleanup is skipping.", sID)
                        return
                    }
                    log.Printf("CRITICAL: Could not get/update session %s for cleanup: %v", sID, err)
                    return
                }

                log.Printf("Cleanup routine claimed session %s. Starting Terraform destroy.", sID)
                if err := runTerraformDestroy(terraformDir); err != nil {
                    log.Printf("CRITICAL: Immediate Terraform destroy failed for session %s. Error: %v", sID, err)
                    db.ExecContext(context.Background(), "UPDATE sessions SET status = 'destroy_failed' WHERE id = $1", sID)
                } else {
                    log.Printf("Immediate destroy successful. Deleting session directory: %s", terraformDir)
                    os.RemoveAll(terraformDir)
                    db.ExecContext(context.Background(), "UPDATE sessions SET status = 'destroyed' WHERE id = $1", sID)
                }
            }(sessionID)
        }
        log.Printf("WebSocket handler for session %s is exiting.", sessionID)
    }()

    for {
        ws.SetReadDeadline(time.Now().Add(15 * time.Minute))
        _, msgBytes, err := ws.ReadMessage()
        if err != nil {
            log.Printf("Client disconnected or read error for session %s: %v", sessionID, err)
            return
        }

        var msg WebSocketMessage
        if err := json.Unmarshal(msgBytes, &msg); err != nil {
            log.Printf("Error unmarshaling message: %v", err)
            continue
        }

        switch msg.Type {
        case "run_terraform":
            scenarioName := msg.Payload
            if scenarioName == "" {
                safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: "No scenario name provided."})
                continue
            }
            log.Printf("Received run_terraform for scenario: %s", scenarioName)

            go func(scenario string) {
                tempDir, err := ioutil.TempDir("", "terraform-session-")
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to create temp directory: %v", err)})
                    return
                }
                userEmail := "test-user@example.com"
                initialExpiration := time.Now().Add(15 * time.Minute)
                query := `
                    INSERT INTO sessions (user_email, status, terraform_dir, expires_at)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, expires_at;
                `
                var sessionExpiresAt time.Time
                err = db.QueryRowContext(context.Background(), query, userEmail, "provisioning", tempDir, initialExpiration).Scan(&sessionID, &sessionExpiresAt)
                if err != nil {
                    log.Printf("Failed to insert new session into database: %v", err)
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: "Failed to create session in database."})
                    os.RemoveAll(tempDir)
                    return
                }
                log.Printf("Successfully created session with ID: %s in directory %s", sessionID, tempDir)
                safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("Session ID: %s\r\n", sessionID)})

                if err := runTerraformInTempDir(scenario, tempDir, safeWS); err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: err.Error()})
                    db.ExecContext(context.Background(), "UPDATE sessions SET status = 'failed' WHERE id = $1", sessionID)
                    os.RemoveAll(tempDir)
                    ws.Close()
                    return
                }
                db.ExecContext(context.Background(), "UPDATE sessions SET status = 'active' WHERE id = $1", sessionID)
                statusPayload, _ := json.Marshal(SessionStatusPayload{ExpiresAt: sessionExpiresAt})
                safeWS.WriteJSON(WebSocketMessage{Type: "session_status", Payload: string(statusPayload)})
                safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: "\r\n\x1b[32mTerraform apply completed.\x1b[0m\r\n"})

                instanceIP, err := getInstanceIPFromFile(tempDir)
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to get instance IP: %v", err)}); ws.Close(); return
                }
                keyPath, err := findPEMFile(tempDir)
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to find PEM file: %v", err)}); ws.Close(); return
                }
                sshClient, err = establishSSHConnection(instanceIP, keyPath, safeWS)
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to establish SSH connection: %v", err)}); ws.Close(); return
                }
                sshSession, err = sshClient.NewSession()
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to create SSH session: %v", err)}); ws.Close(); return
                }
                modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
                if err := sshSession.RequestPty("xterm-256color", 80, 40, modes); err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to request PTY: %v", err)}); ws.Close(); return
                }
                stdout, err := sshSession.StdoutPipe()
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to get stdout pipe: %v", err)}); ws.Close(); return
                }
                stdin, err = sshSession.StdinPipe()
                if err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to get stdin pipe: %v", err)}); ws.Close(); return
                }
                if err := sshSession.Shell(); err != nil {
                    safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: fmt.Sprintf("Failed to start shell: %v", err)}); ws.Close(); return
                }
                go func() { io.Copy(&wsWriter{safeWS, sessionID}, stdout) }()
                close(sshReady)
                safeWS.WriteJSON(WebSocketMessage{Type: "status", Payload: "connected"})
                sshSession.Wait()
                ws.Close()
            }(scenarioName)

        case "pty_input":
            select {
            case <-sshReady:
                if stdin != nil { stdin.Write([]byte(msg.Payload)) }
            default:
                log.Printf("-> SSH[WARN]: Input received for session %s before SSH was ready. Input ignored.", sessionID)
            }
        case "session_extend":
            if sessionID == "" {
                safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: "Cannot extend session: no active session."})
                continue
            }

	    ws.SetReadDeadline(time.Now().Add(15 * time.Minute))



            query := `
                UPDATE sessions
                SET expires_at = expires_at + interval '30 minutes'
                WHERE id = $1
                RETURNING expires_at;
            `
            var newExpiresAt time.Time
            err := db.QueryRowContext(context.Background(), query, sessionID).Scan(&newExpiresAt)
            if err != nil {
                log.Printf("Failed to extend session %s: %v", sessionID, err)
                safeWS.WriteJSON(WebSocketMessage{Type: "error", Payload: "Failed to extend session time."})
            } else {
                log.Printf("Extended session %s. New expiration: %v", sessionID, newExpiresAt)
                statusPayload, _ := json.Marshal(SessionStatusPayload{
                    ExpiresAt: newExpiresAt,
                    Message:   fmt.Sprintf("\r\n\x1b[33mSession extended. New expiration: %s\x1b[0m\r\n", newExpiresAt.Format(time.RFC1123)),
                })
                safeWS.WriteJSON(WebSocketMessage{Type: "session_status", Payload: string(statusPayload)})
            }
        }
    }
}

func main() {
    err := godotenv.Load()
    if err != nil {
        log.Println("Note: .env file not found, using environment variables from OS")
    }

    cwd, _ := os.Getwd()
    log.Printf("Server starting in directory: %s", cwd)
    if _, err := exec.LookPath("terraform"); err != nil {
        log.Fatal("terraform binary not found in PATH")
    }

    db, err := connectToDB()
    if err != nil {
        log.Fatalf("Could not connect to the database: %v", err)
    }
    defer db.Close()

    go startSessionWatcher(db)

    staticDir := "./static"
    http.HandleFunc("/terminal", func(w http.ResponseWriter, r *http.Request) {
        handleConnections(w, r, db)
    })

    fs := http.FileServer(http.Dir(staticDir))
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        path := filepath.Join(staticDir, r.URL.Path)
        if _, err := os.Stat(path); os.IsNotExist(err) {
            http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
        } else if err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
        } else {
            fs.ServeHTTP(w, r)
        }
    })

    log.Println("Go server listening on :5000")
    if err := http.ListenAndServe(":5000", nil); err != nil {
        log.Fatal("ListenAndServe: ", err)
    }
}

// wsWriter is a helper struct to pipe stdout from the SSH session to the WebSocket.
type wsWriter struct {
    *SafeWebSocketWriter
    sessionID string
}

func (w *wsWriter) Write(p []byte) (n int, err error) {
    err = w.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(p)})
    if err != nil {
        log.Printf("<- WS[ERROR]: Failed to send message for session %s: %v", w.sessionID, err)
        return 0, err
    }
    return len(p), nil
}

// runTerraformInTempDir copies scenario files and runs terraform init/apply.
func runTerraformInTempDir(scenarioName string, tempDir string, safeWS *SafeWebSocketWriter) error {
    log.Printf("Starting Terraform execution for scenario '%s' in directory: %s", scenarioName, tempDir)
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("Working directory: %s\r\n", tempDir)})

    // --- THIS IS THE FIX ---
    // Construct the correct path WITHOUT the redundant "scenario-tfs" subdirectory.
    sourceDir := filepath.Join("./scenarios", scenarioName)
    
    log.Printf("Checking for scenario directory at: %s", sourceDir)
    if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
        return fmt.Errorf("scenario directory not found: %s", sourceDir)
    }

    log.Printf("Copying all files from %s to %s", sourceDir, tempDir)
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: fmt.Sprintf("Copying files for scenario '%s'...\r\n", scenarioName)})

    files, err := ioutil.ReadDir(sourceDir)
    if err != nil {
        return fmt.Errorf("failed to read scenario directory %s: %v", sourceDir, err)
    }

    for _, file := range files {
        sourceFile := filepath.Join(sourceDir, file.Name())
        destFile := filepath.Join(tempDir, file.Name())
        input, err := ioutil.ReadFile(sourceFile)
        if err != nil {
            return fmt.Errorf("failed to read source file %s: %v", sourceFile, err)
        }
        if err = ioutil.WriteFile(destFile, input, file.Mode()); err != nil {
            return fmt.Errorf("failed to write destination file %s: %v", destFile, err)
        }
    }

    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: "Running terraform init...\r\n"})
    initCmd := exec.Command("terraform", "init")
    initCmd.Dir = tempDir
    initOutput, err := initCmd.CombinedOutput()
    if err != nil {
        safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(initOutput)})
        return fmt.Errorf("terraform init failed: %v", err)
    }
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(initOutput)})

    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: "\r\nRunning terraform apply (this may take up to 5 minutes)...\r\n"})
    applyCmd := exec.Command("terraform", "apply", "-auto-approve")
    applyCmd.Dir = tempDir
    applyOutput, err := applyCmd.CombinedOutput()
    if err != nil {
        safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(applyOutput)})
        return fmt.Errorf("terraform apply failed: %v", err)
    }
    safeWS.WriteJSON(WebSocketMessage{Type: "pty_output", Payload: string(applyOutput)})
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
    matches, err := filepath.Glob(filepath.Join(tempDir, "*.pem"))
    if err != nil {
        return "", fmt.Errorf("error searching for .pem files: %v", err)
    }
    if len(matches) == 0 {
        return "", fmt.Errorf("no .pem files found in %s", tempDir)
    }
    return matches[0], nil
}

func getInstanceIPFromFile(tempDir string) (string, error) {
    ipFilePath := filepath.Join(tempDir, "scenario_chaos_ip.txt")
    ipBytes, err := ioutil.ReadFile(ipFilePath)
    if err != nil {
        return "", fmt.Errorf("failed to read IP file: %v", err)
    }
    return strings.TrimSpace(string(ipBytes)), nil
}

func establishSSHConnection(instanceIP, keyPath string, safeWS *SafeWebSocketWriter) (*ssh.Client, error) {
    maxRetries := 30
    retryDelay := 10 * time.Second
    key, err := ioutil.ReadFile(keyPath)
    if err != nil {
        return nil, fmt.Errorf("unable to read private key at %s: %v", keyPath, err)
    }
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
            safeWS.WriteJSON(WebSocketMessage{
                Type:    "pty_output",
                Payload: "\r\n\x1b[32mSSH connection established!\x1b[0m\r\n",
            })
            return client, nil
        }
        log.Printf("SSH connection attempt %d failed: %v", i+1, err)
        if i < maxRetries-1 {
            time.Sleep(retryDelay)
        }
    }
    return nil, fmt.Errorf("failed to connect after %d attempts", maxRetries)
}
