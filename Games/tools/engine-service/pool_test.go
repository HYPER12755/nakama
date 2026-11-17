package main

import (
	"context"
	"testing"
)

// A fake engine is enough to check who owns an engine; no Stockfish needed.
func TestPoolNeverHandsTheSameEngineTwice(t *testing.T) {
	// An empty path makes newEngine fail, so seed the pool with stand-ins.
	p := &pool{
		path:      "/no/such/engine",
		available: make(chan *engine, 8),
		all:       make(map[*engine]struct{}),
	}
	a := &engine{}
	b := &engine{}
	p.all[a] = struct{}{}
	p.all[b] = struct{}{}
	p.available <- a
	p.available <- b

	first, err := p.acquire(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	second, err := p.acquire(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("the same engine was given to two requests")
	}

	p.release(first)
	p.release(second)

	// Each engine must be back exactly once. A duplicate would be the bug
	// that tangled two concurrent analyses together.
	seen := map[*engine]int{}
	for i := 0; i < 2; i++ {
		e := <-p.available
		seen[e]++
	}
	if seen[a] != 1 || seen[b] != 1 {
		t.Fatalf("engines came back more than once: %v", seen)
	}
}

func TestPoolCloseIsSafeTwice(t *testing.T) {
	p := &pool{
		path:      "/no/such/engine",
		available: make(chan *engine, 8),
		all:       make(map[*engine]struct{}),
	}
	p.close()
	p.close()
}
