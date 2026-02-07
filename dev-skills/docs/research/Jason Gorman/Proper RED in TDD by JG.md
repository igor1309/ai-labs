---
source: a book on Test-Driven Development (TDD) authored by Jason Gorman of Codemanship
tool: NotebookLM
---

Writing a "proper RED" (failing test) is the critical first step in Test-Driven Development (TDD). The goal of this phase is to write a test that specifies something the software should do that it currently doesn't, resulting in a failure.

Here are actionable guides for writing an effective failing test, drawing on the practices outlined in the sources:

### I. Adhere to the TDD Golden Rule

The fundamental rule of TDD guides the Red phase: **Do not write any source code until a test requires it**.

1.  **Reference Non-Existent Code:** Start by writing the test code that references the class, method, or variable you intend to create. Your editor should flag this as a compilation error or failure because the component does not exist. This is considered a broken test (a failing test).
2.  **Focus on Minimal Failure:** Aim to have **just one thing broken at a time** if possible, favoring the shortest possible feedback cycles.
3.  **Drive Behavior, Not Structure:** Ensure your failing test focuses on the **results of desired behavior** or a specific rule, rather than demanding the existence of specific structural implementation details (like writing a test merely to assert a class is not null).

### II. Mechanics of Test Construction

Functional tests generally consist of three components: set-up (Arrange), action (Act), and assertion(s) (Assert). To ensure you are testing the desired behavior, follow this reversed order:

1.  **Start with the Question (Assertion First):** Begin the test by writing the assertion(s) first. This approach helps you **discover exactly what set-up** (objects, test data) the test will need to ask the question correctly, rather than guessing the setup and realizing later it was insufficient.
2.  **Work Backwards to Setup:** After writing the assertion, work backwards to create the necessary set-up. For instance, if your assertion references a variable that hasn't been declared, declaring that variable is the next step.
3.  **Choose the Simplest Start:** Try to think of the **simplest test you could start with**—the one that would be easiest to pass. When the solution is not obvious and trivial, use triangulation by starting with the simplest example and generalizing later.

### III. Guarantee a Proper Failure

Before implementing any production code, you must ensure your test fails reliably for the correct reason:

1.  **Test Your Tests:** It is highly recommended that you **see the test fail for the right reason** before writing the code to pass it. This provides assurance that the test will actually catch errors if the result is wrong.
2.  **Avoid Premature Failure (Null/Runtime Exceptions):** If the test fails due to an unexpected unhandled exception (like a `NullPointerException` because a method returns `null`), you must **add just enough implementation** (e.g., initializing a collection to an empty list instead of `null`) to see the failure reach the actual assertion logic.
3.  **Ensure a Single Reason to Fail:** Each test should ask **only one question** or specify **one distinct rule**. Tests that contain multiple assertions related to different rules or outcomes introduce less focus and are much harder to debug when they break. For instance, do not check that a title is added to the library, a copy count is increased, and reward points are awarded all in a single test.

### IV. Style and Specification

When defining the failing test, ensure it clearly communicates its intent:

1.  **Name the Rule:** Use the name of the test method to **clearly convey the rule or desired behavior**. Test method names should communicate "What should have happened?". Don't worry about long, verbose names, as tests are not an API.
2.  **Use Customer Language:** When naming classes, methods, and variables within the test, draw inspiration from the **customer's language** or domain terms to establish a shared understanding.
3.  **Highlight Boundaries (Test Data):** Choose test data that highlights **boundaries in the logic**. For example, when testing a credit limit of 100, use 100.01 to clearly communicate the boundary condition that causes failure.
4.  **Leverage Assertions for Clarity:** Consider using **fluent assertions** (like Hamcrest) which can provide extra information in the failure trace about exactly which part of the assertion failed. Expected exceptions and mock object expectations are also considered forms of assertions that should be seen failing.

***

The TDD process can also start at a higher level with a **failing customer test** (an executable specification agreed upon with the customer). Once a failing customer test is established, you identify the first piece of work needed to satisfy it and then drive the low-level implementation using unit tests that also start in the Red phase.