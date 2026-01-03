package protocol

import "time"

type EventType string

const (
	EventTextChanged EventType = "text_changed"
	EventBufferWrite EventType = "buffer_write"
	EventBufferEnter EventType = "buffer_enter"
)

type MessageType string

const (
	MessageBufferUpdate MessageType = "buffer_update"
	MessagePing         MessageType = "ping"
	MessageDisconnect   MessageType = "disconnect"
)

type Cursor struct {
	Line int `json:"line"`
	Col  int `json:"col"`
}

type Buffer struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	Filetype  string `json:"filetype"`
	Cursor    Cursor `json:"cursor"`
	LineCount int    `json:"line_count"`
	Content   string `json:"content"`
}

type BufferEvent struct {
	Type      MessageType `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	Event     EventType   `json:"event"`
	Buffer    Buffer      `json:"buffer"`
}

func (e *BufferEvent) Validate() error {
	return nil
}

func (b *Buffer) TruncateContent(maxSize int) string {
	if len(b.Content) <= maxSize {
		return b.Content
	}
	return b.Content[:maxSize] + "\n[...truncated...]"
}
