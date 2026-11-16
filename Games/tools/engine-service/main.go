// The MoonGames engine service.
//
// The engine is a program that says what a position is worth. Lichess runs
// those on its own analysis servers, and the client asks them over the
// network, so the engine never has to run inside the phone.
//
// This is the same shape: a client sends the position and the search it
// wants, and the answer comes back as a stream of lines, each one an
// evaluation that is a little deeper than the last.
//
// The engine itself is Stockfish, spoken to over its own protocol (UCI).
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The request the client sends, the same as the one lichess sends.
type analyseRequest struct {
	ClientSecret string `json:"clientSecret"`
	Work         work   `json:"work"`
}

type work struct {
	SessionID  string   `json:"sessionId"`
	Threads    int      `json:"threads"`
	Hash       int      `json:"hash"`
	MultiPv    int      `json:"multiPv"`
	Variant    string   `json:"variant"`
	InitialFen string   `json:"initialFen"`
	Moves      []string `json:"moves"`
	// The search: by depth, by movetime, or by nodes.
	By    string `json:"by"`
	Value int    `json:"value"`
}

// One line of the answer.
type output struct {
	Keepalive bool    `json:"keepalive,omitempty"`
	Time      int64   `json:"time,omitempty"`
	Depth     int     `json:"depth,omitempty"`
	Nodes     int64   `json:"nodes,omitempty"`
	Bestmove  string  `json:"bestmove,omitempty"`
	Ponder    string  `json:"ponder,omitempty"`
	Pvs       []pvOut `json:"pvs,omitempty"`
}

type pvOut struct {
	Depth int      `json:"depth"`
	CP    *int     `json:"cp,omitempty"`
	Mate  *int     `json:"mate,omitempty"`
	Moves []string `json:"moves,omitempty"`
}

func main() {
	address := envOr("MOONGAMES_ENGINE_ADDRESS", "127.0.0.1:7352")
	enginePath := envOr("MOONGAMES_ENGINE_PATH", "stockfish")
	secret := os.Getenv("MOONGAMES_ENGINE_SECRET")

	pool := newPool(enginePath)
	defer pool.close()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/external-engine/", func(w http.ResponseWriter, r *http.Request) {
		serveAnalyse(w, r, pool, secret)
	})
	mux.HandleFunc("/healthcheck", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})

	log.Printf("the engine service is listening on %s", address)
	server := &http.Server{
		Addr:              address,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("the engine service stopped: %v", err)
	}
}

func envOr(name string, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

// The analysis of one position.
func serveAnalyse(w http.ResponseWriter, r *http.Request, pool *pool, secret string) {
	if r.Method != http.MethodPost {
		http.Error(w, "only a post is wanted here", http.StatusMethodNotAllowed)
		return
	}

	var request analyseRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "the request could not be read", http.StatusBadRequest)
		return
	}

	if secret != "" && request.ClientSecret != secret {
		http.Error(w, "the client is not known here", http.StatusUnauthorized)
		return
	}

	if request.Work.InitialFen == "" {
		http.Error(w, "the position is missing", http.StatusBadRequest)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "the answer cannot be streamed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)

	encoder := json.NewEncoder(w)
	engine, err := pool.acquire(r.Context())
	if err != nil {
		encoder.Encode(output{Keepalive: false})
		return
	}
	defer pool.release(engine)

	lines := make(chan output, 64)
	go engine.analyse(request.Work, lines)

	encoder.Encode(output{Keepalive: true})
	flusher.Flush()

	keepalive := time.NewTicker(3 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case line, open := <-lines:
			if !open {
				return
			}
			if err := encoder.Encode(line); err != nil {
				return
			}
			flusher.Flush()
		case <-keepalive.C:
			if err := encoder.Encode(output{Keepalive: true}); err != nil {
				return
			}
			flusher.Flush()
		case <-r.Context().Done():
			engine.stop()
			return
		}
	}
}

// One engine, owned by the pool.
type engine struct {
	path string
	cmd  *exec.Cmd
	in   io.WriteCloser
	out  *bufio.Reader
	mu   sync.Mutex
}

func newEngine(path string) (*engine, error) {
	cmd := exec.Command(path)
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return &engine{path: path, cmd: cmd, in: in, out: bufio.NewReader(out)}, nil
}

func (e *engine) close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.in != nil {
		e.in.Close()
	}
	if e.cmd != nil && e.cmd.Process != nil {
		e.cmd.Process.Kill()
		e.cmd.Wait()
	}
}

func (e *engine) send(command string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.in == nil {
		return errors.New("the engine is gone")
	}
	_, err := e.in.Write([]byte(command + "\n"))
	return err
}

func (e *engine) stop() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.in != nil {
		e.in.Write([]byte("stop\n"))
	}
}

