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
	// The kind of game the analysis is for: "local" or "online".
	Mode string `json:"mode"`
}

// The service, and where it keeps the things it needs.
type service struct {
	enginePath string
	nakamaURL  string
	httpClient *http.Client
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
	nakamaURL := envOr("MOONGAMES_NAKAMA_URL", "http://127.0.0.1:7350")

	pool := newPool(enginePath)
	defer pool.close()

	current := &service{
		enginePath: enginePath,
		nakamaURL:  strings.TrimSuffix(nakamaURL, "/"),
		httpClient: theSharedClient,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/external-engine/", func(w http.ResponseWriter, r *http.Request) {
		serveAnalyse(w, r, pool, secret, current)
	})
	mux.HandleFunc("/api/engine/access", func(w http.ResponseWriter, r *http.Request) {
		current.serveAccess(w, r)
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
func serveAnalyse(
	w http.ResponseWriter,
	r *http.Request,
	pool *pool,
	secret string,
	current *service,
) {
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

	// The engine is for the games against yourself, and for the accounts
	// that were named. In a game against a person it is only for those.
	if !current.mayUseEngine(r.Context(), r, request.Mode) {
		http.Error(
			w,
			"the engine is not allowed in this game",
			http.StatusForbidden,
		)
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
	// The worker must not outlive this request. If the client goes away while
	// the worker is blocked sending a line, that worker keeps reading the
	// engine's stdout. Reusing the engine then splits its bestmove between two
	// requests, and the new one waits forever. A done channel lets the worker
	// leave, and finished tells us when it has really gone.
	done := make(chan struct{})
	finished := make(chan struct{})
	go engine.analyse(request.Work, lines, done, finished)
	var stopOnce sync.Once
	stopWorker := func() {
		stopOnce.Do(func() {
			engine.stop()
			close(done)
		})
		select {
		case <-finished:
		case <-time.After(500 * time.Millisecond):
			engine.kill()
			<-finished
		}
	}
	// Every exit stops the worker before the engine goes back to the pool.
	defer stopWorker()

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

// kill stops the process at once. It is used when a worker did not leave in
// time after its request ended, so the engine cannot be handed on in a bad
// state.
func (e *engine) kill() {
	e.close()
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
//
// `done` is closed when the request that started this analysis ends. Every
// send watches it, so a worker blocked on a full channel can always leave.
// `finished` tells the caller when the worker has really gone.
func (e *engine) analyse(job work, out chan<- output, done <-chan struct{}, finished chan<- struct{}) {
	defer close(out)
	defer close(finished)

	// A line is offered to the request, or dropped when the request has gone.
	publish := func(line output) bool {
		select {
		case out <- line:
			return true
		case <-done:
			return false
		}
	}

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
			if !publish(output{
				Time:  time.Since(started).Milliseconds(),
				Depth: depth,
				Nodes: nodes,
				Pvs:   list,
			}) {
				return
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
			publish(output{
				Time:     time.Since(started).Milliseconds(),
				Depth:    depth,
				Nodes:    nodes,
				Bestmove: best,
				Ponder:   ponder,
			})
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
//
// An engine lives in exactly one place: it is held by one request, or it is
// in `available`. The old pool kept a pointer in both a slice and a channel,
// so two requests could be given the same process. Their UCI commands and
// stdout reads tangled together and one request never saw its bestmove.
type pool struct {
	path      string
	mu        sync.Mutex
	available chan *engine
	all       map[*engine]struct{}
	closed    bool
}

func newPool(path string) *pool {
	return &pool{
		path:      path,
		available: make(chan *engine, 8),
		all:       make(map[*engine]struct{}),
	}
}

func (p *pool) acquire(ctx context.Context) (*engine, error) {
	select {
	case engine := <-p.available:
		return engine, nil
	default:
	}

	engine, err := newEngine(p.path)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		engine.close()
		return nil, fmt.Errorf("the engine service is stopping")
	}
	p.all[engine] = struct{}{}
	p.mu.Unlock()
	return engine, nil
}

func (p *pool) release(engine *engine) {
	select {
	case p.available <- engine:
		return
	default:
	}
	// The pool is full: this process is of no further use.
	p.mu.Lock()
	delete(p.all, engine)
	p.mu.Unlock()
	engine.close()
}

func (p *pool) close() {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return
	}
	p.closed = true
	engines := make([]*engine, 0, len(p.all))
	for engine := range p.all {
		engines = append(engines, engine)
	}
	p.all = make(map[*engine]struct{})
	p.mu.Unlock()
	for _, engine := range engines {
		engine.close()
	}
}
