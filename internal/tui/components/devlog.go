package components

import (
	"time"

	"github.com/charmbracelet/lipgloss"
)

// DevLogEntry represents a single log entry in the devlog panel
type DevLogEntry struct {
	Timestamp time.Time
	Category  string // "tcp", "agent", "error"
	Message   string
}

// DevLog displays a scrollable list of events for debugging
type DevLog struct {
	Title   string
	Entries []DevLogEntry
	Width   int
	Height  int
}

// Render renders the devlog panel
func (d DevLog) Render() string {
	titleStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#8B5CF6")).
		Bold(true).
		MarginBottom(1)

	panelStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#8B5CF6")).
		Padding(0, 1).
		Width(d.Width).
		Height(d.Height)

	// Category colors
	tcpColor := lipgloss.Color("#3B82F6")   // Blue
	agentColor := lipgloss.Color("#22C55E") // Green
	errorColor := lipgloss.Color("#EF4444") // Red

	// Build entries list
	var lines []string
	lines = append(lines, titleStyle.Render("📋 "+d.Title))
	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#3F3F46")).Render("── EVENTS ──"))

	// Show most recent entries that fit
	maxEntries := d.Height - 4 // Account for title, separator, padding
	if maxEntries < 1 {
		maxEntries = 10
	}

	startIdx := 0
	if len(d.Entries) > maxEntries {
		startIdx = len(d.Entries) - maxEntries
	}

	for i := startIdx; i < len(d.Entries); i++ {
		entry := d.Entries[i]
		timeStr := entry.Timestamp.Format("15:04:05")

		var color lipgloss.Color
		switch entry.Category {
		case "tcp":
			color = tcpColor
		case "agent":
			color = agentColor
		case "error":
			color = errorColor
		default:
			color = lipgloss.Color("#71717A")
		}

		timeStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#71717A"))
		msgStyle := lipgloss.NewStyle().Foreground(color)

		line := timeStyle.Render(timeStr) + " " + msgStyle.Render(entry.Message)
		lines = append(lines, line)
	}

	if len(d.Entries) == 0 {
		lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("#71717A")).Render("Waiting for events..."))
	}

	content := lipgloss.JoinVertical(lipgloss.Left, lines...)
	return panelStyle.Render(content)
}
