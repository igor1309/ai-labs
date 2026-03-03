# web-scout/tests/smoke_test.py
import json
import pytest
from unittest.mock import MagicMock, patch
from smoke import run, run_with_langfuse

VALID_RESULTS_JSON = json.dumps({
    "results": [{"title": "Python", "url": "https://python.org"}],
    "query": "Python programming language",
    "number_of_results": 1,
})


# --- Helpers ---

def make_scout(result=VALID_RESULTS_JSON, raises=False):
    def scout(query):
        if raises:
            raise RuntimeError("scout failed")
        return result
    return scout


def make_judge(result="PASS results look relevant"):
    def judge(query, results_json, logs):
        return result
    return judge


def make_docker_logs(logs="some logs", raises=False):
    def docker_logs():
        if raises:
            raise RuntimeError("docker not running")
        return logs
    return docker_logs


def make_env(**overrides):
    base = {
        "SEARXNG_URL": "http://localhost:8888",
        "NOMOS_API_KEY": "test-key",
        "NOMOS_BASE_URL": "http://nomos:8080",
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


def make_deps(**overrides):
    base = dict(
        scout=make_scout(),
        judge=make_judge(),
        docker_logs=make_docker_logs(),
        env=make_env(),
        print_fn=lambda *_: None,
    )
    base.update(overrides)
    return base


def make_langfuse_env(**overrides):
    base = {
        "LANGFUSE_SECRET_KEY": "sk-test",
        "LANGFUSE_PUBLIC_KEY": "pk-test",
        "LANGFUSE_BASE_URL": "http://langfuse:3000",
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


def make_mock_langfuse():
    lf = MagicMock()
    trace = MagicMock()
    scout_span = MagicMock()
    mcp_span = MagicMock()
    judge_span = MagicMock()
    lf.start_span.return_value = trace
    trace.start_span.side_effect = lambda name, **kw: scout_span if name == "scout-agent" else judge_span
    scout_span.start_span.return_value = mcp_span
    return lf, trace, scout_span, judge_span, mcp_span


# --- Tests ---

def test_exits_nonzero_whenSearxngUrlMissing():
    code = run(**make_deps(env=make_env(SEARXNG_URL=None)))
    assert code == 1


def test_exits_nonzero_whenNomosApiKeyMissing():
    code = run(**make_deps(env=make_env(NOMOS_API_KEY=None)))
    assert code == 1


def test_exits_nonzero_whenNomosBaseUrlMissing():
    code = run(**make_deps(env=make_env(NOMOS_BASE_URL=None)))
    assert code == 1


@pytest.mark.parametrize("raises,result", [
    (True, VALID_RESULTS_JSON),
    (False, ""),
], ids=["raises", "empty_output"])
def test_exits_nonzero_whenScoutReturnsNoResult(raises, result):
    code = run(**make_deps(scout=make_scout(raises=raises, result=result)))
    assert code == 1


def test_exits_nonzero_whenResultsJsonUnparseable():
    code = run(**make_deps(scout=make_scout(result="not json")))
    assert code == 1


def test_exits_nonzero_whenResultsArrayEmpty():
    empty = json.dumps({"results": [], "query": "Python programming language", "number_of_results": 0})
    code = run(**make_deps(scout=make_scout(result=empty)))
    assert code == 1


def test_exits_nonzero_whenResultMissingTitleOrUrl():
    missing_url = json.dumps({"results": [{"title": "Python"}], "number_of_results": 1})
    code = run(**make_deps(scout=make_scout(result=missing_url)))
    assert code == 1


def test_exits_nonzero_whenJudgeVerdictIsFail():
    code = run(**make_deps(judge=make_judge(result="FAIL results not relevant")))
    assert code == 1


def test_exits_nonzero_whenJudgeVerdictIsUnparseable():
    code = run(**make_deps(judge=make_judge(result="maybe this is ok")))
    assert code == 1


def test_logsUnavailable_doesNotAbort_scriptContinuesToJudge():
    judge_called = []

    def judge(query, results_json, logs):
        judge_called.append(logs)
        return "PASS ok"

    code = run(**make_deps(docker_logs=make_docker_logs(raises=True), judge=judge))
    assert code == 0
    assert judge_called == ["(unavailable)"]


def test_exits_zero_whenSearxngRunningAndResultsRelevant():
    code = run(**make_deps())
    assert code == 0


# --- Langfuse observability tests ---

def test_noLangfuseKeys_doesNotInstantiateLangfuseClient():
    from smoke import make_langfuse_client
    client = make_langfuse_client({})
    assert client is None


def test_langfuseKeys_present_clientInstantiated():
    import sys
    mock_lf_module = MagicMock()
    mock_instance = MagicMock()
    mock_lf_module.Langfuse.return_value = mock_instance
    with patch.dict(sys.modules, {"langfuse": mock_lf_module}):
        from smoke import make_langfuse_client
        client = make_langfuse_client(make_langfuse_env())
        mock_lf_module.Langfuse.assert_called_once_with(
            secret_key="sk-test",
            public_key="pk-test",
            host="http://langfuse:3000",
        )
        assert client is mock_instance


def test_smokePass_traceFlushed():
    lf, *_ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps())
    lf.flush.assert_called_once()


def test_smokeFail_traceFlushed():
    lf, *_ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps(judge=make_judge(result="FAIL not relevant")))
    lf.flush.assert_called_once()


def test_scoutException_spanMarkedError_traceFlushed():
    lf, trace, scout_span, _, _ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps(scout=make_scout(raises=True)))
    scout_span.update.assert_any_call(level="ERROR")
    trace.update.assert_any_call(level="ERROR")
    lf.flush.assert_called_once()


def test_traceOutput_isVerdictString():
    lf, trace, *_ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps(judge=make_judge(result="PASS results look relevant")))
    trace.update.assert_any_call(output="PASS results look relevant", level="DEFAULT")


def test_traceLevelError_onFail():
    lf, trace, *_ = make_mock_langfuse()
    code = run_with_langfuse(lf, **make_deps(judge=make_judge(result="FAIL not relevant")))
    assert code == 1
    trace.update.assert_any_call(output="FAIL not relevant", level="ERROR")


def test_traceLevelDefault_onPass():
    lf, trace, *_ = make_mock_langfuse()
    code = run_with_langfuse(lf, **make_deps())
    assert code == 0
    trace.update.assert_any_call(output="PASS results look relevant", level="DEFAULT")


def test_mcpSearchSpan_recordsInputAndOutput():
    lf, trace, scout_span, _, mcp_span = make_mock_langfuse()
    code = run_with_langfuse(lf, **make_deps())
    assert code == 0
    scout_span.start_span.assert_called_once_with(name="mcp-search", input={"query": "Python programming language"})
    mcp_span.update.assert_called_once_with(output=VALID_RESULTS_JSON)
    mcp_span.end.assert_called_once()


def test_rootTrace_taggedAsWebScout():
    lf, trace, *_ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps())
    trace.update_trace.assert_called_once_with(tags=["smoke", "web-scout"])
