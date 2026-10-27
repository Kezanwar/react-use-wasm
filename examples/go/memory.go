// Passing more than numbers across the WebAssembly boundary.
//
// A wasm function can only take and return numbers. Anything bigger — an
// array, a string, a struct — is passed as an *offset* into the module's
// linear memory, which JavaScript can read and write through
// `exports.memory.buffer`.
//
// The protocol every function below uses is the same:
//
//  1. JS calls alloc(n) to reserve n bytes and gets back an offset.
//  2. JS writes its data into memory.buffer at that offset.
//  3. JS calls the function with (offset, length) as two int32s.
//  4. JS reads any result back out of memory.buffer, then calls free().
package main

import (
	"encoding/json"
	"slices"
	"strings"
	"unsafe"
)

// Go's GC has no idea JavaScript is holding an offset, so anything handed
// out must be kept reachable until free() is called. A demo-grade allocator:
// real ones track sizes and reuse blocks.
var live = map[uintptr][]byte{}

// alloc reserves size bytes and returns the offset to write them at.
//
//go:wasmexport alloc
func alloc(size int32) unsafe.Pointer {
	if size <= 0 {
		return nil
	}
	buf := make([]byte, size)
	ptr := unsafe.Pointer(&buf[0])
	live[uintptr(ptr)] = buf
	return ptr
}

// free releases a block from alloc. Forgetting to call it leaks, exactly as
// it would in C.
//
//go:wasmexport free
func free(ptr unsafe.Pointer) {
	delete(live, uintptr(ptr))
}

// pack squeezes an (offset, length) pair into a single int64, which arrives
// in JavaScript as a bigint. It is how a function returns freshly allocated
// data when it cannot return two values.
func pack(ptr unsafe.Pointer, n int) int64 {
	return int64(uintptr(ptr))<<32 | int64(n)
}

/* ---------------------------------------------------------------- */
/* Arrays                                                            */
/* ---------------------------------------------------------------- */

// sumInt32 reads an Int32Array out of memory without copying it.
//
//go:wasmexport sumInt32
func sumInt32(ptr unsafe.Pointer, n int32) int32 {
	var total int32
	for _, x := range unsafe.Slice((*int32)(ptr), n) {
		total += x
	}
	return total
}

// sortInt32 sorts in place. Nothing is returned: JavaScript reads the same
// bytes back out and sees them reordered.
//
//go:wasmexport sortInt32
func sortInt32(ptr unsafe.Pointer, n int32) {
	slices.Sort(unsafe.Slice((*int32)(ptr), n))
}

// scaleFloat64 shows that the same trick works for Float64Array, and that a
// float64 argument rides alongside the two offsets as a plain JS number.
//
//go:wasmexport scaleFloat64
func scaleFloat64(ptr unsafe.Pointer, n int32, k float64) {
	xs := unsafe.Slice((*float64)(ptr), n)
	for i := range xs {
		xs[i] *= k
	}
}

/* ---------------------------------------------------------------- */
/* Strings                                                           */
/* ---------------------------------------------------------------- */

// upperInPlace uppercases UTF-8 bytes in place. Safe here only because the
// demo input is ASCII, where uppercasing never changes the byte length.
//
//go:wasmexport upperInPlace
func upperInPlace(ptr unsafe.Pointer, n int32) {
	bs := unsafe.Slice((*byte)(ptr), n)
	copy(bs, strings.ToUpper(string(bs)))
}

// reverseString allocates a new string and returns it as a packed
// (offset, length) int64, since the result can be a different length from
// the input. JavaScript unpacks the bigint, reads the bytes, then frees.
//
//go:wasmexport reverseString
func reverseString(ptr unsafe.Pointer, n int32) int64 {
	runes := []rune(string(unsafe.Slice((*byte)(ptr), n)))
	slices.Reverse(runes)
	out := []byte(string(runes))

	dst := alloc(int32(len(out)))
	copy(unsafe.Slice((*byte)(dst), len(out)), out)
	return pack(dst, len(out))
}

/* ---------------------------------------------------------------- */
/* Objects, by struct layout: free, but you own the layout           */
/* ---------------------------------------------------------------- */

// Point is laid out as two float64s, 16 bytes, no padding. JavaScript builds
// the same layout with a Float64Array and the two sides simply agree.
type Point struct {
	X float64
	Y float64
}

// centroid averages n Points and writes the result to out, which must point
// at 16 spare bytes. An out-pointer is how you "return a struct".
//
//go:wasmexport centroid
func centroid(ptr unsafe.Pointer, n int32, out unsafe.Pointer) {
	result := (*Point)(out)
	*result = Point{}
	if n == 0 {
		return
	}
	for _, p := range unsafe.Slice((*Point)(ptr), n) {
		result.X += p.X
		result.Y += p.Y
	}
	result.X /= float64(n)
	result.Y /= float64(n)
}

/* ---------------------------------------------------------------- */
/* Objects, by JSON: easy, but ~150 KB of binary                     */
/* ---------------------------------------------------------------- */

type person struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

type stats struct {
	Count  int     `json:"count"`
	Mean   float64 `json:"meanAge"`
	Oldest string  `json:"oldest"`
}

// jsonStats takes a JSON array of {name, age} and returns a JSON object,
// both as UTF-8 in linear memory. Returns a packed (offset, length) int64;
// a length of 0 means the input would not parse.
//
// Convenient, and the reason this module is 160 KB rather than 15 KB:
// encoding/json pulls in Go's reflection machinery.
//
//go:wasmexport jsonStats
func jsonStats(ptr unsafe.Pointer, n int32) int64 {
	var people []person
	if err := json.Unmarshal(unsafe.Slice((*byte)(ptr), n), &people); err != nil {
		return 0
	}

	out := stats{Count: len(people)}
	oldest := -1
	for _, p := range people {
		out.Mean += float64(p.Age)
		if p.Age > oldest {
			oldest = p.Age
			out.Oldest = p.Name
		}
	}
	if len(people) > 0 {
		out.Mean /= float64(len(people))
	}

	encoded, err := json.Marshal(out)
	if err != nil {
		return 0
	}
	dst := alloc(int32(len(encoded)))
	copy(unsafe.Slice((*byte)(dst), len(encoded)), encoded)
	return pack(dst, len(encoded))
}
