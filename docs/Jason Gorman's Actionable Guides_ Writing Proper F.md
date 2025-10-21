## Jason Gorman's Actionable Guides: Writing Proper Failing Tests ("Proper RED")

Based on extensive research of Jason Gorman's work through his TDD training materials, blog posts, videos, and workshop attendee notes, here's a comprehensive guide on how to write failing tests properly and see them fail for the right reasons.

### Core Principle: Test Your Tests

**Always see your test fail for the right reason before making it pass.** This ensures the test will actually catch bugs if the implementation is wrong.[^1][^2][^3]

***

### The Eight Essential Practices

#### 1. See the Test Fail Before Making It Pass

**Why:** To ensure the test will genuinely catch bugs if the implementation is incorrect. Many developers write tests that always pass (false positives) without realizing it.[^2][^1]

**How:**

- Write the test first
- Run it and watch it fail
- Confirm it fails for the RIGHT reason (assertion failure, not compilation error)
- Only then write code to make it pass

Jason emphasizes this in his workshops: "Make sure you see the test fail for the right reason. If I've trained or coached you in TDD, you'll have heard me encouraging you to make sure you see your test fail before you make it pass".[^4][^5]

#### 2. Implement Just Enough to See the Assertion Fail

**Why:** To distinguish between compilation errors and actual test failures.[^1]

**How:**

- If the test won't compile, add minimal stubs to make it compile
- Return null, empty arrays, or default values initially
- Run the test and verify the ASSERTION fails (not a NullPointerException)
- This proves the test is actually testing something

**Example from the TDD PDF:**

```java
public class VideoLibrary {
    public List<VideoTitle> getTitles() {
        return new ArrayList<VideoTitle>(); // Return empty, not null
    }
    public void donate(VideoTitle title) {
        // Empty stub
    }
}
```

Now the assertion can execute and fail properly, rather than throwing a NullPointerException.[^1]

#### 3. Apply The Golden Rule - Usage-Driven Design

**Why:** Forces tests to drive the design, not predetermined structure.[^6][^1]

**How:**

- **Don't write source code until a test requires it**
- Reference classes/methods/variables in the TEST first
- Let the code not compile - that's your 'failing test'
- Then declare them to fix compilation
- Aim for one thing broken at a time

**Anti-pattern to avoid:** Testing that an object is not null or testing getters before they're needed for actual behavior. As Jason states: "Be wary of writing tests like this, or that test getters, or other aspects of the implementation's structure. Chances are, you're doing what some of us call 'design-driven testing', and not 'test-driven design'".[^1]

#### 4. Start With the Assertion (Work Backwards)

**Why:** The test is about the QUESTION, so start there.[^2][^1]

**How:**

- Write the assertion FIRST
- Work backwards to discover what setup you need
- Let your IDE prompt you to create missing variables
- This prevents writing wrong setup for the question you want to ask

**Structure:** Assertion → Action → Setup (reverse of typical Arrange-Act-Assert)

Jason explains: "The test is all about the question, so in TDD we recommend you start there and work backwards to the set-up you need to ask it".[^1]

#### 5. One Reason to Fail

**Why:** Makes debugging easier and ensures baby steps.[^6][^1]

**How:**

- Each test should ask only ONE question
- Avoid multiple unrelated assertions in same test
- If test has multiple reasons to fail, break it into multiple tests
- Watch out for hidden assertions (mock expectations, expected exceptions)

**Example:** Don't test "generate Fibonacci sequence 0,1,1,2,3,5,8,13" in one test - that's 9 reasons to fail. Start with "first number is 0".[^1]

Jason warns: "When we test-drive the design of our code, we strive to take baby steps, making one decision at a time and getting feedback with each step".[^1]

#### 6. Use Triangulation for Non-Obvious Solutions

**Why:** Prevents over-engineering and ensures the simplest solution emerges.[^7][^8][^1]

**How:**

- Write simplest failing test (can pass with literal value)
- Make it pass with simplest code (even hardcoded like `return 42`)
- Write ANOTHER failing test that forces generalization
- Refactor to more general solution
- Repeat until no more failing tests can be conceived

**Analogy:** Crossing a lake via stepping stones - take small, safe steps instead of dangerous leaps.[^7]

**When to use:** When solution isn't obvious; when you're tempted to write complex logic immediately.[^1]

Jason's video demonstration explains: "Triangulation is the practice of generalizing our designs one failing test case at a time... What you don't want to do is try to leap from one shore to the opposite shore because it's quite possible that you will fall in".[^7]

#### 7. Baby Steps - Get to GREEN ASAP

**Why:** Fast feedback, less debugging, easier to undo mistakes.[^8][^2]

**How:**

- If you can pass test with `return 42`, do it!
- Don't stay in RED for more than a few minutes
- Take smallest step that moves toward solution
- Can undo last 2-3 lines if wrong, rather than 1 hour of work

**Mindset:** Everything worked 1-2 minutes ago, so bug must be in last few lines.[^8][^2]

