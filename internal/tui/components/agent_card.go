package components

import (
	"github.com/charmbracelet/lipgloss"
)

type AgentCard struct {
	Name        string
	Emoji       string
	Output      string
	Thinking    bool
	AccentColor lipgloss.Color
}

func (a AgentCard) Render() string {
	title := a.Emoji + " " + a.Name

	titleStyle := lipgloss.NewStyle().
		Foreground(a.AccentColor).
		Bold(true).
		MarginBottom(1)

	contentStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#71717A")).
		Width(0)

	cardStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(a.AccentColor).
		Padding(1, 2)

	content := a.Output
	if a.Thinking {
		content = "Thinking..."
	}

	contentSection := lipgloss.NewStyle().
		Width(0).
		Render(contentStyle.Render(content))

	return cardStyle.Render(
		lipgloss.JoinVertical(
			lipgloss.Left,
			titleStyle.Render(title),
			contentSection,
		),
	)
}
