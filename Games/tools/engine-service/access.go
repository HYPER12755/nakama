package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

// The accounts that may use the engine while they play against a person.
//
// The engine says what a position is worth, and that is no use against
// yourself, but against a person it would be cheating. So the engine is
// hidden in an online game, and only the accounts named here may have it.
//
// The list lives here, on the server, and the address of an account is
// checked against it with the account itself, so nobody can claim to be
// someone else.
//
// The addresses are kept here for now. When the games are open to everyone,
// this list goes away and the rule becomes that the engine is only for the
// games against yourself.
var engineAccounts = []string{
	"hyper14917374@gmail.com",
}

// The emails that may use the engine against a person.
var engineApproved = map[string]bool{}

func init() {
	for _, address := range engineAccounts {
		engineApproved[strings.ToLower(strings.TrimSpace(address))] = true
	}
}

// isApproved tells whether the account may use the engine against a person.
func isApproved(email string) bool {
	return engineApproved[strings.ToLower(strings.TrimSpace(email))]
}

// The account of the caller, read from the server of the games.
//
// The token is the one the player signed in with, so the address that comes
// back is the real one and not something the player wrote.
func (s *service) accountEmail(ctx context.Context, token string) (string, error) {
	if token == "" {
		return "", errors.New("no session")
	}
	if s.nakamaURL == "" {
		return "", errors.New("the server of the games is not known")
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		s.nakamaURL+"/v2/account",
		nil,
	)
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+token)

	response, err := s.httpClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return "", errors.New("the session was not accepted")
	}

	var account struct {
		Email string `json:"email"`
		User  struct {
			ID       string `json:"id"`
			Username string `json:"username"`
		} `json:"user"`
	}
	if err := json.NewDecoder(response.Body).Decode(&account); err != nil {
		return "", err
	}
	if account.Email == "" {
		return "", errors.New("the account has no address")
	}
	return account.Email, nil
}

// mayUseEngine tells whether the caller may have the engine.
//
// The engine is for the games against yourself and against the computer,
// which is what a practice game is for. In a game against a person it would
// be cheating, so it is only for the accounts that were named.
func (s *service) mayUseEngine(ctx context.Context, r *http.Request, mode string) bool {
	if mode != "online" {
		return true
	}

	token := bearerToken(r)
	if token == "" {
		return false
	}

	email, err := s.accountEmail(ctx, token)
	if err != nil {
		return false
	}
	return isApproved(email)
}

// The token of the caller, from the way the player signed in.
func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if header == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return strings.TrimSpace(header[len("bearer "):])
	}
	return ""
}

// The answer to the question whether the engine may be used.
type accessResponse struct {
	Allowed bool `json:"allowed"`
}

// serveAccess tells the client whether the engine is allowed here.
//
// The client asks before it shows the engine, so the engine is hidden from
// the players who may not have it.
func (s *service) serveAccess(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	allowed := s.mayUseEngine(r.Context(), r, mode)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(accessResponse{Allowed: allowed})
}

// theSharedClient is the client the service uses to talk to the server.
var theSharedClient = &http.Client{Timeout: 10 * time.Second}
