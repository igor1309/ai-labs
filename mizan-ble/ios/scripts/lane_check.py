"""Check rehearsal logs and captured wire frames using only the standard library."""
import argparse
import json
from pathlib import Path
import re


def amounts(settings):
    # The host UI's entry is lane metadata; omitted scripted host amounts default to 12345.
    values = {host.get('amount', 12345) for host in settings.get('hosts', [{}])}
    if 'enteredAmount' in settings:
        values.add(settings['enteredAmount'])
    if any(type(value) is not int or not 0 <= value < 2**64 for value in values):
        raise ValueError('invalid lane amount')
    return values


def amount_forms(amount):
    return {str(amount), f'{amount // 100}.{amount % 100:02}',
            f'{amount // 100},{amount % 100:02}', format(amount, 'x'),
            amount.to_bytes(8, 'big').hex(), amount.to_bytes(8, 'little').hex()}


def amount_leaks(settings, text):
    failures = []
    for amount in amounts(settings):
        for form in amount_forms(amount):
            if re.search(r'(?<![\w.,])(?:0x)?' + re.escape(form) + r'(?![\w.,])', text, re.I):
                failures.append('amount exposed')
                break
    return failures


def check_log(settings, expected, text):
    failures = []
    lines = text.splitlines()
    for item in expected:
        category = re.compile(r'\[mizan-ble:' + re.escape(item['category']) + r'\]')
        phase = re.compile(r'\bphase=' + re.escape(item['phase']) + r'(?![\w])')
        if not any(category.search(line) and phase.search(line) for line in lines):
            failures.append('missing ' + item['category'] + ' phase=' + item['phase'])
    # Counts are public metadata, even when a counter happens to equal a small amount.
    public = re.sub(r'\b(?:bytes|counter|length|digits|seconds)=\d+\b', '', text)
    failures.extend(amount_leaks(settings, public))
    if re.search(r'(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{32,}={0,2}(?![A-Za-z0-9+/])', public):
        failures.append('secret-shaped run exposed')
    return failures


def check_air(settings, text):
    failures = []
    seen = set()
    count = 0
    for line in text.splitlines():
        try:
            record = json.loads(line)
            direction = record['direction']
            if direction not in ('hostToClient', 'clientToHost'):
                raise ValueError('direction')
            encoded = record['hex']
            if not isinstance(encoded, str) or not re.fullmatch(r'(?:[0-9a-fA-F]{2})+', encoded):
                raise ValueError('hex')
            frame = bytes.fromhex(encoded)
        except (ValueError, KeyError, TypeError):
            failures.append('invalid air record')
            continue
        count += 1
        failures.extend(amount_leaks(settings, frame.decode('ascii', errors='replace')))
        if any(value.to_bytes(8, order) in frame for value in amounts(settings) for order in ('big', 'little')):
            failures.append('binary amount exposed')
        # Decision/result bodies are one byte. Searching inside a nonce or key would
        # reject encrypted traffic by chance; inspect a whole plaintext frame/body.
        if frame in (b'\x01', b'\x02') or (len(frame) == 6 and frame[0] in (2, 4) and frame[5] in (1, 2)):
            failures.append('plaintext decision or outcome exposed')
        sizes = {1: 41, 2: 34, 3: 34, 4: 34, 5: 33}
        if frame and len(frame) == sizes.get(frame[0]):
            seen.add((direction, frame[0]))
    required = {('hostToClient', 1), ('clientToHost', 2), ('hostToClient', 3), ('hostToClient', 4)}
    if not count or not required <= seen:
        failures.append('incomplete payment recording')
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('--part', type=Path, required=True, help='lane.json')
    parser.add_argument('--name', required=True, help='part name')
    parser.add_argument('--log', type=Path, required=True)
    parser.add_argument('--air', type=Path)
    args = parser.parse_args()
    try:
        settings = json.loads(args.settings.read_text())
        part = next(p for p in json.loads(args.part.read_text())['parts'] if p['name'] == args.name)
        failures = check_log(settings, part['expected'], args.log.read_text())
        if settings.get('recordAir'):
            if args.air is None:
                failures.append('missing air recording')
            else:
                failures.extend(check_air(settings, args.air.read_text()))
    except (OSError, ValueError, KeyError, StopIteration) as error:
        failures = ['invalid checker input: ' + str(error)]
    print('; '.join(failures) if failures else 'PASS log and air checks')
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