#### 8. Test Names Should Explain WHAT Should Happen

**Why:** When test fails, a developer needs to know what SHOULD have happened.[^1]

**How:**

- Name describes the RULE or BEHAVIOR being tested
- Don't name after implementation details
- Think: "What would help someone fix this when it breaks?"
- One test method per distinct rule

**Example:**

- ✅ Good: `firstTwoNumbersAreSameAsIndex`
- ❌ Bad: `testGetNumber`

***

### Common Mistakes to Avoid

1. **Not Seeing Test Fail Before Making It Pass**
    - Risk: Test might be broken and always pass (false positive)
    - Fix: Always run test and see it fail with wrong result before implementing
2. **Test Fails for Wrong Reason** (NullPointerException not assertion)
    - Risk: Don't know if assertion actually works
    - Fix: Add minimal stub code to make assertion execute and fail
3. **Testing Too Many Things at Once**
    - Risk: Multiple design decisions before feedback, hard to debug
    - Fix: Break into separate single-question tests
4. **Writing Tests for Design You Already Have in Mind**
    - Risk: Design-driven testing instead of test-driven design
    - Fix: Focus on behaviors/outcomes, let structure emerge
5. **Taking Too Big Steps** (Leaping to Opposite Shore)
    - Risk: Stay in RED too long, complex debugging
    - Fix: Use triangulation and baby steps

***

### The RED Phase Checklist

- ☐ Write test assertion FIRST (the question)
- ☐ Work backwards to setup
- ☐ Run test - confirm it fails to COMPILE (Golden Rule in action)
- ☐ Add minimal declarations to make it compile
- ☐ Run test - confirm ASSERTION fails (not NullPointer exception)
- ☐ If not assertion failure, add stub that returns empty/default value
- ☐ Run test again - NOW assertion should fail
- ☐ Verify failure message makes sense
- ☐ Test name clearly states WHAT should happen
- ☐ Test asks only ONE question
- ☐ NOW ready for GREEN phase

***

### Key Resources

- **Codemanship TDD PDF** (codemanship.co.uk/tdd_jasongorman_codemanship.pdf) - Comprehensive 200+ page guide[^1]
- **Codemanship Blog** (codemanship.wordpress.com) - Ongoing insights and techniques[^9][^10][^11]
- **YouTube: TDD video series** by Jason Gorman - Visual demonstrations[^12][^13][^5][^7]
- **Workshop attendee notes** from TDD intensive courses[^14][^15][^2]

Jason Gorman's approach emphasizes that TDD is fundamentally a **design discipline** that uses tests as specifications, not merely a testing technique. The "proper RED" phase is about disciplined, incremental discovery of the right design through carefully crafted failing tests that guide you toward simple, working solutions.[^15][^6][^1]
<span style="display:none">[^16][^17][^18][^19][^20][^21][^22][^23][^24][^25][^26][^27][^28][^29][^30][^31][^32][^33][^34][^35][^36][^37][^38][^39][^40][^41][^42][^43][^44][^45][^46][^47][^48][^49][^50][^51][^52][^53][^54][^55][^56][^57][^58][^59][^60][^61][^62][^63][^64][^65][^66][^67][^68]</span>

<div align="center">⁂</div>

[^1]: https://codemanship.co.uk/tdd_jasongorman_codemanship.pdf

[^2]: https://paucls.wordpress.com/2018/12/01/attending-jason-gormans-tdd-workshop-1-12-2018/

[^3]: https://canro91.github.io/2021/02/05/FailingTest/

[^4]: https://www.linkedin.com/posts/jasongorman_before-i-get-suited-and-booted-an-historical-activity-7357466088390991873-XWc3

[^5]: https://www.youtube.com/watch?v=D3l39XGj3JQ

[^6]: https://www.linkedin.com/pulse/10-classic-tdd-mistakes-jason-gorman

[^7]: https://www.youtube.com/watch?v=E8gipX_C5fM

[^8]: https://www.tddfellow.com/blog/2016/10/19/do-more-with-baby-steps-tdd/

[^9]: https://codemanship.wordpress.com

[^10]: https://codemanship.wordpress.com/2019/12/04/the-4-gears-of-test-driven-development/

[^11]: https://codemanship.wordpress.com/category/refactoring/

[^12]: https://www.youtube.com/watch?v=Km0dFyKpUc4

[^13]: https://www.youtube.com/watch?v=Ylb8WngNZmg

[^14]: https://designcoderelease.blogspot.com/2015/07/a-day-of-intensive-tdd-training.html?m=1

[^15]: https://alvarogarcia7.github.io/blog/2015/04/12/jason-gorman-tdd-intensive-workshop/

[^16]: https://www.codecademy.com/article/tdd-red-green-refactor

[^17]: https://codemanship.co.uk/tdd.html

[^18]: https://buttondown.com/hillelwayne/archive/i-have-complicated-feelings-about-tdd-8403/

[^19]: https://info.codecast.io/blog/red-green-refactor-what-is-test-driven-development

