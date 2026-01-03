package tui

import (
	"context"
	"fmt"
	"strings"

	"github.com/abhirupda/algopeeps/internal/opencode"
	"github.com/abhirupda/algopeeps/internal/tui/components"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type Model struct {
	width             int
	height            int
	ready             bool
	agents            map[string]string
	agentThinking     map[string]bool
	nvimConnected     bool
	openCodeConnected bool
	ocClient          *opencode.Client
	bufferFilename    string
	bufferFiletype    string
	bufferLine        int
	bufferCol         int
	bufferLines       int
	lastEvent         string
	lastError         string
}

func NewModel() Model {
	// Create OpenCode client
	client, err := opencode.NewClient(opencode.DefaultConfig())
	if err != nil {
		// Log error but continue - we can try to reconnect later
		client = nil
	}

	return Model{
		agents:        make(map[string]string),
		agentThinking: make(map[string]bool),
		ocClient:      client,
	}
}

func (m Model) Init() tea.Cmd {
	if m.ocClient != nil {
		return func() tea.Msg {
			if err := m.ocClient.EnsureSession(); err != nil {
				return ErrorMsg{Error: err, Context: "OpenCode session initialization"}
			}
			return ConnectionStatusMsg{Connected: true, Source: "opencode"}
		}
	}
	return nil
}

func (m *Model) StartSSESubscription(p *tea.Program) {
	if m.ocClient != nil {
		go func() {
			_ = m.ocClient.SubscribeEvents(context.Background(), p)
		}()
	}
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			if m.ocClient != nil {
				_ = m.ocClient.Close()
			}
			return m, tea.Quit
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ready = true
	case ConnectionStatusMsg:
		switch msg.Source {
		case "nvim":
			m.nvimConnected = msg.Connected
		case "opencode":
			m.openCodeConnected = msg.Connected
		}
	case ErrorMsg:
		m.lastError = fmt.Sprintf("%s: %v", msg.Context, msg.Error)
	case opencode.AgentTextMsg:
		if m.agents == nil {
			m.agents = make(map[string]string)
		}
		m.agents[msg.Agent] += msg.Text
		m.agentThinking[msg.Agent] = false
	case opencode.AgentIdleMsg:
		m.agentThinking[msg.Agent] = false
	case BufferEventMsg:
		m.bufferFilename = msg.Filename
		m.bufferFiletype = msg.Filetype
		m.bufferLine = msg.CursorLine
		m.bufferCol = msg.CursorCol
		m.bufferLines = msg.LineCount
		m.lastEvent = msg.LastEvent

		if m.ocClient != nil {
			go m.handleBufferEvent(msg)
		}
	}
	return m, nil
}

// handleBufferEvent processes buffer events and sends prompts to agents
func (m *Model) handleBufferEvent(msg BufferEventMsg) {
	// Ensure session exists
	if err := m.ocClient.EnsureSession(); err != nil {
		return
	}

	// Truncate content if needed (>100KB, keep 50 lines around cursor)
	content := msg.Content
	const maxSize = 100 * 1024 // 100KB

	if len(content) > maxSize {
		content = m.truncateAroundCursor(content, msg.CursorLine, 50)
	}

	// Construct prompt using the template
	prompt := m.buildPrompt(msg.Filename, msg.Filetype, msg.CursorLine, msg.CursorCol, msg.LastEvent, content)

	// Set agents to thinking state
	m.agentThinking["code-reviewer"] = true
	m.agentThinking["bug-spotter"] = true

	// Send to both agents
	go func() {
		_ = m.ocClient.SendPrompt("code-reviewer", prompt)
	}()
	go func() {
		_ = m.ocClient.SendPrompt("bug-spotter", prompt)
	}()
}

// buildPrompt constructs the prompt from the template
func (m *Model) buildPrompt(path, filetype string, line, col int, eventType, content string) string {
	return fmt.Sprintf(`You are watching a live coding session. The user is editing:
File: %s (%s)
Cursor: line %d, col %d

Current buffer content:
`+"`"+`%s
%s
`+"`"+`

Event: %s

Provide brief, actionable observations (2-3 sentences max).`,
		path, filetype, line, col, filetype, content, eventType)
}

