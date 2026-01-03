.PHONY: build run dev test test-integration install-plugin clean

# Build the binary
build:
	go build -o bin/algopeeps ./cmd/algopeeps

# Run the built binary
run: build
	./bin/algopeeps

# Run in development mode
dev:
	go run ./cmd/algopeeps

# Run unit tests
test:
	go test ./... -v

# Run integration tests (requires opencode serve running)
test-integration:
	@echo "Ensure 'opencode serve' is running on port 4096"
	INTEGRATION_TESTS=1 go test ./internal/integration/... -v

# Install Neovim plugin (symlink)
install-plugin:
	mkdir -p ~/.config/nvim/lua
	ln -sf $(PWD)/nvim/lua/algopeeps ~/.config/nvim/lua/algopeeps
	@echo "Plugin installed. Add: require('algopeeps').setup() to your init.lua"

# Clean build artifacts
clean:
	rm -rf bin/
	go clean

# Tidy dependencies
tidy:
	go mod tidy

# Format code
fmt:
	go fmt ./...
	
# Lint code
lint:
	golangci-lint run
