package opencode

import (
	"context"
	"fmt"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/sst/opencode-sdk-go"
	"github.com/sst/opencode-sdk-go/option"
)

type Config struct {
	BaseURL string
}

func DefaultConfig() Config {
	return Config{
		BaseURL: "http://localhost:4096",
	}
}

type Client struct {
	sdk       *opencode.Client
	config    Config
	sessionID string
	ctx       context.Context
	cancel    context.CancelFunc
	connected bool
}

func NewClient(cfg Config) (*Client, error) {
	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultConfig().BaseURL
	}

	ctx, cancel := context.WithCancel(context.Background())

	sdk := opencode.NewClient(
		option.WithBaseURL(cfg.BaseURL),
	)

	return &Client{
		sdk:    sdk,
		config: cfg,
		ctx:    ctx,
		cancel: cancel,
	}, nil
}

func (c *Client) EnsureSession() error {
	const maxRetries = 3
	const retryDelay = time.Second

	if c.sessionID != "" {
		_, err := c.sdk.Session.Get(c.ctx, c.sessionID, opencode.SessionGetParams{})
		if err == nil {
			c.connected = true
			return nil
		}
		c.sessionID = ""
		c.connected = false
	}

	var lastErr error
	for i := 0; i < maxRetries; i++ {
		if i > 0 {
			time.Sleep(retryDelay)
		}

		title := fmt.Sprintf("Algopeeps Council - %s", time.Now().Format("2006-01-02"))
		session, err := c.sdk.Session.New(c.ctx, opencode.SessionNewParams{
			Title: opencode.F(title),
		})
		if err != nil {
			lastErr = err
			continue
		}

		c.sessionID = session.ID
		c.connected = true
		return nil
	}

	c.connected = false
	return fmt.Errorf("failed to create session after %d retries: %w", maxRetries, lastErr)
}

func (c *Client) IsConnected() bool {
	return c.connected
}

func (c *Client) SessionID() string {
	return c.sessionID
}

func (c *Client) SendPrompt(agent, prompt string) error {
	if c.sessionID == "" {
		return fmt.Errorf("no session available, call EnsureSession first")
	}

	params := opencode.SessionPromptParams{
		Agent: opencode.F(agent),
		Parts: opencode.F([]opencode.SessionPromptParamsPartUnion{
			opencode.TextPartInputParam{
				Text: opencode.F(prompt),
			},
		}),
	}

	_, err := c.sdk.Session.Prompt(c.ctx, c.sessionID, params)
	if err != nil {
		return fmt.Errorf("failed to send prompt: %w", err)
	}

	return nil
}

type AgentTextMsg struct {
	Agent string
	Text  string
}

type AgentIdleMsg struct {
	Agent string
}

func (c *Client) SubscribeEvents(ctx context.Context, program *tea.Program) error {
	if c.sessionID == "" {
		return fmt.Errorf("no session available, call EnsureSession first")
	}

	streamCtx, streamCancel := context.WithCancel(ctx)
	defer streamCancel()

	stream := c.sdk.Event.ListStreaming(streamCtx, opencode.EventListParams{})

	for stream.Next() {
		event := stream.Current()

		switch event.Type {
		case opencode.EventListResponseTypeMessagePartUpdated:
			if partEvent, ok := event.AsUnion().(opencode.EventListResponseEventMessagePartUpdated); ok {
				agentName := c.extractAgentName(partEvent.Properties.Part)

				if partEvent.Properties.Delta != "" {
					program.Send(AgentTextMsg{
						Agent: agentName,
						Text:  partEvent.Properties.Delta,
					})
				}
			}

		case opencode.EventListResponseTypeSessionIdle:
			if idleEvent, ok := event.AsUnion().(opencode.EventListResponseEventSessionIdle); ok {
				if idleEvent.Properties.SessionID == c.sessionID {
					program.Send(AgentIdleMsg{Agent: "code-reviewer"})
					program.Send(AgentIdleMsg{Agent: "bug-spotter"})
				}
			}
		}
	}

	if err := stream.Err(); err != nil {
		return fmt.Errorf("stream error: %w", err)
	}

	return nil
}

func (c *Client) extractAgentName(part opencode.Part) string {
	if part.Source != nil {
		if agentSource, ok := part.Source.(opencode.AgentPartSource); ok {
			return agentSource.Value
		}
	}

	return "unknown"
}

func (c *Client) Close() error {
	if c.cancel != nil {
		c.cancel()
	}
	return nil
}
