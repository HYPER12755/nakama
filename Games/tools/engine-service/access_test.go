package main

import (
	"context"
	"net/http/httptest"
	"testing"
)

// The engine is for the games against yourself and against the computer, and
// in a game against a person it is only for the accounts that were named.
func TestApprovedAccounts(t *testing.T) {
	if !isApproved("hyper14917374@gmail.com") {
		t.Fatal("the named account is not allowed to have the engine")
	}
	if isApproved("someone.else@example.com") {
		t.Fatal("an account that was not named is allowed")
	}
	if !isApproved("HYPER14917374@GMAIL.COM") {
		t.Fatal("the address is not read the same way every time")
	}
}

func TestMayUseEngine(t *testing.T) {
	current := &service{
		nakamaURL:  "",
		httpClient: theSharedClient,
	}

	// The games against yourself and against the computer need no account.
	for _, mode := range []string{"local", "ai", ""} {
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
