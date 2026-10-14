// Command testreport reads go test -json from its input and writes what
// ran: see package testreport. It exits 1 if a package failed.
package main

import (
	"fmt"
	"os"

	"github.com/igor1309/ai-labs/gokit/testreport"
)

func main() {
	ok, err := testreport.Write(os.Stdout, os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "testreport:", err)
		os.Exit(2)
	}
	if !ok {
		os.Exit(1)
	}
}
