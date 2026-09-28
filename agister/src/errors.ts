// Caller or configuration mistakes (unknown runtime, invalid process file,
// policy an adapter cannot enforce), as opposed to failures while doing the
// work. Raised before any run is created.
export class InputError extends Error {}