// The analysis of one position, read from the engine.
func (e *engine) analyse(job work, out chan<- output) {
	defer close(out)

	threads := job.Threads
	if threads < 1 {
		threads = 1
	}
	hash := job.Hash
	if hash < 1 {
		hash = 16
	}
	multiPv := job.MultiPv
	if multiPv < 1 {
		multiPv = 1
	}

	e.send("uci")
	e.send(fmt.Sprintf("setoption name Threads value %d", threads))
	e.send(fmt.Sprintf("setoption name Hash value %d", hash))
	e.send(fmt.Sprintf("setoption name MultiPV value %d", multiPv))
	e.send("ucinewgame")
	e.send("isready")

	position := "position fen " + job.InitialFen
	if len(job.Moves) > 0 {
		position += " moves " + strings.Join(job.Moves, " ")
	}
	e.send(position)

	switch job.By {
	case "movetime":
		e.send(fmt.Sprintf("go movetime %d", job.Value))
	case "nodes":
		e.send(fmt.Sprintf("go nodes %d", job.Value))
	default:
		e.send(fmt.Sprintf("go depth %d", job.Value))
	}

	started := time.Now()
	depth := 0
	nodes := int64(0)
	pvs := map[int]pvOut{}
	order := []int{}
	expected := multiPv

	for {
		line, err := e.out.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		switch parts[0] {
		case "info":
			if len(parts) > 1 && parts[1] == "string" {
				continue
			}
			parsed, ok := parseInfo(parts, expected)
			if !ok {
				continue
			}
			depth = parsed.depth
			nodes = parsed.nodes
			if _, seen := pvs[parsed.multiPv]; !seen {
				order = append(order, parsed.multiPv)
			}
			pvs[parsed.multiPv] = pvOut{
				Depth: parsed.depth,
				CP:    parsed.cp,
				Mate:  parsed.mate,
				Moves: parsed.moves,
			}
			if len(order) < expected {
				continue
			}
			list := make([]pvOut, 0, len(order))
			for _, index := range order {
				if pv, ok := pvs[index]; ok {
					list = append(list, pv)
				}
			}
			out <- output{
				Time:  time.Since(started).Milliseconds(),
				Depth: depth,
				Nodes: nodes,
				Pvs:   list,
			}
		case "bestmove":
			best := ""
			ponder := ""
			if len(parts) > 1 {
				best = parts[1]
			}
			if len(parts) > 3 && parts[2] == "ponder" {
				ponder = parts[3]
			}
			out <- output{
				Time:     time.Since(started).Milliseconds(),
				Depth:    depth,
				Nodes:    nodes,
				Bestmove: best,
				Ponder:   ponder,
			}
			return
		}
	}
}

type infoLine struct {
	depth   int
	nodes   int64
	multiPv int
	cp      *int
	mate    *int
	moves   []string
}

// The reading of one line of the engine's talk, the same way lichess reads
// it.
func parseInfo(parts []string, expected int) (infoLine, bool) {
	parsed := infoLine{multiPv: 1}
	score := false
	scoreIsMate := false
	scoreValue := 0

	for index := 1; index < len(parts); index++ {
		switch parts[index] {
		case "depth":
			index++
			if index < len(parts) {
				parsed.depth, _ = strconv.Atoi(parts[index])
			}
		case "nodes":
			index++
			if index < len(parts) {
				parsed.nodes, _ = strconv.ParseInt(parts[index], 10, 64)
			}
		case "multipv":
			index++
			if index < len(parts) {
				parsed.multiPv, _ = strconv.Atoi(parts[index])
			}
		case "score":
			index++
			if index >= len(parts) {
				return parsed, false
			}
			scoreIsMate = parts[index] == "mate"
			index++
			if index >= len(parts) {
				return parsed, false
			}
			scoreValue, _ = strconv.Atoi(parts[index])
			score = true
		case "pv":
			parsed.moves = parts[index+1:]
			index = len(parts)
		}
	}

	if !score || parsed.depth == 0 {
		return parsed, false
	}
	// A checkmate of zero is no checkmate at all.
	if scoreIsMate && scoreValue == 0 {
		return parsed, false
	}
	if parsed.multiPv > expected {
		return parsed, false
	}

	if scoreIsMate {
		mate := scoreValue
		parsed.mate = &mate
	} else {
		cp := scoreValue
		parsed.cp = &cp
	}

	return parsed, true
}

// The engines, kept for the players that ask for them.
type pool struct {
	path    string
	mu      sync.Mutex
	idle    []*engine
	waiting chan *engine
	closed  bool
}

func newPool(path string) *pool {
	return &pool{path: path, waiting: make(chan *engine, 8)}
}

func (p *pool) acquire(ctx context.Context) (*engine, error) {
	p.mu.Lock()
	if !p.closed && len(p.idle) > 0 {
		engine := p.idle[len(p.idle)-1]
		p.idle = p.idle[:len(p.idle)-1]
		p.mu.Unlock()
		return engine, nil
	}
	p.mu.Unlock()

	// An engine that is not waiting for anyone starts a new one.
	select {
	case engine := <-p.waiting:
		return engine, nil
	default:
	}

	engine, err := newEngine(p.path)
	if err != nil {
		return nil, err
	}
	return engine, nil
}

func (p *pool) release(engine *engine) {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		engine.close()
		return
	}
	p.idle = append(p.idle, engine)
	p.mu.Unlock()
	select {
	case p.waiting <- engine:
	default:
	}
}

func (p *pool) close() {
	p.mu.Lock()
	p.closed = true
	idle := p.idle
	p.idle = nil
	p.mu.Unlock()
	for _, engine := range idle {
		engine.close()
	}
}
