package tui

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	reviewerColor   = lipgloss.Color("#3B82F6")
	bugSpotterColor = lipgloss.Color("#EF4444")
	borderColor     = lipgloss.Color("#3F3F46")
	connectedColor  = lipgloss.Color("#22C55E")
	dimText         = lipgloss.Color("#71717A")
	brightText      = lipgloss.Color("#FAFAFA")
)

var (
	agentCardStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(borderColor).
			Padding(1, 2)

	agentCardTitleStyle = lipgloss.NewStyle().
				Foreground(brightText).
				Bold(true).
				MarginBottom(1)

	agentCardContentStyle = lipgloss.NewStyle().
				Foreground(dimText).
				Width(0)

	summaryBarStyle = lipgloss.NewStyle().
			Border(lipgloss.NormalBorder(), false, false, true, false).
			BorderForeground(borderColor).
			Padding(0, 1).
			Foreground(dimText)

	statusBarStyle = lipgloss.NewStyle().
			Foreground(dimText).
			Padding(0, 1)

	titleStyle = lipgloss.NewStyle().
			Foreground(brightText).
			Bold(true).
			Padding(0, 1)
)