[^20]: https://gds-way.digital.cabinet-office.gov.uk/standards/test-driven-development.html

[^21]: https://blog.cleancoder.com/uncle-bob/2014/12/17/TheCyclesOfTDD.html

[^22]: https://stackoverflow.com/questions/5750366/red-green-refactor-why-refactor

[^23]: https://martinfowler.com/bliki/TestDrivenDevelopment.html

[^24]: https://www.linkedin.com/posts/jasongorman_on-see-the-test-fail-in-tdd-thoughts-folks-activity-7383489118967857152-zlyq

[^25]: https://www.reddit.com/r/softwaretesting/comments/fji69v/could_anyone_share_what_would_be_the_best_way_of/

[^26]: https://www.reddit.com/r/ClaudeAI/comments/1mjfylo/i_got_obsessed_with_making_ai_agents_follow_tdd/

[^27]: https://amanagrawal.blog/2024/12/29/reflections-on-tdd-and-software-design-part-1/

[^28]: http://www.jamesshore.com/v2/blog/2005/red-green-refactor

[^29]: https://stackoverflow.com/questions/16150661/writing-tests-that-do-not-fail-first

[^30]: https://stackoverflow.com/questions/1079878/should-a-tdd-test-always-fail-first

[^31]: http://www.willprice.dev/2013/02/08/beginners-steps-with-tdd.html

[^32]: https://www.youtube.com/watch?v=UCx202d6dY0

[^33]: https://www.scrum.org/forum/scrum-forum/6832/why-tdd-always-fail

[^34]: https://www.slideshare.net/slideshow/tdd-and-simple-design-workshop-session-1-march-2019/133684842

[^35]: https://codemanship.wordpress.com/category/testing/

[^36]: https://groups.google.com/g/growing-object-oriented-software/c/dOmOIafFDcI

[^37]: https://www.reddit.com/r/javascript/comments/1816u68/why_we_dont_like_tdd/

[^38]: https://www.linkedin.com/posts/jasongorman_im-experimenting-with-trying-to-articulate-activity-7376160091995119617-Uk1-

[^39]: https://corgibytes.com/blog/2016/09/20/refactoring-against-the-red-bar/

[^40]: https://scalablehuman.com/2023/03/16/what-is-red-green-refactor/

[^41]: https://www.contino.io/insights/test-driven-development

[^42]: https://amanagrawal.blog/2024/12/30/reflections-on-tdd-and-software-design-part-2/

[^43]: https://stackoverflow.com/questions/360849/tdd-when-is-it-okay-to-write-a-non-failing-test

[^44]: https://www.youtube.com/watch?v=e_Twc6kZymo

[^45]: https://www.linkedin.com/posts/jasongorman_you-run-your-tests-they-all-pass-whats-activity-7371447243473690624-gEU3

[^46]: https://brocoders.com/blog/comprehensive-guide-to-test-driven-development/

[^47]: https://www.codingdojo.com/blog/test-driven-development

[^48]: https://codemanship.wordpress.com/2019/10/

[^49]: https://rachelcarmena.github.io/2019/04/26/does-and-donts-when-writing-tests.html

[^50]: https://codemanship.wordpress.com/2019/10/26/how-to-beat-evil-fizzbuzz/

[^51]: https://codemanship.wordpress.com/category/learning/

[^52]: https://codemanship.wordpress.com/2019/07/25/codemanship-exercise-play-through-cd-warehouse-part-1/

[^53]: https://codemanship.wordpress.com/2019/11/22/adventures-in-multi-threading/

[^54]: https://ww2.mathworks.cn/help/matlab/delaunay-triangulation.html

[^55]: https://codemanship.wordpress.com/2019/11/08/the-2-most-critical-feedback-loops-in-software-development/

[^56]: https://dev.to/xoubaman/refactoring-with-baby-steps-3mgg

[^57]: https://codemanship.wordpress.com/2020/01/

[^58]: https://news.ycombinator.com/item?id=12475612

[^59]: https://codemanship.wordpress.com/category/tdd/

[^60]: https://codemanship.wordpress.com/2021/07/19/inner-loop-agility-or-why-your-agile-transformation-failed/

[^61]: https://www.coursehero.com/tutors-problems/Computer-Science/61621270-TriangleAreajava14-error-constructor-Triangle-in-class-Triangle/

[^62]: https://dictionary.cambridge.org/zht/詞典/英語-漢語-繁體/triangulation

[^63]: https://codemanship.wordpress.com/author/codemanship/

[^64]: https://www.scribbr.com/methodology/triangulation/

[^65]: https://www.linkedin.com/pulse/developers-traps-avoid-write-clean-code-zahra-samadzadegan

[^66]: https://www.linkedin.com/posts/jasongorman_having-good-fun-with-my-tdd-group-today-activity-7322642557253902336-VAEs

[^67]: https://blog.thecodewhisperer.com/permalink/going-further-with-one-outcome-per-test

[^68]: https://www.youtube.com/watch?v=s53d_gWMonQ
