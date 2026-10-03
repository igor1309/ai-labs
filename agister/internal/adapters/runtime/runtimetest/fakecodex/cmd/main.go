// Command fakecodex is the program built from the fake of the same name, for the
// contract test that runs it as a process.
package main

import (
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakecodex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeproc"
)

func main() { fakeproc.Run(fakecodex.Main) }
