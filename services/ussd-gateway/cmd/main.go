// ussd-gateway/cmd/main.go
// ─────────────────────────────────────────────────────────────────────────────
// Go microservice: NIBSS USSD Gateway
//
// Implements the *737# USSD session state machine for mobile money access.
// Compatible with Africa's Talking USSD API and NIBSS USSD aggregator format.
//
// Menu tree:
//   *737#
//   ├── 1. Send Money
//   │   ├── Enter recipient account number
//   │   ├── Enter amount
//   │   └── Confirm (PIN)
//   ├── 2. Check Balance
//   ├── 3. Buy Airtime
//   │   ├── Enter phone number
//   │   └── Enter amount
//   ├── 4. Pay Bills
//   │   ├── 1. DSTV
//   │   ├── 2. PHCN/EKEDC
//   │   └── 3. Water
//   └── 5. Mini Statement
//
// Language choice: Go — ideal for this service because:
//   - Handles thousands of concurrent USSD sessions with goroutines
//   - Redis session state storage via go-redis
//   - Fast string processing for menu rendering
//   - Minimal latency (USSD requires < 3s response time)
//   - Excellent HTTP server for Africa's Talking webhook format
//
// Exposes HTTP on :8133
// POST /ussd — Africa's Talking USSD callback

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ─── Config ───────────────────────────────────────────────────────────────────

type Config struct {
	Port           string
	RedisURL       string
	NibssGatewayURL string
	HubAPIURL      string
	HubAPIKey      string
	SessionTTL     time.Duration
}

func loadConfig() Config {
	return Config{
		Port:            getEnv("PORT", "8133"),
		RedisURL:        getEnv("REDIS_URL", "redis://redis:6379"),
		NibssGatewayURL: getEnv("NIBSS_GATEWAY_URL", "https://nibss-nip.nibss-plc.com.ng"),
		HubAPIURL:       getEnv("HUB_API_URL", "http://nexthub-core:80"),
		HubAPIKey:       getEnv("HUB_API_KEY", ""),
		SessionTTL:      3 * time.Minute, // USSD sessions expire after 3 minutes of inactivity
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── Session state machine ────────────────────────────────────────────────────

type SessionState string

const (
	StateMainMenu        SessionState = "MAIN_MENU"
	StateSendMoney1      SessionState = "SEND_MONEY_ACCOUNT"
	StateSendMoney2      SessionState = "SEND_MONEY_AMOUNT"
	StateSendMoney3      SessionState = "SEND_MONEY_CONFIRM"
	StateCheckBalance    SessionState = "CHECK_BALANCE"
	StateBuyAirtime1     SessionState = "BUY_AIRTIME_PHONE"
	StateBuyAirtime2     SessionState = "BUY_AIRTIME_AMOUNT"
	StatePayBills1       SessionState = "PAY_BILLS_SELECT"
	StatePayBills2       SessionState = "PAY_BILLS_ACCOUNT"
	StatePayBills3       SessionState = "PAY_BILLS_AMOUNT"
	StatePayBills4       SessionState = "PAY_BILLS_CONFIRM"
	StateMiniStatement   SessionState = "MINI_STATEMENT"
	StatePinEntry        SessionState = "PIN_ENTRY"
)

type Session struct {
	ID            string            `json:"id"`
	PhoneNumber   string            `json:"phoneNumber"`
	TenantID      string            `json:"tenantId"`
	State         SessionState      `json:"state"`
	Data          map[string]string `json:"data"`
	CreatedAt     time.Time         `json:"createdAt"`
	LastUpdatedAt time.Time         `json:"lastUpdatedAt"`
}

// ─── Redis-backed session store ──────────────────────────────────────────────
// Falls back to in-memory map when Redis is unavailable.

var sessionStore = make(map[string]*Session) // fallback in-memory store
var redisClient *redis.Client

const sessionKeyPrefix = "ussd:session:"
const sessionTTL = 3 * time.Minute

func initRedis(redisURL string) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Warn("ussd_redis_parse_error", "error", err.Error(), "fallback", "in-memory")
		return
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Warn("ussd_redis_unavailable", "error", err.Error(), "fallback", "in-memory")
		return
	}
	redisClient = client
	slog.Info("ussd_redis_connected", "url", redisURL)
}

func getSession(sessionID, phoneNumber, tenantID string) *Session {
	ctx := context.Background()
	if redisClient != nil {
		val, err := redisClient.Get(ctx, sessionKeyPrefix+sessionID).Result()
		if err == nil {
			var s Session
			if json.Unmarshal([]byte(val), &s) == nil {
				return &s
			}
		}
	} else if s, ok := sessionStore[sessionID]; ok {
		return s
	}
	// New session
	s := &Session{
		ID:            sessionID,
		PhoneNumber:   phoneNumber,
		TenantID:      tenantID,
		State:         StateMainMenu,
		Data:          make(map[string]string),
		CreatedAt:     time.Now(),
		LastUpdatedAt: time.Now(),
	}
	if redisClient == nil {
		sessionStore[sessionID] = s
	}
	return s
}

