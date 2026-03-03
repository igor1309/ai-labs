# web-scout/smoke.py
import json
import os

QUERY = "Python programming language"


def run(scout, judge, docker_logs, env=None, print_fn=print):
    if env is None:
        env = os.environ

    if not env.get("SEARXNG_URL"):
        print_fn("FAIL: SEARXNG_URL environment variable is required")
        return 1
    if not env.get("NOMOS_API_KEY"):
        print_fn("FAIL: NOMOS_API_KEY environment variable is required")
        return 1
    if not env.get("NOMOS_BASE_URL"):
        print_fn("FAIL: NOMOS_BASE_URL environment variable is required")
        return 1

    try:
        result = scout(QUERY)
    except Exception:
        print_fn("FAIL: scout agent raised an exception")
        return 1

    if not result or not result.strip():
        print_fn("FAIL: scout agent produced empty output")
        return 1

    try:
        parsed = json.loads(result)
    except (json.JSONDecodeError, ValueError):
        print_fn("FAIL: scout result is not valid JSON")
        return 1

    if not isinstance(parsed.get("results"), list) or len(parsed["results"]) == 0:
        print_fn("FAIL: results array is empty")
        return 1

    for r in parsed["results"]:
        if not r.get("title") or not r.get("url"):
            print_fn("FAIL: result missing non-empty title or url")
            return 1

    try:
        logs = docker_logs()
    except Exception:
        logs = "(unavailable)"

    judge_result = judge(QUERY, result, logs)

    words = (judge_result or "").strip().split()
    first_word = words[0].upper() if words else ""

    if first_word not in ("PASS", "FAIL"):
        print_fn("FAIL: judge verdict unparseable (must start with PASS or FAIL)")
        return 1
    if first_word == "FAIL":
        print_fn(f"FAIL\n{judge_result}")
        return 1

    print_fn(f"PASS\n{judge_result}")
    return 0


def _make_llm(env):
    from crewai import LLM
    return LLM(
        model="openai/gpt-5-nano",
        base_url=env["NOMOS_BASE_URL"] + "/v1",
        api_key=env["NOMOS_API_KEY"],
    )


def make_scout(env):
    from pathlib import Path
    from crewai import Agent, Task, Crew
    from crewai.tools.mcp_tools import MCPServerAdapter
    from mcp import StdioServerParameters

    llm = _make_llm(env)
    index_path = str(Path(__file__).parent / "src" / "index.js")

    def scout(query):
        mcp_params = StdioServerParameters(
            command="node",
            args=[index_path],
            env=dict(env),
        )
        with MCPServerAdapter(mcp_params) as mcp:
            search_tools = [t for t in mcp.tools if t.name == "search"]
            agent = Agent(
                role="Web Scout",
                goal=f'Search for "{query}" and return the raw JSON result verbatim',
                backstory="You are a web search agent. Use the search tool and return only the raw JSON result, nothing else.",
                tools=search_tools,
                llm=llm,
                verbose=False,
            )
            task = Task(
                description=f'Use the search tool to search for "{query}" and return only the raw JSON result verbatim, with no other text.',
                expected_output="Raw JSON string from the search tool",
                agent=agent,
            )
            crew = Crew(agents=[agent], tasks=[task], verbose=False)
            output = crew.kickoff().raw
            if not output or not output.strip():
                raise ValueError("Scout agent produced empty output")
            return output.strip()

    return scout
