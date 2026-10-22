"""Tests of check-modules.py over made-up packages: python3 scripts/check_modules_test.py"""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("check_modules", pathlib.Path(__file__).with_name("check-modules.py"))
check_modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_modules)


def package(*targets):
    """targets: (name, type, [deps]); each production target gets a test target."""
    listed = []
    for name, kind, deps in targets:
        listed.append({"name": name, "type": kind, "dependencies": [{"byName": [d, None]} for d in deps]})
    return {"targets": listed}


def tested(name, deps=(), kind="regular"):
    return [(name, kind, list(deps)), (f"{name}Tests", "test", [name])]


def check(*groups, imports=None):
    targets = [t for group in groups for t in group]
    return check_modules.check(package(*targets), lambda name: (imports or {}).get(name, {"Foundation"}))


class CheckModulesTests(unittest.TestCase):
    def test_a_layout_by_the_rules_holds(self):
        self.assertEqual(check(
            tested("CallDomain"), tested("CallsCore", ["CallDomain"]), tested("CallsUI", ["CallsCore", "CallDomain"]),
            tested("FileCallStore", ["CallDomain", "CallsCore"]),
            [("Audelin", "executable", ["CallsUI", "FileCallStore"])],
        ), [])

    def test_domain_depending_on_a_core(self):
        self.assertEqual(check(tested("CallDomain", ["CallsCore"]), tested("CallsCore")),
                         ["invariant 1 Domain depends on nothing of ours: CallDomain depends on CallsCore"])

    def test_a_core_depending_on_another_core(self):
        self.assertEqual(check(tested("CallDomain"), tested("CallsCore"), tested("SetupCore", ["CallsCore"])),
                         ["invariant 2 a Core depends on Domain only: SetupCore depends on CallsCore"])

    def test_a_ui_depending_on_another_features_core(self):
        self.assertEqual(check(tested("CallsCore"), tested("SetupCore"), tested("CallsUI", ["SetupCore"])),
                         ["invariant 2 a UI depends on its Core and Domain only: CallsUI depends on SetupCore"])

    def test_an_adapter_depending_on_an_adapter(self):
        self.assertEqual(check(tested("CallsCore"), tested("FileCallStore", ["CallsCore"]),
                               tested("Recorder", ["FileCallStore"])),
                         ["invariant 3 an adapter depends on Domain and Cores only: Recorder depends on FileCallStore"])

    def test_a_target_without_tests(self):
        self.assertEqual(check(tested("CallDomain"), [("CallsCore", "regular", ["CallDomain"])]),
                         ["invariant 5 every production target has a test target: CallsCore has no CallsCoreTests"])

    def test_a_core_importing_a_framework(self):
        self.assertEqual(check(tested("CallsCore"), imports={"CallsCore": {"Foundation", "AVFoundation"}}),
                         ["invariant 6 Domain and Cores use Foundation only: CallsCore imports AVFoundation"])

    def test_a_test_reaching_past_its_subject(self):
        self.assertEqual(check(tested("CallDomain"), tested("CallsCore", ["CallDomain"]),
                               [("FileCallStore", "regular", ["CallsCore"]),
                                ("FileCallStoreTests", "test", ["FileCallStore", "TranscriptCore"])],
                               tested("TranscriptCore")),
                         ["test rule: FileCallStoreTests depends on TranscriptCore, outside its subject and the subject's dependencies"])

    def test_helpers_only_tests_use_are_not_production(self):
        self.assertEqual(check(
            tested("CallDomain"),
            [("Recorder", "regular", ["CallDomain"]), ("RecorderTestSupport", "regular", ["CallDomain"]),
             ("recorder-crash-child", "executable", ["Recorder", "RecorderTestSupport"]),
             ("RecorderTests", "test", ["Recorder", "RecorderTestSupport", "recorder-crash-child"])],
        ), [])


if __name__ == "__main__":
    unittest.main()