// truncateAroundCursor truncates content to keep N lines around the cursor
func (m *Model) truncateAroundCursor(content string, cursorLine, contextLines int) string {
	lines := strings.Split(content, "\n")
	totalLines := len(lines)

	// Calculate start and end indices
	start := cursorLine - contextLines
	if start < 0 {
		start = 0
	}
	end := cursorLine + contextLines
	if end > totalLines {
		end = totalLines
	}

	// Build truncated content
	var result strings.Builder
	if start > 0 {
		result.WriteString(fmt.Sprintf("[...%d lines omitted...]\n", start))
	}

	for i := start; i < end; i++ {
		result.WriteString(lines[i])
		result.WriteString("\n")
	}

	if end < totalLines {
		result.WriteString(fmt.Sprintf("[...%d lines omitted...]\n", totalLines-end))
	}

	return result.String()
}

func (m Model) View() string {
	if !m.ready {
		return "Loading..."
	}

	header := titleStyle.Render("ALGOPEEPS COUNCIL")

	reviewerCard := components.AgentCard{
		Name:        "Code Reviewer",
		Emoji:       "🔍",
		Output:      m.agents["code_reviewer"],
		Thinking:    m.agentThinking["code-reviewer"],
		AccentColor: reviewerColor,
	}

	bugSpotterCard := components.AgentCard{
		Name:        "Bug Spotter",
		Emoji:       "🐛",
		Output:      m.agents["bug_spotter"],
		Thinking:    m.agentThinking["bug-spotter"],
		AccentColor: bugSpotterColor,
	}

	contentWidth := m.width
	if contentWidth < 40 {
		contentWidth = 80
	}

	mainWidth := int(float64(contentWidth) * 0.8)
	cardWidth := (mainWidth - 4) / 2

	reviewerCardStyled := lipgloss.NewStyle().Width(cardWidth).Render(reviewerCard.Render())
	bugSpotterCardStyled := lipgloss.NewStyle().Width(cardWidth).Render(bugSpotterCard.Render())

	agentsRow := lipgloss.JoinHorizontal(
		lipgloss.Top,
		reviewerCardStyled,
		"  ",
		bugSpotterCardStyled,
	)

	summaryBar := components.SummaryBar{
		Filename:   m.bufferFilename,
		Filetype:   m.bufferFiletype,
		CursorLine: m.bufferLine,
		CursorCol:  m.bufferCol,
		LineCount:  m.bufferLines,
		LastEvent:  m.lastEvent,
	}

	nvimStatus := lipgloss.NewStyle().Foreground(lipgloss.Color("#EF4444")).Render("Neovim ○")
	if m.nvimConnected {
		nvimStatus = lipgloss.NewStyle().Foreground(connectedColor).Render("Neovim ●")
	}

	openCodeStatus := lipgloss.NewStyle().Foreground(lipgloss.Color("#EF4444")).Render("OpenCode ○")
	if m.openCodeConnected {
		openCodeStatus = lipgloss.NewStyle().Foreground(connectedColor).Render("OpenCode ●")
	}

	sessionInfo := "No session"
	if m.ocClient != nil && m.ocClient.SessionID() != "" {
		sessionInfo = fmt.Sprintf("Session: %s", m.ocClient.SessionID()[:8])
	}

	errorStatus := ""
	if m.lastError != "" {
		errorStatus = lipgloss.NewStyle().Foreground(lipgloss.Color("#EF4444")).Render(fmt.Sprintf(" | Error: %s", m.lastError))
	}

	statusBar := statusBarStyle.Render(
		lipgloss.JoinHorizontal(
			lipgloss.Left,
			nvimStatus,
			lipgloss.NewStyle().Foreground(dimText).Render(" | "),
			openCodeStatus,
			lipgloss.NewStyle().Foreground(dimText).Render(fmt.Sprintf(" | %s | Press 'q' to quit", sessionInfo)),
			errorStatus,
		),
	)

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		"",
		agentsRow,
		"",
		summaryBar.Render(),
		statusBar,
	)
}
