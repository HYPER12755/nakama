package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

// The engine is for the games against yourself and against the computer, and
// in a game against a person it is only for the accounts that were named.
func TestApprovedAccounts(t *testing.T) {
	// The list is set by the operator, not built into the program. Set it here
	// the way the environment would and check the normalising.
	engineApproved["player@example.com"] = true
	defer delete(engineApproved, "player@example.com")

	if !isApproved("player@example.com") {
		t.Fatal("the named account is not allowed to have the engine")
	}
	if isApproved("someone.else@example.com") {
		t.Fatal("an account that was not named is allowed")
	}
	if !isApproved("  PLAYER@example.com ") {
		t.Fatal("the address is not read the same way every time")
	}
	if strings.Contains(strings.Join(engineAccounts, ","), "hyper14917374") {
		t.Fatal("a personal address is built into the program")
	}
}

func TestMayUseEngine(t *testing.T) {
	current := &service{
		nakamaURL:  "",
		httpClient: theSharedClient,
	}

	// The games against yourself and against the computer are for practice,
	// so the engine is for them.
	for _, mode := range []string{"local", "ai"} {
		if !current.mayUseEngine(context.Background(), httptest.NewRequest("POST", "/", nil), mode) {
			t.Fatalf("the engine is not allowed in a %s game", mode)
		}
	}

	// A game against a person needs an account that was named.
	if current.mayUseEngine(context.Background(), httptest.NewRequest("POST", "/", nil), "online") {
		t.Fatal("the engine is allowed in an online game without an account")
	}
}

func TestBearerToken(t *testing.T) {
	request := httptest.NewRequest("POST", "/", nil)
	if bearerToken(request) != "" {
		t.Fatal("a request without a session has a token")
	}

	request.Header.Set("Authorization", "Bearer abc123")
	if bearerToken(request) != "abc123" {
		t.Fatalf("the token was not read: %q", bearerToken(request))
	}

	request.Header.Set("Authorization", "bearer abc456")
	if bearerToken(request) != "abc456" {
		t.Fatalf("the token was not read: %q", bearerToken(request))
	}
}
