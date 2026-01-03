package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"sync"

	"github.com/abhirupda/algopeeps/internal/protocol"
	"github.com/abhirupda/algopeeps/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
)

// Server handles TCP connections from Neovim
type Server struct {
	addr     string
	listener net.Listener
	program  *tea.Program
	mu       sync.Mutex
	clients  []net.Conn
	running  bool
}

// New creates a new TCP server
func New(addr string) *Server {
	return &Server{addr: addr}
}

// SetProgram sets the Bubble Tea program for message injection
func (s *Server) SetProgram(p *tea.Program) {
	s.program = p
}

// Start starts the TCP server
func (s *Server) Start() error {
	var err error
	s.listener, err = net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("failed to start server: %w", err)
	}
	s.running = true

	go s.acceptLoop()
	return nil
}

// Addr returns the server address
func (s *Server) Addr() string {
	if s.listener == nil {
		return s.addr
	}
	return s.listener.Addr().String()
}

// Stop stops the server
func (s *Server) Stop() error {
	s.running = false
	if s.listener != nil {
		return s.listener.Close()
	}
	return nil
}

func (s *Server) acceptLoop() {
	for s.running {
		conn, err := s.listener.Accept()
		if err != nil {
			if s.running {
				// Log error but continue
			}
			continue
		}
		s.mu.Lock()
		s.clients = append(s.clients, conn)
		s.mu.Unlock()

		// Notify TUI of new connection
		if s.program != nil {
			s.program.Send(tui.ConnectionStatusMsg{Connected: true, Source: "nvim"})
		}

		go s.handleConnection(conn)
	}
}

func (s *Server) handleConnection(conn net.Conn) {
	defer func() {
		conn.Close()
		s.removeClient(conn)
		if s.program != nil {
			s.program.Send(tui.ConnectionStatusMsg{Connected: false, Source: "nvim"})
		}
	}()

	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			return
		}

		var event protocol.BufferEvent
		if err := json.Unmarshal(line, &event); err != nil {
			continue
		}

		if s.program != nil {
			s.program.Send(tui.BufferEventMsg{
				Filename:   event.Buffer.Name,
				Filetype:   event.Buffer.Filetype,
				CursorLine: event.Buffer.Cursor.Line,
				CursorCol:  event.Buffer.Cursor.Col,
				LineCount:  event.Buffer.LineCount,
				LastEvent:  string(event.Event),
				Content:    event.Buffer.Content,
			})
		}
	}
}

func (s *Server) removeClient(conn net.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, c := range s.clients {
		if c == conn {
			s.clients = append(s.clients[:i], s.clients[i+1:]...)
			break
		}
	}
}
