package tui

type BufferEventMsg struct {
	Filename   string
	Filetype   string
	CursorLine int
	CursorCol  int
	LineCount  int
	LastEvent  string
	Content    string
}

type AgentTextMsg struct {
	Agent string
	Text  string
}

type AgentIdleMsg struct {
	Agent string
}

type ConnectionStatusMsg struct {
	Connected bool
	Source    string
}

type ErrorMsg struct {
	Error   error
	Context string
}

type startSSEMsg struct{}
