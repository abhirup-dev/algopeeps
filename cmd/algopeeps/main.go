package main

import (
	"fmt"
	"os"

	"github.com/abhirupda/algopeeps/internal/server"
	"github.com/abhirupda/algopeeps/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	tcpServer := server.New(":9999")

	model := tui.NewModel()
	p := tea.NewProgram(model, tea.WithAltScreen())

	tcpServer.SetProgram(p)

	model.StartSSESubscription(p)

	if err := tcpServer.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting TCP server: %v\n", err)
		os.Exit(1)
	}

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v\n", err)
		os.Exit(1)
	}

	_ = tcpServer.Stop()
}
