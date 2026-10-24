package workflow

import (
	"encoding/json"
	"fmt"
	"math/big"
	"reflect"
	"strings"
)

// Condition is a pure comparison, collection query or Boolean composition.
// A query evaluates Of[0] for each item of Reads; not negates Of[0].
type Condition struct {
	Operator string
	Reads    Reference
	Equals   any
	Of       []Condition
}

// ConditionRead keeps an arm's decision and the values its condition read.
type ConditionRead struct {
	Arm   string
	Holds bool
	Read  map[string]any
}

func (r reader) condition(c Condition) (bool, map[string]any) {
	values := map[string]any{}
	var evaluate func(reader, Condition) bool
	evaluate = func(read reader, c Condition) bool {
		switch c.Operator {
		case "and":
			for _, child := range c.Of {
				if !evaluate(read, child) {
					return false
				}
			}
			return true
		case "or":
			for _, child := range c.Of {
				if evaluate(read, child) {
					return true
				}
			}
			return false
		case "not":
			return !evaluate(read, c.Of[0])
		}
		value, ok := read.reference(c.Reads)
		key := c.Reads.key()
		if c.Reads.Of == QueryItem {
			// Queries may read the same field of several items. Keep each read.
			prior, _ := values[key].([]any)
			values[key] = append(prior, value)
		} else {
			values[key] = value
		}
		switch c.Operator {
		case "present":
			return ok
		case "equals":
			return ok && equal(value, c.Equals)
		case "all", "any":
			list, listed := value.([]any)
			if !ok || !listed {
				return false
			}
			for _, item := range list {
				inner := read
				inner.item = item
				holds := evaluate(inner, c.Of[0])
				if c.Operator == "all" && !holds {
					return false
				}
				if c.Operator == "any" && holds {
					return true
				}
			}
			return c.Operator == "all"
		}
		return false
	}
	holds := evaluate(r, c)
	return holds, values
}

func (r Reference) key() string {
	var prefix string
	switch r.Of {
	case Params:
		prefix = "params." + r.Name
	case Inputs:
		prefix = "inputs." + r.Name
	case Outputs:
		prefix = "steps." + r.Name + ".outputs"
	case State:
		prefix = "state." + r.Name
	case QueryItem:
		prefix = "item"
	}
	path := r.Path
	if r.Field != "" {
		path = append([]string{r.Field}, path...)
	}
	if len(path) > 0 {
		prefix += "." + strings.Join(path, ".")
	}
	return prefix
}

func equal(a, b any) bool {
	number := func(value any) (*big.Rat, bool) {
		if value == nil {
			return nil, false
		}
		kind := reflect.TypeOf(value).Kind()
		if _, ok := value.(json.Number); !ok && (kind < reflect.Int || kind > reflect.Float64) {
			return nil, false
		}
		return new(big.Rat).SetString(fmt.Sprint(value))
	}
	if left, ok := number(a); ok {
		right, ok := number(b)
		return ok && left.Cmp(right) == 0
	}
	return reflect.DeepEqual(a, b)
}
