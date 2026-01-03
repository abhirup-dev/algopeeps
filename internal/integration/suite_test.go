package integration

import (
	"net"
	"os"
	"testing"
	"time"

	"github.com/abhirupda/algopeeps/internal/server"
)

// skipIfNotIntegration skips the test if INTEGRATION_TESTS env var is not set
func skipIfNotIntegration(t *testing.T) {
	t.Helper()
	if os.Getenv("INTEGRATION_TESTS") != "1" {
		t.Skip("Skipping integration test. Set INTEGRATION_TESTS=1 to run")
	}
}

// setupTestServer creates and starts a test TCP server on a random port
func setupTestServer(t *testing.T) (*server.Server, string) {
	t.Helper()

	// Use port 0 to let the OS assign a random available port
	srv := server.New("127.0.0.1:0")

	err := srv.Start()
	if err != nil {
		t.Fatalf("Failed to start test server: %v", err)
	}

	// Get the actual address (with assigned port)
	addr := srv.Addr()

	// Register cleanup
	t.Cleanup(func() {
		if err := srv.Stop(); err != nil {
			t.Logf("Error stopping server: %v", err)
		}
	})

	// Give server time to start accepting connections
	time.Sleep(50 * time.Millisecond)

	return srv, addr
}

// waitForServer waits for the server to be ready to accept connections
func waitForServer(addr string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 100*time.Millisecond)
		if err == nil {
			conn.Close()
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}
