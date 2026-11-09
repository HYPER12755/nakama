// Command showcase is the single-origin gateway for the Nakama feature
// showcase. It serves the browser client and reverse-proxies Nakama's HTTP and
// WebSocket APIs on port 4001 so the entire demo is same-origin.
//
// Heavy gameplay logic lives in game.go and is written in Go. Nakama remains
// the identity/social/economy/realtime platform; no Node process is involved.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed web
var embeddedWeb embed.FS

type config struct {
	Addr        string
	NakamaURL   string
	NakamaKey   string
	HTTPKey     string
	Secret      string
	ConsoleURL  string
	Dev         bool
	GameVersion string
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func main() {
	var cfg config
	flag.StringVar(&cfg.Addr, "addr", envOr("SHOWCASE_ADDR", "0.0.0.0:4001"), "listen address")
	flag.StringVar(&cfg.NakamaURL, "nakama", envOr("NAKAMA_URL", "http://127.0.0.1:7350"), "Nakama base URL")
	flag.StringVar(&cfg.NakamaKey, "nakama-key", envOr("NAKAMA_SERVER_KEY", "defaultkey"), "Nakama server key")
	flag.StringVar(&cfg.HTTPKey, "http-key", envOr("NAKAMA_HTTP_KEY", "showcase_http_key"), "Nakama runtime HTTP key")
	flag.StringVar(&cfg.Secret, "secret", envOr("SHOWCASE_SECRET", "dev_showcase_secret_2026"), "shared secret for Go -> Nakama match result RPC")
	flag.BoolVar(&cfg.Dev, "dev", envOr("SHOWCASE_DEV", "") == "1", "serve web files from disk")
	flag.Parse()

	if u, err := url.Parse(cfg.NakamaURL); err == nil {
		cfg.ConsoleURL = fmt.Sprintf("%s://%s:7351", u.Scheme, u.Hostname())
	}

	webFS, err := webFiles(cfg.Dev)
	if err != nil {
		log.Fatalf("web files: %v", err)
	}

	target, err := url.Parse(cfg.NakamaURL)
	if err != nil {
		log.Fatalf("parse NAKAMA_URL: %v", err)
	}

	nProxy := httputil.NewSingleHostReverseProxy(target)
	nProxy.FlushInterval = -1
	nProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("nakama proxy error %s %s: %v", r.Method, r.URL.Path, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":  "nakama_unreachable",
			"detail": err.Error(),
		})
	}

	game := NewGameServer(cfg)
	app := &app{
		cfg:     cfg,
		webFS:   webFS,
		proxy:   nProxy,
		game:    game,
		start:   time.Now(),
		console: cfg.ConsoleURL,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/go/health", app.handleHealth)
	mux.HandleFunc("/go/rooms", app.game.handleRooms)
	mux.HandleFunc("/go/room-code", app.game.handleRoomCode)
	mux.HandleFunc("/go/ws", app.game.handleWS)
	mux.HandleFunc("/go/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "unknown go endpoint"})
	})

	// Nakama's public API + realtime socket. Same-origin through this server.
	mux.Handle("/v2/", nProxy)
	mux.Handle("/v1/", nProxy)
	mux.Handle("/ws", nProxy)
	mux.Handle("/healthcheck", nProxy)

	// Convenience redirects to the Nakama developer console (not proxied).
	mux.HandleFunc("/console", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, app.console, http.StatusFound)
	})
	mux.HandleFunc("/console/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, app.console, http.StatusFound)
	})

	mux.HandleFunc("/", app.handleStatic)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	log.Printf("showcase listening on http://%s (nakama=%s, console=%s)", cfg.Addr, cfg.NakamaURL, app.console)
	log.Printf("open http://127.0.0.1:4001/ on this device, or http://<phone-lan-ip>:4001/ from another device")
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

type app struct {
	cfg     config
	webFS   fs.FS
	proxy   *httputil.ReverseProxy
	game    *GameServer
	start   time.Time
	console string
}

func webFiles(dev bool) (fs.FS, error) {
	if dev {
		return os.DirFS("web"), nil
	}
	return fs.Sub(embeddedWeb, "web")
}

func (a *app) handleStatic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p := strings.TrimPrefix(filepath.ToSlash(filepath.Clean(r.URL.Path)), "/")
	if p == "" || p == "." {
		p = "index.html"
	}
	data, err := fs.ReadFile(a.webFS, p)
	if err != nil {
		// Single-page app fallback.
		data, err = fs.ReadFile(a.webFS, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		p = "index.html"
	}
	ct := mime.TypeByExtension(filepath.Ext(p))
	if ct == "" {
		ct = http.DetectContentType(data)
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "no-cache")
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(data)
}

type healthResponse struct {
	OK           bool   `json:"ok"`
	GoVersion    string `json:"go_version"`
	Uptime       string `json:"uptime"`
	Nakama       string `json:"nakama"`
	NakamaStatus int    `json:"nakama_status"`
	Rooms        int    `json:"rooms"`
	Players      int    `json:"players"`
	ServerTime   string `json:"server_time"`
}

func (a *app) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	status := 0
	nakama := "down"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, a.cfg.NakamaURL+"/healthcheck", nil)
	if resp, err := http.DefaultClient.Do(req); err == nil {
		status = resp.StatusCode
		_ = resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			nakama = "up"
		}
	}

	rooms, players := a.game.stats()
	writeJSON(w, http.StatusOK, healthResponse{
		OK:           nakama == "up",
		GoVersion:    "go1.27.3",
		Uptime:       time.Since(a.start).Round(time.Second).String(),
		Nakama:       nakama,
		NakamaStatus: status,
		Rooms:        rooms,
		Players:      players,
		ServerTime:   time.Now().UTC().Format(time.RFC3339),
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if r.URL.Path != "/go/health" && r.URL.Path != "/favicon.ico" {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}
