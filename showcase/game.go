package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	mathrand "math/rand"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type accountIdentity struct {
	ID          string
	Username    string
	DisplayName string
}

func (a accountIdentity) label() string {
	if a.DisplayName != "" {
		return a.DisplayName
	}
	return a.Username
}

type tokenEntry struct {
	account accountIdentity
	expires time.Time
}

type GameServer struct {
	cfg      config
	upgrader websocket.Upgrader
	client   *http.Client

	tokensMu sync.Mutex
	tokens   map[string]tokenEntry

	roomsMu sync.Mutex
	rooms   map[string]*room

	start time.Time
}

func NewGameServer(cfg config) *GameServer {
	return &GameServer{
		cfg: cfg,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin:     func(*http.Request) bool { return true },
		},
		client: &http.Client{Timeout: 8 * time.Second},
		tokens: make(map[string]tokenEntry),
		rooms:  make(map[string]*room),
		start:  time.Now(),
	}
}

type room struct {
	ID   string
	Mode string // "bot" or "pvp"
	gs   *GameServer

	mu           sync.Mutex
	players      map[string]*player
	state        string // waiting | countdown | live | result
	countdownEnd time.Time
	goAt         time.Time
	botTapAt     time.Time
	resultAt     time.Time
	winner       string
	times        map[string]int64
	closed       bool
	lastActivity time.Time
}

type player struct {
	ID          string
	Username    string
	DisplayName string
	IsBot       bool
	conn        *websocket.Conn
	send        chan []byte
	done        chan struct{}
	stopOnce    sync.Once
}

func newPlayer(id accountIdentity) *player {
	return &player{
		ID:          id.ID,
		Username:    id.Username,
		DisplayName: id.label(),
		send:        make(chan []byte, 128),
		done:        make(chan struct{}),
	}
}

func newBot(roomID string) *player {
	return &player{
		ID:          "bot-" + roomID,
		Username:    "Nakama Bot",
		DisplayName: "Nakama Bot",
		IsBot:       true,
		send:        make(chan []byte, 8),
		done:        make(chan struct{}),
	}
}

func (p *player) label() string {
	if p.DisplayName != "" {
		return p.DisplayName
	}
	return p.Username
}

func (p *player) stop() {
	p.stopOnce.Do(func() {
		close(p.done)
		if p.conn != nil {
			_ = p.conn.Close()
		}
	})
}

func (p *player) push(v any) {
	if p.IsBot {
		return
	}
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case p.send <- b:
	case <-p.done:
	default:
		// Slow client: drop it rather than stalling the room tick.
		go p.stop()
	}
}

func (p *player) writePump() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-p.done:
			return
		case msg := <-p.send:
			_ = p.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := p.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				p.stop()
				return
			}
		case <-ticker.C:
			_ = p.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := p.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				p.stop()
				return
			}
		}
	}
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

func (g *GameServer) handleWS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			token = strings.TrimSpace(auth[7:])
		}
	}
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "missing Nakama session token"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	account, err := g.validateSession(ctx, token)
	cancel()
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid Nakama session", "detail": err.Error()})
		return
	}

	mode := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("mode")))
	if mode != "pvp" {
		mode = "bot"
	}
	code := sanitizeRoomCode(r.URL.Query().Get("room"))
	if code == "" {
		code = randomRoomCode()
	}

	conn, err := g.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("game websocket upgrade: %v", err)
		return
	}

	p := newPlayer(account)
	p.conn = conn
	rm, err := g.joinRoom(p, mode, code)
	if err != nil {
		_ = conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
		_ = conn.WriteJSON(map[string]any{"type": "error", "message": err.Error()})
		_ = conn.Close()
		return
	}

	go p.writePump()

	defer func() {
		g.leaveRoom(rm, p)
		p.stop()
	}()

	conn.SetReadLimit(16 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(75 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(75 * time.Second))
	})

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(75 * time.Second))
		var msg struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			p.push(map[string]any{"type": "error", "message": "invalid JSON message"})
			continue
		}
		switch msg.Type {
		case "tap":
			g.tap(rm, p)
		case "ping":
			p.push(map[string]any{"type": "pong", "at": time.Now().UnixMilli()})
		case "rematch":
			g.rematch(rm)
		default:
			p.push(map[string]any{"type": "error", "message": "unknown message type"})
		}
	}
}

func (g *GameServer) handleRoomCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET or POST required"})
		return
	}
	code := randomRoomCode()
	writeJSON(w, http.StatusOK, map[string]any{
		"room":     code,
		"join_url": "/go/ws?mode=pvp&room=" + url.QueryEscape(code),
		"hint":     "Share this code with a second player. Both clients must use the same Nakama server.",
	})
}

