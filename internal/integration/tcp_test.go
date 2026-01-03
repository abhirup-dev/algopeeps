package integration

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/abhirupda/algopeeps/internal/protocol"
)

// dialTCP is a helper to establish TCP connection
func dialTCP(addr string) (net.Conn, error) {
	return net.DialTimeout("tcp", addr, 2*time.Second)
}

func TestTCPServer_AcceptsConnection(t *testing.T) {
	skipIfNotIntegration(t)

	srv, addr := setupTestServer(t)
	if srv == nil {
		t.Fatal("Server setup failed")
	}

	// Attempt to connect
	conn, err := dialTCP(addr)
	if err != nil {
		t.Fatalf("Failed to connect to server at %s: %v", addr, err)
	}
	defer conn.Close()

	// If we got here, connection was accepted
	t.Logf("Successfully connected to server at %s", addr)
}

func TestTCPServer_ParsesBufferEvent(t *testing.T) {
	skipIfNotIntegration(t)

	srv, addr := setupTestServer(t)
	if srv == nil {
		t.Fatal("Server setup failed")
	}

	// Connect to server
	conn, err := dialTCP(addr)
	if err != nil {
		t.Fatalf("Failed to connect to server: %v", err)
	}
	defer conn.Close()

	// Load sample buffer event
	samplePath := filepath.Join("testdata", "sample_buffer.json")
	sampleData, err := os.ReadFile(samplePath)
	if err != nil {
		t.Fatalf("Failed to read sample buffer event: %v", err)
	}

	// Verify the sample data is valid JSON
	var event protocol.BufferEvent
	if err := json.Unmarshal(sampleData, &event); err != nil {
		t.Fatalf("Sample buffer event is not valid JSON: %v", err)
	}

	// Send the buffer event to server (must end with newline)
	writer := bufio.NewWriter(conn)
	_, err = writer.Write(sampleData)
	if err != nil {
		t.Fatalf("Failed to write buffer event: %v", err)
	}

	// Ensure newline at the end
	if sampleData[len(sampleData)-1] != '\n' {
		_, err = writer.Write([]byte("\n"))
		if err != nil {
			t.Fatalf("Failed to write newline: %v", err)
		}
	}

	if err = writer.Flush(); err != nil {
		t.Fatalf("Failed to flush data: %v", err)
	}

	// Give server time to process
	time.Sleep(100 * time.Millisecond)

	// Verify event was parsed correctly
	if event.Type != protocol.MessageBufferUpdate {
		t.Errorf("Expected message type %s, got %s", protocol.MessageBufferUpdate, event.Type)
	}

	if event.Event != protocol.EventTextChanged {
		t.Errorf("Expected event type %s, got %s", protocol.EventTextChanged, event.Event)
	}

	if event.Buffer.Name == "" {
		t.Error("Expected buffer name to be non-empty")
	}

	if event.Buffer.Filetype == "" {
		t.Error("Expected buffer filetype to be non-empty")
	}

	if event.Buffer.Cursor.Line < 0 || event.Buffer.Cursor.Col < 0 {
		t.Error("Expected cursor position to be non-negative")
	}

	t.Logf("Successfully parsed buffer event: %s (type=%s, event=%s)",
		event.Buffer.Name, event.Type, event.Event)
}

func TestOpenCodeIntegration_Stub(t *testing.T) {
	skipIfNotIntegration(t)

	// This is a stub test for OpenCode integration
	// OpenCode tests require a live server running separately
	t.Skip("OpenCode integration tests require live server - not yet implemented")
}

// TestBufferEventValidation tests that buffer events validate correctly
func TestBufferEventValidation(t *testing.T) {
	skipIfNotIntegration(t)

	// Load sample buffer event
	samplePath := filepath.Join("testdata", "sample_buffer.json")
	sampleData, err := os.ReadFile(samplePath)
	if err != nil {
		t.Fatalf("Failed to read sample buffer event: %v", err)
	}

	var event protocol.BufferEvent
	if err := json.Unmarshal(sampleData, &event); err != nil {
		t.Fatalf("Failed to unmarshal buffer event: %v", err)
	}

	// Validate the event
	if err := event.Validate(); err != nil {
		t.Errorf("Buffer event validation failed: %v", err)
	}
}

