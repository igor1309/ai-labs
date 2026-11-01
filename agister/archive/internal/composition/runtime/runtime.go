// Package runtime composes isolated CLI wrappers with the process supervisor
// and translates their domains to the application ports. Keeping this role
// here lets the CLI and integration tests use the same wiring.
package runtime
