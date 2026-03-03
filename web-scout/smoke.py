# web-scout/smoke.py
import json
import os

QUERY = "Python programming language"


def run(scout, judge, docker_logs, env=None, print_fn=print, langfuse=None):
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

    trace = langfuse.trace(name="web-scout-smoke") if langfuse is not None else None
    try:
        scout_span = trace.span(name="scout-agent") if trace else None
        try:
            result = scout(QUERY)
        except Exception:
            if scout_span:
                scout_span.update(level="ERROR")
                scout_span.end()
            if trace:
                trace.update(level="ERROR")
            print_fn("FAIL: scout agent raised an exception")
            return 1  # error recorded on span and trace before exit
        if scout_span:
            scout_span.end()

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

        judge_span = trace.span(name="judge-agent") if trace else None
        judge_result = judge(QUERY, result, logs)
        if judge_span:
            judge_span.end()

        words = (judge_result or "").strip().split()
        first_word = words[0].upper() if words else ""

        if first_word not in ("PASS", "FAIL"):
            print_fn("FAIL: judge verdict unparseable (must start with PASS or FAIL)")
            return 1
        if first_word == "FAIL":
            if trace:
                trace.update(output=judge_result, level="ERROR")
            print_fn(f"FAIL\n{judge_result}")
            return 1

        if trace:
            trace.update(output=judge_result, level="DEFAULT")
        print_fn(f"PASS\n{judge_result}")
        return 0
    finally:
        if langfuse is not None:
            langfuse.flush()


def make_langfuse_client(env):
    """Returns a Langfuse client when keys are present, None otherwise."""
    secret = env.get("LANGFUSE_SECRET_KEY")
    public = env.get("LANGFUSE_PUBLIC_KEY")
    if not secret or not public:
        return None
    from langfuse import Langfuse
    kwargs = {"secret_key": secret, "public_key": public}
    host = env.get("LANGFUSE_BASE_URL")
    if host:
        kwargs["host"] = host
    return Langfuse(**kwargs)


def _make_llm(env):
    from crewai import LLM
    # LiteLLM strips the leading "openai/" provider prefix before forwarding to
    # the custom base_url, so "openai/openai/gpt-4o-mini" arrives at nomos as
    # model="openai/gpt-4o-mini" — the full OpenRouter model ID.
    return LLM(
        model="openai/openai/gpt-4o-mini",
        base_url=env["NOMOS_BASE_URL"] + "/v1",
        api_key=env["NOMOS_API_KEY"],
    )


def make_scout(env, langfuse_client=None, parent_observation_id=None):
    from pathlib import Path
    from crewai import Agent, Task, Crew
    from crewai_tools import MCPServerAdapter
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
            mcp_search = next((t for t in mcp if t.name == "search"), None)
            if mcp_search is None:
                raise ValueError("search tool not found in MCP server")

            from crewai.tools import BaseTool
            from pydantic import BaseModel, Field

            class SearchInput(BaseModel):
                query: str = Field(..., description="Search query string")

            class SearchTool(BaseTool):
                name: str = "search"
                description: str = "Search the web using SearXNG and return JSON results"
                args_schema: type[BaseModel] = SearchInput

                def _run(self, query: str) -> str:
                    return mcp_search._run(query=query)

            search_tools = [SearchTool()]
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

            callbacks = []
            if langfuse_client is not None and parent_observation_id is not None:
                from langfuse.callback import LangfuseCallbackHandler
                callbacks = [LangfuseCallbackHandler(
                    observation_id=parent_observation_id,
                    update_stateful_client=False,
                )]

            output = crew.kickoff(callbacks=callbacks).raw
            if not output or not output.strip():
                raise ValueError("Scout agent produced empty output")
            return output.strip()

    return scout


def make_judge(env, langfuse_client=None, parent_observation_id=None):
    from crewai import Agent, Task, Crew

    llm = _make_llm(env)

    def judge(query, results_json, logs):
        agent = Agent(
            role="Search Result Judge",
            goal=f'Evaluate web search results for the query "{query}"',
            backstory="You evaluate search result quality. Begin your response with PASS or FAIL.",
            tools=[],
            llm=llm,
            verbose=False,
        )
        task = Task(
            description=(
                f'Evaluate these web search results for the query "{query}".\n\n'
                f'Results JSON:\n{results_json}\n\n'
                f'Docker logs:\n{logs}\n\n'
                'Start your answer with PASS or FAIL, then explain why.'
            ),
            expected_output="Verdict starting with PASS or FAIL followed by explanation",
            agent=agent,
        )
        crew = Crew(agents=[agent], tasks=[task], verbose=False)

        callbacks = []
        if langfuse_client is not None and parent_observation_id is not None:
            from langfuse.callback import LangfuseCallbackHandler
            callbacks = [LangfuseCallbackHandler(
                observation_id=parent_observation_id,
                update_stateful_client=False,
            )]

        return crew.kickoff(callbacks=callbacks).raw or ""

    return judge


def make_docker_logs():
    import subprocess

    def docker_logs():
        result = subprocess.run(
            ["docker", "logs", "--tail", "50", "searxng"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    return docker_logs


if __name__ == "__main__":
    import sys

    env = dict(os.environ)
    langfuse_client = make_langfuse_client(env)
    code = run(
        scout=make_scout(env, langfuse_client=langfuse_client),
        judge=make_judge(env, langfuse_client=langfuse_client),
        docker_logs=make_docker_logs(),
        env=env,
        langfuse=langfuse_client,
    )
    sys.exit(code)