func (g *GameServer) handleRooms(w http.ResponseWriter, r *http.Request) {
	type roomInfo struct {
		ID      string   `json:"id"`
		Mode    string   `json:"mode"`
		State   string   `json:"state"`
		Players []string `json:"players"`
		Humans  int      `json:"humans"`
		Winner  string   `json:"winner,omitempty"`
	}
	g.roomsMu.Lock()
	ids := make([]string, 0, len(g.rooms))
	for id := range g.rooms {
		ids = append(ids, id)
	}
	g.roomsMu.Unlock()

	out := make([]roomInfo, 0, len(ids))
	for _, id := range ids {
		g.roomsMu.Lock()
		rm := g.rooms[id]
		g.roomsMu.Unlock()
		if rm == nil {
			continue
		}
		rm.mu.Lock()
		info := roomInfo{ID: rm.ID, Mode: rm.Mode, State: rm.state, Winner: rm.winner}
		for _, p := range rm.players {
			info.Players = append(info.Players, p.label())
			if !p.IsBot {
				info.Humans++
			}
		}
		rm.mu.Unlock()
		out = append(out, info)
	}
	writeJSON(w, http.StatusOK, map[string]any{"rooms": out, "count": len(out)})
}

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------

func (g *GameServer) joinRoom(p *player, mode, code string) (*room, error) {
	key := mode + ":" + code
	g.roomsMu.Lock()
	rm := g.rooms[key]
	if rm == nil {
		rm = &room{
			ID:           code,
			Mode:         mode,
			gs:           g,
			players:      make(map[string]*player),
			state:        "waiting",
			times:        make(map[string]int64),
			lastActivity: time.Now(),
		}
		g.rooms[key] = rm
		go rm.run(g)
	}
	g.roomsMu.Unlock()

	rm.mu.Lock()
	defer rm.mu.Unlock()
	if rm.closed {
		return nil, fmt.Errorf("room is closed")
	}
	if rm.Mode != mode {
		return nil, fmt.Errorf("room mode mismatch")
	}
	if mode == "pvp" {
		if len(rm.players) >= 2 {
			return nil, fmt.Errorf("room is full")
		}
		for _, existing := range rm.players {
			if existing.ID == p.ID {
				return nil, fmt.Errorf("this Nakama account is already in the room; use New Identity in the second tab")
			}
		}
	} else {
		if rm.humanCountLocked() >= 1 {
			return nil, fmt.Errorf("bot room is full")
		}
		if rm.players["bot-"+rm.ID] == nil {
			rm.players["bot-"+rm.ID] = newBot(rm.ID)
		}
	}
	rm.players[p.ID] = p
	rm.lastActivity = time.Now()

	p.push(map[string]any{
		"type":     "hello",
		"room":     rm.ID,
		"mode":     rm.Mode,
		"protocol": 1,
		"self":     map[string]any{"id": p.ID, "username": p.Username, "display_name": p.DisplayName},
		"players":  rm.playersLocked(),
	})
	rm.pushAllLocked(map[string]any{"type": "peer_joined", "player": map[string]any{"id": p.ID, "username": p.Username, "display_name": p.DisplayName}})
	rm.pushAllLocked(rm.waitingMessageLocked())
	return rm, nil
}

func (g *GameServer) leaveRoom(rm *room, p *player) {
	rm.mu.Lock()
	if rm.players[p.ID] == nil {
		rm.mu.Unlock()
		return
	}
	delete(rm.players, p.ID)
	rm.lastActivity = time.Now()

	if rm.humanCountLocked() == 0 {
		rm.closed = true
		for _, other := range rm.players {
			other.push(map[string]any{"type": "room_closed", "message": "room closed"})
		}
		rm.mu.Unlock()
		g.roomsMu.Lock()
		delete(g.rooms, rm.Mode+":"+rm.ID)
		g.roomsMu.Unlock()
		return
	}

	rm.pushAllLocked(map[string]any{"type": "peer_left", "player": map[string]any{"id": p.ID, "username": p.Username, "display_name": p.DisplayName}})

	if rm.Mode == "pvp" && rm.state == "live" && rm.winner == "" {
		remaining := rm.firstHumanLocked()
		if remaining != nil {
			rm.finishLocked(remaining.ID, 0, "opponent disconnected", time.Now())
		}
	} else if rm.state == "countdown" {
		rm.state = "waiting"
		rm.countdownEnd = time.Time{}
		rm.pushAllLocked(rm.waitingMessageLocked())
	}
	rm.mu.Unlock()
}

