// Package examples holds the example settings copied by `agister init`.
package examples

import (
	"embed"
	"io/fs"
)

//go:embed settings
var files embed.FS

// Settings returns the example settings laid out as kind/name.ext.
func Settings() fs.FS {
	sub, err := fs.Sub(files, "settings")
	if err != nil {
		panic(err)
	}
	return sub
}
