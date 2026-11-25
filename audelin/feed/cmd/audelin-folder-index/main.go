// Command audelin-folder-index generates the call assistant's Markdown folder index.
package main

import (
	"os"

	"github.com/igor1309/ai-labs/audelin/feed/folderindex"
)

func main() {
	os.Exit(folderindex.Run(os.Args[1:], os.Stderr))
}
