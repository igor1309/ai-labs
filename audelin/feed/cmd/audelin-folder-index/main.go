// Command audelin-folder-index generates the call assistant's Markdown folder index.
package main

import (
	"fmt"
	"os"

	"github.com/igor1309/ai-labs/audelin/feed/folderindex"
)

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Exit(folderindex.Run(os.Args[1:], home, os.Stderr))
}
