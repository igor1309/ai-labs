import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('lane_run', Path(__file__).parents[1] / 'lane_run.py')
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class LaneRunTests(unittest.TestCase):
    def test_selects_newest_available_ios_numerically(self):
        values = [{'identifier': 'old', 'version': '9.9', 'name': 'iOS 9.9', 'isAvailable': True},
                  {'identifier': 'new', 'version': '26.2', 'name': 'iOS 26.2', 'isAvailable': True},
                  {'identifier': 'missing', 'version': '27.0', 'name': 'iOS 27.0', 'isAvailable': False},
                  {'identifier': 'tv', 'version': '30.0', 'name': 'tvOS 30', 'isAvailable': True}]
        self.assertEqual(runner.select_runtime(values)['identifier'], 'new')
        with self.assertRaises(ValueError):
            runner.select_runtime([])

    def test_selects_newest_device_type_the_runtime_supports(self):
        types = [{'identifier': 'old-phone', 'name': 'iPhone 6s Plus', 'productFamily': 'iPhone', 'minRuntimeVersion': 9},
                 {'identifier': 'new-phone', 'name': 'iPhone 17', 'productFamily': 'iPhone', 'minRuntimeVersion': 26},
                 {'identifier': 'mid-phone', 'name': 'iPhone 15', 'productFamily': 'iPhone', 'minRuntimeVersion': 17},
                 {'identifier': 'pod', 'name': 'iPod touch', 'productFamily': 'iPhone', 'minRuntimeVersion': 12},
                 {'identifier': 'pad', 'name': 'iPad Air', 'productFamily': 'iPad', 'minRuntimeVersion': 14}]
        runtime = {'supportedDeviceTypes': [{'identifier': i} for i in ('mid-phone', 'new-phone', 'pod', 'pad')]}
        self.assertEqual(runner.select_device_type(types, runtime, 'iPhone')['identifier'], 'new-phone')
        self.assertEqual(runner.select_device_type(types, runtime, 'iPad')['identifier'], 'pad')
        with self.assertRaises(ValueError):
            runner.select_device_type(types, {'supportedDeviceTypes': [{'identifier': 'old-phone'}]}, 'iPad')

    def test_rejects_unknown_lanes_and_unsafe_manifests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                runner.load_lanes(root, ['missing'])
            lane = root / 'lanes' / 'S-1-test'
            lane.mkdir(parents=True)
            for part in ({'name': '../escape'}, {'name': 'host', 'flow': '../bad.yaml', 'settings': 'host.json', 'device': 'iPad', 'expected': []}):
                (lane / 'lane.json').write_text(json.dumps({'parts': [part]}))
                with self.assertRaises(ValueError):
                    runner.load_lanes(root, [])

    def test_every_scenario_has_its_parts_and_human_assertions(self):
        root = Path(__file__).resolve().parents[3] / 'maestro'
        lanes = runner.load_lanes(root, [])
        self.assertEqual({int(lane['id'].split('-')[1]) for lane in lanes}, set(range(1, 16)))
        for lane in lanes:
            number = int(lane['id'].split('-')[1])
            parts = lane['parts']
            self.assertEqual(len(parts), 2 if number in (1, 2, 3, 7, 9, 15) else 1)
            for part in parts:
                flow = (lane['path'] / part['flow']).read_text()
                self.assertIn('assertVisible:', flow)
                self.assertNotIn('launchArguments', flow)
                self.assertNotIn('runScript', flow)
                self.assertTrue(part['expected'])
            if number == 14:
                self.assertIn('stopApp', flow)
                self.assertIn('clearState: false', flow)
                self.assertIn('tapOn: "90 s"', flow)
                self.assertIn('90 seconds left', flow)

    def test_run_reports_results_delivers_settings_and_cleans_only_own_clones(self):
        for failed, keep in ((False, False), (True, False), (True, True)):
            with self.subTest(failed=failed, keep=keep), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'maestro'
                lane = root / 'lanes' / 'S-1-test'
                lane.mkdir(parents=True)
                (lane / 'host.json').write_text('{"hosts":[{"amount":12345}]}')
                (lane / 'host.yaml').write_text('flow')
                part = {'name': 'host', 'flow': 'host.yaml', 'settings': 'host.json', 'device': 'iPad',
                        'expected': [{'category': 'hostPayment', 'phase': 'paid'}]}
                spy = Commands(Path(directory), failed)
                result = runner.Runner(root, spy, '2026-10-29-1200', lambda: 1, keep=keep).run([
                    {'id': 'S-1-test', 'path': lane, 'parts': [part]}])
                self.assertEqual(result, int(failed))
                report = (root / 'runs' / '2026-10-29-1200.md').read_text()
                self.assertIn('FAIL' if failed else 'PASS', report)
                for pin in ('Commit', 'Dirty', 'Xcode', 'Runtime', 'Maestro', 'App build'):
                    self.assertIn(pin, report)
                self.assertIn('host.png', report)
                self.assertIn('| FAIL | PASS |' if failed else '| PASS | PASS |', report)
                self.assertEqual(json.loads((spy.container / 'Documents/scripted-radio.json').read_text()),
                                 {'hosts': [{'amount': 12345}]})
                deleted = [c[-1] for c in spy.calls if c[:3] == ['xcrun', 'simctl', 'delete']]
                self.assertEqual(deleted, [] if failed and keep else ['own-clone'])
                self.assertTrue(any(c[:3] == ['maestro', '--device', 'own-clone'] for c in spy.calls))
                self.assertFalse(any('Rehearsal iPhone' in ' '.join(c) for c in spy.calls))

    def test_a_failing_part_skips_its_lane_and_the_next_lane_still_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'maestro'
            lanes = []
            for name, flows in (('S-1-first', ('bad.yaml', 'skipped.yaml')), ('S-2-second', ('good.yaml',))):
                path = root / 'lanes' / name
                path.mkdir(parents=True)
                (path / 'host.json').write_text('{}')
                parts = []
                for flow in flows:
                    (path / flow).write_text('flow')
                    parts.append({'name': flow.removesuffix('.yaml'), 'flow': flow, 'settings': 'host.json',
                                  'device': 'iPad', 'expected': [{'category': 'hostPayment', 'phase': 'paid'}]})
                lanes.append({'id': name, 'path': path, 'parts': parts})
            spy = Commands(Path(directory), False)
            spy.fail_flows = {'bad.yaml'}
            result = runner.Runner(root, spy, '2026-10-29-1203', lambda: 1).run(lanes)
            self.assertEqual(result, 1)
            flows = [Path(c[-1]).name for c in spy.calls if c[0] == 'maestro' and 'test' in c]
            self.assertEqual(flows, ['bad.yaml', 'good.yaml'])
            report = (root / 'runs' / '2026-10-29-1203.md').read_text()
            self.assertIn('## S-2-second', report)
            self.assertIn('| good | PASS |', report)

    def test_a_failed_screenshot_keeps_the_error_that_ended_the_part(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'maestro'
            lane = root / 'lanes' / 'S-1-test'
            lane.mkdir(parents=True)
            (lane / 'host.json').write_text('{}')
            (lane / 'host.yaml').write_text('flow')
            part = {'name': 'host', 'flow': 'host.yaml', 'settings': 'host.json', 'device': 'iPad', 'expected': []}
            spy = Commands(Path(directory), False)
            spy.fail_commands = {'install', 'screenshot'}
            result = runner.Runner(root, spy, '2026-10-29-1204', lambda: 1).run([
                {'id': 'S-1-test', 'path': lane, 'parts': [part]}])
            self.assertEqual(result, 1)
            report = (root / 'runs' / '2026-10-29-1204.md').read_text()
            self.assertIn('install', report)
            self.assertIn('screenshot failed', report)

    def test_dirty_pin_leaves_out_the_runs_own_reports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'maestro'
            spy = Commands(Path(directory), False)
            runner.Runner(root, spy, '2026-10-29-1205', lambda: 1).run([])
            status = [c for c in spy.calls if c[0] == 'git' and 'status' in c]
            self.assertEqual(len(status), 1)
            self.assertIn(':(top)', status[0])
            self.assertIn(':(exclude)runs', status[0])

    def test_cleanup_failure_makes_the_run_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'maestro'
            spy = Commands(Path(directory), False)
            spy.fail_delete = True
            try:
                sut = runner.Runner(root, spy, '2026-10-29-1202', lambda: 1)
                sut.clones.add('own-clone')
                result = sut.run([])
            except RuntimeError:
                result = -1
            self.assertEqual(result, 1)
            self.assertIn('FAIL cleanup: could not delete own-clone', sut.report.read_text())

    def test_setup_failure_is_reported_without_deleting_a_base(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'maestro'
            spy = Commands(Path(directory), False)
            spy.fail_setup = True
            result = runner.Runner(root, spy, '2026-10-29-1201', lambda: 1).run([])
            self.assertEqual(result, 1)
            report = root / 'runs' / '2026-10-29-1201.md'
            self.assertTrue(report.exists())
            self.assertIn('BLOCKED', report.read_text())
            self.assertFalse(any(c[:3] == ['xcrun', 'simctl', 'delete'] for c in spy.calls))


class Commands:
    def __init__(self, root, fail_flow):
        self.calls = []
        self.container = root / 'container'
        self.container.mkdir()
        self.fail_flow = fail_flow
        self.fail_setup = False
        self.fail_delete = False
        self.fail_flows = set()
        self.fail_commands = set()

    def __call__(self, args, **kwargs):
        args = list(map(str, args))
        self.calls.append(args)
        output, code = '', 0
        if args[:2] == ['xcrun', 'simctl'] and (set(args[2:5]) & self.fail_commands):
            return subprocess.CompletedProcess(args, 1, '', args[2] + ' failed')
        if args[:3] == ['xcrun', 'simctl', 'list']:
            if self.fail_setup:
                raise RuntimeError('CoreSimulator connection refused')
            if 'runtimes' in args:
                output = json.dumps({'runtimes': [{'identifier': 'ios26', 'name': 'iOS 26.2', 'version': '26.2', 'isAvailable': True}]})
            elif 'devicetypes' in args:
                output = json.dumps({'devicetypes': [{'name': 'iPhone 17', 'identifier': 'phone'}, {'name': 'iPad Pro', 'identifier': 'pad'}]})
            else:
                output = json.dumps({'devices': {'ios26': [{'name': 'Mizan Lanes iPhone', 'udid': 'base-phone', 'isAvailable': True}, {'name': 'Mizan Lanes iPad', 'udid': 'base-pad', 'isAvailable': True}]}})
        elif args[:3] == ['xcrun', 'simctl', 'delete']:
            code = int(self.fail_delete)
        elif args[:3] == ['xcrun', 'simctl', 'clone']:
            output = 'own-clone'
        elif args[:3] == ['xcrun', 'simctl', 'get_app_container']:
            output = str(self.container)
        elif args[:3] == ['xcrun', 'simctl', 'spawn']:
            output = '[mizan-ble:hostPayment] phase=paid'
        elif args[0] == 'maestro' and 'test' in args:
            code = int(self.fail_flow or Path(args[-1]).name in self.fail_flows)
            output = 'flow assertion failed' if code else 'flow passed'
        elif args[0] == 'git':
            output = 'abc123' if 'rev-parse' in args else ' M lane.json'
        elif args[:2] == ['xcodebuild', '-version']:
            output = 'Xcode 26.3'
        elif args[0] == 'maestro':
            output = '2.12.0'
        elif args[0] == '/usr/libexec/PlistBuddy':
            output = '1'
        return subprocess.CompletedProcess(args, code, output, '')
