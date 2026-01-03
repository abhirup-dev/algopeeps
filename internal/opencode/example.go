// Package main demonstrates how to use the OpenCode client wrapper
//
// Example usage:
//
//	package main
//
//	import (
//		"fmt"
//		"log"
//
//		"github.com/abhirupda/algopeeps/internal/opencode"
//	)
//
//	func main() {
//		// Create a client with default config (http://localhost:4096)
//		client, err := opencode.NewClient(opencode.DefaultConfig())
//		if err != nil {
//			log.Fatal(err)
//		}
//		defer client.Close()
//
//		// Ensure a session exists
//		if err := client.EnsureSession(); err != nil {
//			log.Fatal(err)
//		}
//
//		fmt.Printf("Session ID: %s\n", client.SessionID())
//
//		// Send a prompt to an agent
//		err = client.SendPrompt("build", "Analyze the codebase structure")
//		if err != nil {
//			log.Fatal(err)
//		}
//
//		// Or use custom config
//		customConfig := opencode.Config{
//			BaseURL: "http://custom-server:8080",
//		}
//		client2, err := opencode.NewClient(customConfig)
//		if err != nil {
//			log.Fatal(err)
//		}
//		defer client2.Close()
//	}
package opencode