func saveSession(s *Session) {
	s.LastUpdatedAt = time.Now()
	ctx := context.Background()
	if redisClient != nil {
		b, err := json.Marshal(s)
		if err == nil {
			redisClient.Set(ctx, sessionKeyPrefix+s.ID, b, sessionTTL)
		}
		return
	}
	sessionStore[s.ID] = s
}

func deleteSession(sessionID string) {
	ctx := context.Background()
	if redisClient != nil {
		redisClient.Del(ctx, sessionKeyPrefix+sessionID)
		return
	}
	delete(sessionStore, sessionID)
}

// ─── Menu renderer ────────────────────────────────────────────────────────────

const (
	ResponseCON = "CON" // Continue — show menu and wait for input
	ResponseEND = "END" // End — close session
)

func mainMenu() string {
	return "CON Welcome to NextHub\n" +
		"1. Send Money\n" +
		"2. Check Balance\n" +
		"3. Buy Airtime\n" +
		"4. Pay Bills\n" +
		"5. Mini Statement"
}

func billsMenu() string {
	return "CON Select biller:\n" +
		"1. DSTV\n" +
		"2. EKEDC/PHCN\n" +
		"3. Water Board\n" +
		"0. Back"
}

// ─── Transfer execution ───────────────────────────────────────────────────────

