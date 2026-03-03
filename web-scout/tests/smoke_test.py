# web-scout/tests/smoke_test.py
import json
import pytest
from smoke import run

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
