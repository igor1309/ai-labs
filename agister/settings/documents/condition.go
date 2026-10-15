package documents

import (
	"slices"
	"strings"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// Condition is a condition of a workflow (ADR-011, rule 4), a map of its
// one operator: equals, what a reference reads equals a value; present,
// a reference reads a value; all or any, each or some item of what a
// reference reads holds a condition, which reads the item as item; and,
// or and not, of conditions.
type Condition struct {
	Operator string
	// Reads is what the reference of equals, present, all and any reads.
	Reads Field[string]
	// Equals is the value of equals: a string, an integer, a number or a
	// boolean.
	Equals Field[any]
	// Of are the conditions of and and or; of not, all and any, the one.
	Of []Field[Condition]
}

// operators are a condition's operators.
func operators() []string {
	return []string{"equals", "present", "all", "any", "and", "or", "not"}
}

// conditionReads is what a condition's references may read: what a
// workflow's may, and an item of all and any.
func conditionReads() []string { return append(workflowReads(), "item") }

// condition is the field key, a condition.
func (f *fields) condition(key string, need need) Field[Condition] {
	node, ok := f.given(key, need)
	if !ok {
		return Field[Condition]{}
	}
	return f.typing.condition(node, f.at(key))
}

// condition is node, the condition at place.
func (t *typing) condition(node tree.Node, place string) Field[Condition] {
	if node.Kind() != tree.Map {
		t.problems = append(t.problems, at(node, place, notA(tree.Map, node.Kind())))
		return Field[Condition]{}
	}
	keys := node.Keys()
	if len(keys) != 1 || !slices.Contains(operators(), keys[0]) {
		t.problems = append(t.problems, at(node, place, "it has one operator of "+strings.Join(operators(), ", ")))
		return Field[Condition]{}
	}
	operator := keys[0]
	c := &fields{typing: t, node: node, place: place, known: map[string]bool{}}
	condition := Condition{Operator: operator}
	switch operator {
	case "equals":
		condition.Reads, condition.Equals = c.equals()
	case "present":
		condition.Reads = c.from(operator, required, conditionReads()...)
	case "all", "any":
		if query := c.mapping(operator, required); query.Given {
			q := query.Value
			condition.Reads = q.from("in", required, conditionReads()...)
			condition.Of = []Field[Condition]{q.condition("where", required)}
			q.done()
		}
	case "and", "or":
		list, _ := node.Get(operator)
		if list.Kind() != tree.List || len(list.Items()) == 0 {
			t.problems = append(t.problems, at(list, c.at(operator), "it is a list of conditions, one or more"))
			break
		}
		for i, item := range list.Items() {
			condition.Of = append(condition.Of, t.condition(item, itemPlace(c.at(operator), i)))
		}
	case "not":
		inner, _ := node.Get(operator)
		condition.Of = []Field[Condition]{t.condition(inner, c.at(operator))}
	}
	return Field[Condition]{Value: condition, Origin: originOf(node), Given: true}
}

// equals is the reference and the value of the condition c's equals.
func (c *fields) equals() (Field[string], Field[any]) {
	pair, _ := c.node.Get("equals")
	items := pair.Items()
	if pair.Kind() != tree.List || len(items) != 2 || items[0].Kind() != tree.Map || scalar(items[1]) == nil {
		c.typing.problems = append(c.typing.problems, at(pair, c.at("equals"), "it is a reference and a value"))
		return Field[string]{}, Field[any]{}
	}
	reference := &fields{typing: c.typing, node: items[0], place: itemPlace(c.at("equals"), 0), known: map[string]bool{}}
	return reference.reads(conditionReads()...), Field[any]{Value: scalar(items[1]), Origin: originOf(items[1]), Given: true}
}

// scalar is the value of node, a string, an integer, a number or a
// boolean; nil for any other node.
func scalar(node tree.Node) any {
	switch node.Kind() {
	case tree.String:
		value, _ := node.Text()
		return value
	case tree.Integer:
		value, _ := node.Integer()
		return value
	case tree.Number:
		value, _ := node.Number()
		return value
	case tree.Boolean:
		value, _ := node.Boolean()
		return value
	}
	return nil
}

// clone is the condition with slices of its own, at every depth.
func (c Condition) clone() Condition {
	c.Of = slices.Clone(c.Of)
	for i := range c.Of {
		c.Of[i].Value = c.Of[i].Value.clone()
	}
	return c
}
