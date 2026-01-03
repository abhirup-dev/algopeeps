package components

import (
	"fmt"
	"github.com/charmbracelet/lipgloss"
)

type SummaryBar struct {
	Filename   string
	Filetype   string
	CursorLine int
	CursorCol  int
	LineCount  int
	LastEvent  string
}

func (s SummaryBar) Render() string {
	style := lipgloss.NewStyle().
		Border(lipgloss.NormalBorder(), false, false, true, false).
		BorderForeground(lipgloss.Color("#3F3F46")).
		Padding(0, 1).
		Foreground(lipgloss.Color("#71717A"))

	filename := s.Filename
	if filename == "" {
		filename = "no file"
	}
	filetype := s.Filetype
	if filetype == "" {
		filetype = "unknown"
	}
	lastEvent := s.LastEvent
	if lastEvent == "" {
		lastEvent = "Waiting..."
	}

	text := fmt.Sprintf("📄 %s (%s) | Line %d, Col %d | %d lines | %s",
		filename, filetype, s.CursorLine, s.CursorCol, s.LineCount, lastEvent)

	return style.Render(text)
}