func (g *GameServer) tap(rm *room, p *player) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if rm.state != "live" || rm.winner != "" {
		p.push(map[string]any{"type": "early", "message": "Tap ignored: wait for GO"})
		return
	}
	ms := time.Since(rm.goAt).Milliseconds()
	if ms < 0 {
		p.push(map[string]any{"type": "early", "message": "False start"})
		return
	}
	rm.finishLocked(p.ID, ms, "tap", time.Now())
}

func (g *GameServer) rematch(rm *room) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if rm.state == "result" {
		rm.resetLocked(time.Now())
	}
}

func (rm *room) run(g *GameServer) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		rm.mu.Lock()
		if rm.closed {
			rm.mu.Unlock()
			return
		}
		now := time.Now()

		switch rm.state {
		case "waiting":
			if rm.humanCountLocked() >= rm.requiredHumans() {
				rm.startCountdownLocked(now)
			}
			if now.Sub(rm.lastActivity) > 30*time.Minute {
				rm.closed = true
				rm.mu.Unlock()
				g.roomsMu.Lock()
				delete(g.rooms, rm.Mode+":"+rm.ID)
				g.roomsMu.Unlock()
				return
			}
		case "countdown":
			if !now.Before(rm.countdownEnd) {
				rm.startLiveLocked(now)
			}
		case "live":
			if rm.winner == "" && !rm.botTapAt.IsZero() && now.After(rm.botTapAt) {
				bot := rm.players["bot-"+rm.ID]
				if bot != nil {
					rm.finishLocked(bot.ID, rm.botTapAt.Sub(rm.goAt).Milliseconds(), "bot tap", now)
				}
			}
			if rm.winner == "" && now.Sub(rm.goAt) > 10*time.Second {
				rm.finishLocked("", 0, "timeout", now)
			}
		case "result":
			if now.Sub(rm.resultAt) > 6*time.Second {
				rm.resetLocked(now)
			}
		}
		rm.mu.Unlock()
	}
}

func (rm *room) requiredHumans() int {
	if rm.Mode == "pvp" {
		return 2
	}
	return 1
}

func (rm *room) humanCountLocked() int {
	n := 0
	for _, p := range rm.players {
		if !p.IsBot {
			n++
		}
	}
	return n
}

func (rm *room) firstHumanLocked() *player {
	for _, p := range rm.players {
		if !p.IsBot {
			return p
		}
	}
	return nil
}

func (rm *room) playersLocked() []map[string]any {
	out := make([]map[string]any, 0, len(rm.players))
	for _, p := range rm.players {
		out = append(out, map[string]any{
			"id":           p.ID,
			"username":     p.Username,
			"display_name": p.DisplayName,
			"bot":          p.IsBot,
		})
	}
	return out
}

func (rm *room) baseMessageLocked(kind string) map[string]any {
	return map[string]any{
		"type":    kind,
		"room":    rm.ID,
		"mode":    rm.Mode,
		"state":   rm.state,
		"players": rm.playersLocked(),
		"need":    max(0, rm.requiredHumans()-rm.humanCountLocked()),
	}
}

func (rm *room) waitingMessageLocked() map[string]any {
	msg := rm.baseMessageLocked("waiting")
	msg["message"] = "Waiting for players"
	return msg
}

func (rm *room) startCountdownLocked(now time.Time) {
	rm.state = "countdown"
	rm.countdownEnd = now.Add(3 * time.Second)
	msg := rm.baseMessageLocked("countdown")
	msg["in_ms"] = 3000
	rm.pushAllLocked(msg)
}

func (rm *room) startLiveLocked(now time.Time) {
	rm.state = "live"
	rm.goAt = now
	rm.winner = ""
	rm.times = make(map[string]int64)
	msg := rm.baseMessageLocked("go")
	msg["at"] = now.UnixMilli()
	rm.pushAllLocked(msg)

	if rm.Mode == "bot" {
		// The bot never false-starts, but it is deliberately beatable.
		delay := time.Duration(180+mathrand.Intn(270)) * time.Millisecond
		rm.botTapAt = now.Add(delay)
	}
}

func (rm *room) finishLocked(winnerID string, ms int64, reason string, now time.Time) {
	if rm.state == "result" {
		return
	}
	rm.state = "result"
	rm.winner = winnerID
	rm.resultAt = now
	if winnerID != "" && ms > 0 {
		rm.times[winnerID] = ms
	}

	times := make(map[string]int64, len(rm.times))
	for id, ms := range rm.times {
		times[id] = ms
	}

	msg := rm.baseMessageLocked("result")
	msg["winner"] = winnerID
	msg["winner_name"] = rm.playerNameLocked(winnerID)
	msg["times"] = times
	msg["reason"] = reason
	rm.pushAllLocked(msg)

	var botName string
	if bot := rm.players["bot-"+rm.ID]; bot != nil {
		botName = bot.label()
	}

	// Snapshot everything the submission goroutine needs. The room lock is
	// released as soon as finishLocked returns, and a rematch may reset
	// rm.times while the Go -> Nakama RPCs are still in flight.
	jobs := make([]matchResult, 0, 2)
	for id, p := range rm.players {
		if p.IsBot {
			continue
		}
		opponent := botName
		for oid, op := range rm.players {
			if oid != id && !op.IsBot {
				opponent = op.label()
			}
		}
		jobs = append(jobs, matchResult{
			UserID:   p.ID,
			Username: p.Username,
			Opponent: opponent,
			MS:       times[id],
			Won:      winnerID == id,
			Room:     rm.ID,
		})
	}
	if len(jobs) > 0 {
		go rm.gs.submitResults(jobs)
	}
}