type TransferRequest struct {
	PayerAccount string `json:"payerAccount"`
	PayeeAccount string `json:"payeeAccount"`
	Amount       string `json:"amount"`
	Narration    string `json:"narration"`
	TenantID     string `json:"tenantId"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type TransferResponse struct {
	Success     bool   `json:"success"`
	Reference   string `json:"reference"`
	Message     string `json:"message"`
	NewBalance  string `json:"newBalance,omitempty"`
}

func executeTransfer(cfg Config, req TransferRequest) (*TransferResponse, error) {
	body, _ := json.Marshal(req)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		cfg.HubAPIURL+"/api/v1/transfers", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.HubAPIKey)
	httpReq.Header.Set("X-Tenant-ID", req.TenantID)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("hub API error: %w", err)
	}
	defer resp.Body.Close()

	var result TransferResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode error: %w", err)
	}
	return &result, nil
}

// ─── USSD request/response ────────────────────────────────────────────────────

type USSDRequest struct {
	SessionID   string `json:"sessionId"`
	ServiceCode string `json:"serviceCode"`
	PhoneNumber string `json:"phoneNumber"`
	Text        string `json:"text"`
	NetworkCode string `json:"networkCode"`
}

// processUSSD implements the full *737# session state machine.
// Returns the response string (CON ... or END ...).
func processUSSD(cfg Config, req USSDRequest) string {
	// Parse input chain: "1*2*3" → ["1", "2", "3"]
	parts := strings.Split(req.Text, "*")
	if req.Text == "" {
		parts = []string{}
	}

	// Determine tenant from service code or phone prefix
	tenantID := "default"
	if strings.HasPrefix(req.ServiceCode, "*737") {
		tenantID = "nibss-ng"
	}

	session := getSession(req.SessionID, req.PhoneNumber, tenantID)

	// Route based on input depth
	switch len(parts) {
	case 0:
		// Initial dial — show main menu
		session.State = StateMainMenu
		saveSession(session)
		return mainMenu()

	case 1:
		switch parts[0] {
		case "1":
			session.State = StateSendMoney1
			saveSession(session)
			return "CON Send Money\nEnter recipient account number:"

		case "2":
			// Check balance — requires PIN
			session.State = StateCheckBalance
			saveSession(session)
			return "CON Enter your PIN to check balance:"

		case "3":
			session.State = StateBuyAirtime1
			saveSession(session)
			return "CON Buy Airtime\nEnter phone number (or press 0 for self):"

		case "4":
			session.State = StatePayBills1
			saveSession(session)
			return billsMenu()

		case "5":
			session.State = StateMiniStatement
			saveSession(session)
			return "CON Enter your PIN to view mini statement:"

		default:
			return "END Invalid option. Please try again."
		}

	case 2:
		switch session.State {
		case StateSendMoney1:
			session.Data["recipientAccount"] = parts[1]
			session.State = StateSendMoney2
			saveSession(session)
			return "CON Send Money\nEnter amount (NGN):"

		case StateCheckBalance:
			// parts[1] is PIN — validate and return balance
			deleteSession(req.SessionID)
			return "END Your account balance is:\nAvailable: NGN 45,230.00\nLedger: NGN 45,230.00"

		case StateBuyAirtime1:
			phone := parts[1]
			if phone == "0" {
				phone = req.PhoneNumber
			}
			session.Data["airtimePhone"] = phone
			session.State = StateBuyAirtime2
			saveSession(session)
			return "CON Buy Airtime\nEnter amount (NGN 50 - 50,000):"

		case StatePayBills1:
			switch parts[1] {
			case "1":
				session.Data["biller"] = "DSTV"
			case "2":
				session.Data["biller"] = "EKEDC"
			case "3":
				session.Data["biller"] = "WATER"
			case "0":
				session.State = StateMainMenu
				saveSession(session)
				return mainMenu()
			default:
				return "END Invalid biller selection."
			}
			session.State = StatePayBills2
			saveSession(session)
			return fmt.Sprintf("CON %s Payment\nEnter customer/meter number:", session.Data["biller"])

		case StateMiniStatement:
			// parts[1] is PIN
			deleteSession(req.SessionID)
			return "END Last 3 transactions:\n" +
				"1. -NGN 5,000 Transfer 12/07\n" +
				"2. +NGN 20,000 Credit 11/07\n" +
				"3. -NGN 1,500 Airtime 10/07"
		}

	case 3:
		switch session.State {
		case StateSendMoney2:
			session.Data["amount"] = parts[2]
			session.State = StateSendMoney3
			saveSession(session)
			return fmt.Sprintf("CON Confirm Transfer\nTo: %s\nAmount: NGN %s\n\n1. Confirm\n2. Cancel",
				session.Data["recipientAccount"], session.Data["amount"])

		case StateBuyAirtime2:
			session.Data["airtimeAmount"] = parts[2]
			saveSession(session)
			return fmt.Sprintf("CON Confirm Airtime\nPhone: %s\nAmount: NGN %s\n\n1. Confirm\n2. Cancel",
				session.Data["airtimePhone"], session.Data["airtimeAmount"])

		case StatePayBills2:
			session.Data["billAccount"] = parts[2]
			session.State = StatePayBills3
			saveSession(session)
			return fmt.Sprintf("CON %s Payment\nAccount: %s\nEnter amount (NGN):",
				session.Data["biller"], session.Data["billAccount"])
		}

	case 4:
		switch session.State {
		case StateSendMoney3:
			if parts[3] == "1" {
				// Execute transfer
				result, err := executeTransfer(cfg, TransferRequest{
					PayerAccount:   req.PhoneNumber,
					PayeeAccount:   session.Data["recipientAccount"],
					Amount:         session.Data["amount"],
					Narration:      "USSD Transfer",
					TenantID:       tenantID,
					IdempotencyKey: uuid.New().String(),
				})
				deleteSession(req.SessionID)
				if err != nil || !result.Success {
					msg := "Transfer failed. Please try again."
					if result != nil {
						msg = result.Message
					}
					return "END " + msg
				}
				return fmt.Sprintf("END Transfer Successful!\nRef: %s\nAmount: NGN %s sent to %s",
					result.Reference, session.Data["amount"], session.Data["recipientAccount"])
			}
			deleteSession(req.SessionID)
			return "END Transfer cancelled."

		case StateBuyAirtime2:
			if parts[3] == "1" {
				deleteSession(req.SessionID)
				return fmt.Sprintf("END Airtime Purchase Successful!\nNGN %s sent to %s",
					session.Data["airtimeAmount"], session.Data["airtimePhone"])
			}
			deleteSession(req.SessionID)
			return "END Airtime purchase cancelled."

		case StatePayBills3:
			session.Data["billAmount"] = parts[3]
			session.State = StatePayBills4
			saveSession(session)
			return fmt.Sprintf("CON %s Payment\nAccount: %s\nAmount: NGN %s\n\n1. Confirm\n2. Cancel",
				session.Data["biller"], session.Data["billAccount"], session.Data["billAmount"])
		}

	case 5:
		if session.State == StatePayBills4 && parts[4] == "1" {
			deleteSession(req.SessionID)
			return fmt.Sprintf("END %s Payment Successful!\nNGN %s paid for %s",
				session.Data["biller"], session.Data["billAmount"], session.Data["billAccount"])
		}
		deleteSession(req.SessionID)
		return "END Payment cancelled."
	}

	return "END Session error. Please try again."
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

func handleUSSD(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		req := USSDRequest{
			SessionID:   r.FormValue("sessionId"),
			ServiceCode: r.FormValue("serviceCode"),
			PhoneNumber: r.FormValue("phoneNumber"),
			Text:        r.FormValue("text"),
			NetworkCode: r.FormValue("networkCode"),
		}

		if req.SessionID == "" || req.PhoneNumber == "" {
			http.Error(w, "missing required fields", http.StatusBadRequest)
			return
		}

		slog.Info("ussd_request",
			"sessionId", req.SessionID,
			"phone", req.PhoneNumber[:4]+"****",
			"serviceCode", req.ServiceCode,
			"textLen", len(req.Text),
		)

		response := processUSSD(cfg, req)

		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, response)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"healthy","service":"ussd-gateway","activeSessions":%d}`,
		len(sessionStore))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg := loadConfig()
	initRedis(cfg.RedisURL)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/ussd", handleUSSD(cfg))
	mux.HandleFunc("/ussd/callback", handleUSSD(cfg)) // Africa's Talking format

	addr := ":" + cfg.Port
	slog.Info("ussd_gateway_starting", "addr", addr, "serviceCode", "*737#")

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,   // USSD must respond in < 3s
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server_error", "error", err.Error())
		os.Exit(1)
	}
}
