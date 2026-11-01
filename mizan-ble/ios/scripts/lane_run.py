"""Sequential Maestro lanes; external programs are supplied by the composition root."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

# A direct script and importlib-based unittest discovery both resolve the sibling helper.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lane_check import check_air, check_log

BUNDLE = 'dev.igor1309.mizan-ble.rehearsal'


def select_runtime(runtimes):
    available = [r for r in runtimes if r.get('isAvailable') and r['name'].startswith('iOS ')]
    if not available:
        raise ValueError('no available iOS runtime')
    return max(available, key=lambda r: tuple(int(n) for n in r['version'].split('.')))


def select_device_type(types, runtime, kind):
    supported = {t['identifier'] for t in runtime.get('supportedDeviceTypes', [])}
    suitable = [t for t in types if t['identifier'] in supported
                and t.get('productFamily') == kind and t['name'].startswith(kind)]
    if not suitable:
        raise ValueError('no device type: ' + kind)
    return max(suitable, key=lambda t: t.get('minRuntimeVersion', 0))


def load_lanes(root, names):
    directories = sorted((root / 'lanes').glob('S-*'), key=lambda p: int(p.name.split('-')[1]))
    chosen = []
    for name in names:
        matches = [p for p in directories if p.name == name or p.name.split('-')[:2] == name.split('-')]
        if len(matches) != 1:
            raise ValueError('unknown lane: ' + name)
        if matches[0] not in chosen:
            chosen.append(matches[0])
    lanes = []
    for path in chosen if names else directories:
        manifest = json.loads((path / 'lane.json').read_text())
        if not manifest.get('parts'):
            raise ValueError('lane has no parts: ' + path.name)
        seen = set()
        for part in manifest['parts']:
            name = part.get('name', '')
            if not re.fullmatch(r'[a-z][a-z0-9-]*', name) or name in seen:
                raise ValueError('invalid or duplicate part name')
            seen.add(name)
            if part.get('device') not in ('iPhone', 'iPad') or not part.get('expected'):
                raise ValueError('part needs a device and expected log lines')
            for key, suffix in (('flow', '.yaml'), ('settings', '.json')):
                value = part.get(key, '')
                if Path(value).name != value or not value.endswith(suffix) or not (path / value).is_file():
                    raise ValueError('invalid part ' + key)
            for expected in part['expected']:
                if not all(isinstance(expected.get(k), str) and expected[k] for k in ('category', 'phase')):
                    raise ValueError('invalid expected line')
        lanes.append(dict(manifest, id=path.name, path=path))
    if not lanes:
        raise ValueError('no lanes')
    return lanes


class Runner:
    def __init__(self, root, command, stamp, now, keep=False):
        self.root, self.command, self.stamp, self.now, self.keep = root, command, stamp, now, keep
        self.ios = root.parent / 'ios'
        self.build = self.ios / '.build' / 'lanes'
        self.artifacts = root / 'runs' / stamp
        self.report = root / 'runs' / (stamp + '.md')
        self.clones = set()
        self.retained = set()
        self.pins = {}

    def call(self, args, artifact=None, required=True, **kwargs):
        result = self.command(list(map(str, args)), **kwargs)
        if artifact:
            artifact.write_text(result.stdout + (result.stderr or ''))
        if required and result.returncode:
            raise RuntimeError('command failed: ' + ' '.join(map(str, args)) + (f' (see {artifact.name})' if artifact else ''))
        return result

    def output(self, args):
        return self.call(args).stdout.strip()

    def append(self, text):
        with self.report.open('a') as output:
            output.write(text)

    def setup(self):
        self.pins['Commit'] = self.output(['git', '-C', self.root, 'rev-parse', 'HEAD'])
        # The run's own report is not a change to what it runs.
        self.pins['Dirty'] = str(bool(self.output(['git', '-C', self.root, 'status', '--porcelain', '--', ':(top)', ':(exclude)runs'])))
        self.pins['Xcode'] = self.output(['xcodebuild', '-version']).replace('\n', ' ')
        self.pins['Maestro'] = self.output(['maestro', '--version']).replace('\n', ' ')
        env = dict(os.environ, CLANG_MODULE_CACHE_PATH=str(self.build / 'module-cache'),
                   SWIFTPM_MODULECACHE_OVERRIDE=str(self.build / 'module-cache'))
        self.build.mkdir(parents=True, exist_ok=True)
        self.call(['xcodebuild', '-project', self.ios / 'App/MizanBLE.xcodeproj',
                   '-scheme', 'MizanBLE Rehearsal', '-destination', 'generic/platform=iOS Simulator',
                   '-derivedDataPath', self.build, '-packageCachePath', self.ios / '.build/cache',
                   '-clonedSourcePackagesDirPath', self.build / 'SourcePackages', '-skipPackageUpdates',
                   'CODE_SIGNING_ALLOWED=NO', 'build'],
                  artifact=self.artifacts / 'build.log', env=env)
        self.app = self.build / 'Build/Products/Debug-iphonesimulator/MizanBLE Rehearsal.app'
        self.pins['App build'] = self.output(['/usr/libexec/PlistBuddy', '-c', 'Print CFBundleVersion', self.app / 'Info.plist'])
        runtime = select_runtime(json.loads(self.output(['xcrun', 'simctl', 'list', 'runtimes', '-j']))['runtimes'])
        self.pins['Runtime'] = runtime['name'] + ' ' + runtime['identifier']
        types = json.loads(self.output(['xcrun', 'simctl', 'list', 'devicetypes', '-j']))['devicetypes']
        devices = json.loads(self.output(['xcrun', 'simctl', 'list', 'devices', '-j']))['devices'].get(runtime['identifier'], [])
        self.bases = {}
        for kind in ('iPhone', 'iPad'):
            name = 'Mizan Lanes ' + kind
            base = next((d for d in devices if d['name'] == name and d.get('isAvailable')), None)
            if base:
                self.bases[kind] = base['udid']
            else:
                kind_type = select_device_type(types, runtime, kind)
                self.bases[kind] = self.output(['xcrun', 'simctl', 'create', name, kind_type['identifier'], runtime['identifier']])

    def run(self, lanes):
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.report.write_text('# Mizan Maestro lanes — ' + self.stamp + '\n\n')
        failed = False
        try:
            try:
                self.setup()
            finally:
                self.append('| Pin | Value |\n|---|---|\n' + ''.join(
                    f'| {name} | {self.pins.get(name, "unavailable")} |\n'
                    for name in ('Commit', 'Dirty', 'Xcode', 'Runtime', 'Maestro', 'App build')) + '\n')
            for lane in lanes:
                self.append('## ' + lane['id'] + '\n\n| Part | Result | Flow | Log check | Duration | Screenshot |\n|---|---|---|---|---|---|\n')
                for part in lane['parts']:
                    if not self.part(lane, part):
                        failed = True
                        # A lane's later parts build on its earlier ones; other lanes do not.
                        break
        except (OSError, ValueError, RuntimeError, KeyError) as error:
            self.append('\nBLOCKED: ' + str(error).replace('\n', ' ') + '\n')
            failed = True
        except KeyboardInterrupt:
            self.append('\nBLOCKED: run interrupted\n')
            failed = True
        finally:
            for clone in tuple(self.clones - self.retained):
                if not self.cleanup(clone):
                    failed = True
        return int(failed)

    def cleanup(self, clone):
        try:
            self.call(['xcrun', 'simctl', 'shutdown', clone], required=False)
            result = self.call(['xcrun', 'simctl', 'delete', clone], required=False)
            if result.returncode:
                raise RuntimeError('delete failed')
            self.clones.remove(clone)
            return True
        except (OSError, RuntimeError):
            self.append('\nFAIL cleanup: could not delete ' + clone + '\n')
            return False

    def part(self, lane, part):
        prefix = lane['id'] + '-' + part['name']
        started = self.now()
        flow_result, log_result, clone = 'NOT RUN', 'NOT RUN', None
        screenshot = self.artifacts / (prefix + '.png')
        error = None
        try:
            clone = self.output(['xcrun', 'simctl', 'clone', self.bases[part['device']], 'Mizan Lane ' + self.stamp + ' ' + prefix])
            if not clone:
                raise RuntimeError('clone returned no identity')
            self.clones.add(clone)
            self.call(['xcrun', 'simctl', 'boot', clone])
            self.call(['xcrun', 'simctl', 'bootstatus', clone, '-b'])
            self.call(['xcrun', 'simctl', 'install', clone, self.app])
            container = Path(self.output(['xcrun', 'simctl', 'get_app_container', clone, BUNDLE, 'data']))
            documents = container / 'Documents'
            documents.mkdir(parents=True, exist_ok=True)
            settings_file = lane['path'] / part['settings']
            settings = json.loads(settings_file.read_text())
            shutil.copyfile(settings_file, documents / 'scripted-radio.json')
            since = datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S%z')
            flow = self.call(['maestro', '--device', clone, 'test', lane['path'] / part['flow']],
                             artifact=self.artifacts / (prefix + '.maestro.log'), required=False)
            flow_result = 'PASS' if flow.returncode == 0 else 'FAIL'
            log = self.output(['xcrun', 'simctl', 'spawn', clone, 'log', 'show', '--style', 'compact', '--info', '--debug',
                               '--predicate', 'subsystem == "mizan-ble"', '--start', since])
            (self.artifacts / (prefix + '.log')).write_text(log)
            failures = check_log(settings, part['expected'], log)
            if settings.get('recordAir'):
                air = self.artifacts / (prefix + '.air.jsonl')
                shutil.copyfile(documents / 'air-recording.jsonl', air)
                failures.extend(check_air(settings, air.read_text()))
            log_result = 'FAIL' if failures else 'PASS'
            (self.artifacts / (prefix + '.check.txt')).write_text('\n'.join(failures) if failures else 'PASS log and air checks\n')
        except (OSError, ValueError, RuntimeError, KeyError) as caught:
            error = str(caught)
        finally:
            if clone:
                shot = self.call(['xcrun', 'simctl', 'io', clone, 'screenshot', screenshot], required=False)
                if shot.returncode:
                    error = '; '.join(e for e in (error, 'screenshot failed') if e)
            passed = error is None and flow_result == log_result == 'PASS'
            if clone and (passed or not self.keep):
                passed = self.cleanup(clone) and passed
            self.append(f'| {part["name"]} | {"PASS" if passed else "FAIL"} | {flow_result} | {log_result} | {self.now() - started:.1f} s | [{screenshot.name}]({self.stamp}/{screenshot.name}) |\n')
            if error:
                self.append('\n' + error.replace('\n', ' ') + '\n')
            if not passed and self.keep and clone:
                self.retained.add(clone)
                self.append('\nKept failed clone: `' + clone + '`\n')
        return passed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keep', action='store_true')
    parser.add_argument('lanes', nargs='*')
    try:
        args = parser.parse_args()
        root = Path(__file__).resolve().parents[2] / 'maestro'
        lanes = load_lanes(root, args.lanes)
    except SystemExit as error:
        return 0 if error.code == 0 else 64
    except (OSError, ValueError, KeyError) as error:
        print(error, file=sys.stderr)
        return 64
    stamp = datetime.now().strftime('%Y-%m-%d-%H%M')
    if (root / 'runs' / (stamp + '.md')).exists():
        print('a report already exists for this minute', file=sys.stderr)
        return 1
    def command(args, **kwargs):
        return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    run = Runner(root, command, stamp, time.monotonic, keep=args.keep)
    try:
        result = run.run(lanes)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        result = 1
    print(run.report)
    return result


if __name__ == '__main__':
    raise SystemExit(main())