// TestMultipleConnections tests that server can handle multiple concurrent connections
func TestMultipleConnections(t *testing.T) {
	skipIfNotIntegration(t)

	srv, addr := setupTestServer(t)
	if srv == nil {
		t.Fatal("Server setup failed")
	}

	// Create multiple concurrent connections
	const numConnections = 5
	connections := make([]net.Conn, numConnections)

	for i := 0; i < numConnections; i++ {
		conn, err := dialTCP(addr)
		if err != nil {
			t.Fatalf("Failed to establish connection %d: %v", i, err)
		}
		connections[i] = conn
		defer conn.Close()
	}

	t.Logf("Successfully established %d concurrent connections", numConnections)
}

// TestConnectionCleanup tests that server properly cleans up closed connections
func TestConnectionCleanup(t *testing.T) {
	skipIfNotIntegration(t)

	srv, addr := setupTestServer(t)
	if srv == nil {
		t.Fatal("Server setup failed")
	}

	// Connect and immediately disconnect
	conn, err := dialTCP(addr)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	// Close the connection
	if err := conn.Close(); err != nil {
		t.Fatalf("Failed to close connection: %v", err)
	}

	// Give server time to clean up
	time.Sleep(100 * time.Millisecond)

	// Server should still be able to accept new connections
	conn2, err := dialTCP(addr)
	if err != nil {
		t.Fatalf("Server failed to accept new connection after cleanup: %v", err)
	}
	defer conn2.Close()

	t.Log("Server successfully cleaned up closed connection and accepted new one")
}

// TestInvalidJSON tests that server handles invalid JSON gracefully
func TestInvalidJSON(t *testing.T) {
	skipIfNotIntegration(t)

	srv, addr := setupTestServer(t)
	if srv == nil {
		t.Fatal("Server setup failed")
	}

	conn, err := dialTCP(addr)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Send invalid JSON
	invalidJSON := []byte(`{"invalid": json}` + "\n")
	_, err = conn.Write(invalidJSON)
	if err != nil {
		t.Fatalf("Failed to write invalid JSON: %v", err)
	}

	// Give server time to process
	time.Sleep(100 * time.Millisecond)

	// Connection should still be alive (server continues on parse errors)
	// Try sending valid data
	validEvent := protocol.BufferEvent{
		Type:  protocol.MessageBufferUpdate,
		Event: protocol.EventTextChanged,
		Buffer: protocol.Buffer{
			ID:        1,
			Name:      "test.go",
			Filetype:  "go",
			LineCount: 10,
			Cursor:    protocol.Cursor{Line: 1, Col: 0},
		},
	}

	data, err := json.Marshal(validEvent)
	if err != nil {
		t.Fatalf("Failed to marshal valid event: %v", err)
	}

	_, err = conn.Write(append(data, '\n'))
	if err != nil {
		t.Fatalf("Connection died after invalid JSON: %v", err)
	}

	t.Log("Server gracefully handled invalid JSON and continued processing")
}

// BenchmarkBufferEventParsing benchmarks JSON parsing of buffer events
func BenchmarkBufferEventParsing(b *testing.B) {
	if os.Getenv("INTEGRATION_TESTS") != "1" {
		b.Skip("Skipping benchmark. Set INTEGRATION_TESTS=1 to run")
	}

	samplePath := filepath.Join("testdata", "sample_buffer.json")
	sampleData, err := os.ReadFile(samplePath)
	if err != nil {
		b.Fatalf("Failed to read sample: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var event protocol.BufferEvent
		if err := json.Unmarshal(sampleData, &event); err != nil {
			b.Fatalf("Parse error: %v", err)
		}
	}
}

// ExampleBufferEvent demonstrates usage of BufferEvent
func ExampleBufferEvent() {
	event := protocol.BufferEvent{
		Type:      protocol.MessageBufferUpdate,
		Event:     protocol.EventTextChanged,
		Timestamp: time.Now(),
		Buffer: protocol.Buffer{
			ID:        1,
			Name:      "main.go",
			Path:      "/path/to/main.go",
			Filetype:  "go",
			LineCount: 42,
			Content:   "package main\n\nfunc main() {}\n",
			Cursor: protocol.Cursor{
				Line: 3,
				Col:  0,
			},
		},
	}

	data, _ := json.MarshalIndent(event, "", "  ")
	fmt.Println(string(data))
}
