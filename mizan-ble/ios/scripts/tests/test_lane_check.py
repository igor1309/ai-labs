import importlib.util
import json
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('lane_check', Path(__file__).parents[1] / 'lane_check.py')
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


def encrypted_air():
    records = [('hostToClient', b'\x01\x02' + b'K' * 48), ('clientToHost', b'\x03' + b'K' * 32)]
    for direction, kind in [('hostToClient', 1), ('clientToHost', 2), ('hostToClient', 3), ('hostToClient', 4)]:
        records.append((direction, bytes([kind]) + bytes(4) + b'\x01\x02' + b'Z' * (34 if kind == 1 else 27)))
    return '\n'.join(json.dumps({'direction': direction, 'hex': payload.hex()}) for direction, payload in records)


class LaneCheckTests(unittest.TestCase):
    def test_expected_category_and_phase_must_share_a_line(self):
        expected = [{'category': 'clientPayment', 'phase': 'paid'}]
        for text in ('', '[mizan-ble:clientPayment] phase=waiting\n[mizan-ble:hostPayment] phase=paid',
                     '[mizan-ble:clientPayment] phase=paidLater'):
            with self.subTest(text=text):
                self.assertTrue(checker.check_log({}, expected, text))
        self.assertEqual(checker.check_log({}, expected, '[mizan-ble:clientPayment] phase=paid'), [])

    def test_every_amount_form_is_rejected(self):
        settings = {'hosts': [{'amount': 12345}, {'amount': 67890}], 'enteredAmount': 54321}
        for amount in (12345, 67890, 54321):
            for form in (str(amount), f'{amount // 100}.{amount % 100:02}',
                         f'{amount // 100},{amount % 100:02}', f'{amount:x}', f'{amount:X}',
                         amount.to_bytes(8, 'big').hex(), amount.to_bytes(8, 'little').hex().upper()):
                with self.subTest(form=form):
                    self.assertTrue(checker.check_log(settings, [], 'phase=leak value=' + form))

    def test_an_amount_next_to_punctuation_is_rejected(self):
        settings = {'hosts': [{'amount': 12345}]}
        for text in ('amount 12345.', 'amount 123.45.', '(123,45)', 'amount=12345,', '"3039";', '[0x3039]'):
            with self.subTest(text=text):
                self.assertTrue(checker.check_log(settings, [], 'phase=leak ' + text))
                self.assertTrue(checker.check_air(settings, encrypted_air() + '\n' + json.dumps(
                    {'direction': 'hostToClient', 'hex': text.encode().hex()})))

    def test_a_different_number_holding_the_amount_is_not_a_leak(self):
        settings = {'hosts': [{'amount': 12345}]}
        for text in ('value=1.12345', 'value=12345.6', 'value=9,12345', 'value=123.456', 'value=0.123.45'):
            with self.subTest(text=text):
                self.assertEqual(checker.check_log(settings, [], text), [])

    def test_secret_shapes_are_rejected(self):
        for secret in ('ab' * 16, 'AB' * 20, 'qwerty/+QWERTY123' * 3 + '='):
            with self.subTest(secret=secret):
                self.assertTrue(checker.check_log({}, [], 'phase=leak value=' + secret))

    def test_clean_logs_and_metadata_do_not_leak(self):
        for settings in ({}, {'hosts': [{'amount': 34}]}):
            self.assertEqual(checker.check_log(settings, [],
                '[mizan-ble:clientRadio] phase=message bytes=34 counter=34 length=34\n'
                '[mizan-ble:clientPayment] phase=paid'), [])
        self.assertEqual(checker.check_log({}, [], 'value=9123456'), [])

    def test_air_rejects_amounts_in_text_and_binary(self):
        for payload in (b'12345', b'123.45', b'123,45', b'3039', b'0000000000003039',
                        (12345).to_bytes(8, 'big'), (12345).to_bytes(8, 'little')):
            with self.subTest(payload=payload):
                self.assertTrue(checker.check_air({}, encrypted_air() + '\n' + json.dumps({'direction': 'hostToClient', 'hex': payload.hex()})))

    def test_air_rejects_plaintext_codec_messages(self):
        for kind, bodies in ((1, [(12345).to_bytes(8, 'big')]), (2, [b'\x01', b'\x02']),
                             (4, [b'\x01', b'\x02'])):
            for body in bodies:
                with self.subTest(kind=kind, body=body):
                    frame = bytes([kind]) + bytes(4) + body
                    self.assertTrue(checker.check_air({}, encrypted_air() + '\n' + json.dumps({'direction': 'clientToHost', 'hex': frame.hex()})))

    def test_air_requires_a_complete_successful_exchange(self):
        for text in ('', '{}', 'not json', '{"direction":"other","hex":"aa"}',
                     '{"direction":"hostToClient","hex":"zz"}'):
            with self.subTest(text=text):
                self.assertTrue(checker.check_air({}, text))

    def test_session_characteristic_does_not_count_as_amount_message(self):
        records = [('hostToClient', b'\x01' + b'K' * 49)]
        for direction, kind in [('clientToHost', 2), ('hostToClient', 3), ('hostToClient', 4)]:
            records.append((direction, bytes([kind]) + bytes(4) + b'Z' * 29))
        text = '\n'.join(json.dumps({'direction': direction, 'hex': payload.hex()}) for direction, payload in records)
        self.assertTrue(checker.check_air({}, text))

    def test_air_rejects_missing_handshake_records(self):
        lines = encrypted_air().splitlines()
        for index, name in ((0, 'session read'), (1, 'key write')):
            with self.subTest(missing=name):
                self.assertTrue(checker.check_air({}, '\n'.join(lines[:index] + lines[index + 1:])))

    def test_encrypted_air_and_keys_are_allowed(self):
        self.assertEqual(checker.check_air({}, encrypted_air()), [])