type matchResult struct {
	UserID   string
	Username string
	Opponent string
	Room     string
	MS       int64
	Won      bool
}

func (g *GameServer) submitResults(jobs []matchResult) {
	for _, job := range jobs {
		payload := map[string]any{
			"user_id":  job.UserID,
			"username": job.Username,
			"ms":       job.MS,
			"won":      job.Won,
			"room":     job.Room,
			"opponent": job.Opponent,
			"game":     "reaction",
		}
		if err := g.submitResult(payload); err != nil {
			log.Printf("submit result room=%s user=%s: %v", job.Room, job.Username, err)
		}
	}
}

func (rm *room) playerNameLocked(id string) string {
	if p := rm.players[id]; p != nil {
		return p.label()
	}
	if bot := rm.players["bot-"+rm.ID]; bot != nil && id == bot.ID {
		return bot.label()
	}
	return ""
}

func (rm *room) resetLocked(now time.Time) {
	if rm.closed {
		return
	}
	rm.state = "waiting"
	rm.winner = ""
	rm.times = make(map[string]int64)
	rm.goAt = time.Time{}
	rm.botTapAt = time.Time{}
	rm.resultAt = time.Time{}
	rm.lastActivity = now
	rm.pushAllLocked(rm.waitingMessageLocked())
}

func (rm *room) pushAllLocked(v any) {
	for _, p := range rm.players {
		p.push(v)
	}
}

// ---------------------------------------------------------------------------
// Nakama session validation + privileged result submission
// ---------------------------------------------------------------------------

func (g *GameServer) validateSession(ctx context.Context, token string) (accountIdentity, error) {
	g.tokensMu.Lock()
	if entry, ok := g.tokens[token]; ok && time.Now().Before(entry.expires) {
		g.tokensMu.Unlock()
		return entry.account, nil
	}
	g.tokensMu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.cfg.NakamaURL+"/v2/account", nil)
	if err != nil {
		return accountIdentity{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := g.client.Do(req)
	if err != nil {
		return accountIdentity{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return accountIdentity{}, fmt.Errorf("nakama returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var acct struct {
		User struct {
			ID          string `json:"id"`
			Username    string `json:"username"`
			DisplayName string `json:"display_name"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&acct); err != nil {
		return accountIdentity{}, err
	}
	if acct.User.ID == "" {
		return accountIdentity{}, fmt.Errorf("nakama account response missing user id")
	}

	id := accountIdentity{ID: acct.User.ID, Username: acct.User.Username, DisplayName: acct.User.DisplayName}
	g.tokensMu.Lock()
	if len(g.tokens) > 4096 {
		g.tokens = make(map[string]tokenEntry)
	}
	g.tokens[token] = tokenEntry{account: id, expires: time.Now().Add(60 * time.Second)}
	g.tokensMu.Unlock()
	return id, nil
}

func (g *GameServer) submitResult(payload map[string]any) error {
	payload["secret"] = g.cfg.Secret
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(string(raw))
	if err != nil {
		return err
	}

	endpoint := g.cfg.NakamaURL + "/v2/rpc/showcase_result?http_key=" + url.QueryEscape(g.cfg.HTTPKey)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := g.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("nakama rpc %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	return nil
}

func (g *GameServer) stats() (rooms, players int) {
	g.roomsMu.Lock()
	list := make([]*room, 0, len(g.rooms))
	for _, r := range g.rooms {
		list = append(list, r)
	}
	g.roomsMu.Unlock()
	for _, r := range list {
		r.mu.Lock()
		rooms++
		players += r.humanCountLocked()
		r.mu.Unlock()
	}
	return rooms, players
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func randomRoomCode() string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("room%d", time.Now().UnixNano()%1_000_000)
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

func sanitizeRoomCode(code string) string {
	code = strings.ToLower(strings.TrimSpace(code))
	var b strings.Builder
	for _, r := range code {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
		if b.Len() >= 32 {
			break
		}
	}
	return b.String()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
