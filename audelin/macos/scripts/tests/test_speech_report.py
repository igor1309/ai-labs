import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).parents[2] / "Benchmarks" / "speech-report.py"
spec = importlib.util.spec_from_file_location("speech_report", path)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class SpeechMetricsTests(unittest.TestCase):

    def test_decoding_counts_each_chunk_of_audio_once(self):
        hears = [(100.1, 100.2, 0.1, -1, -1), (100.2, 100.3, 0.2, -1, -1)]
        self.assertAlmostEqual(report.metrics(100, hears, [])["decoding"], 1.0)

    def test_queue_delay_is_apart_from_the_window_delay(self):
        # The word ended at 1 s. Its chunk (audio to 5 s) began 2 s late, and read for 1 s.
        hears = [(107.0, 108.0, 5.0, -1, 1.0)]
        m = report.metrics(100, hears, [])
        self.assertAlmostEqual(m["backlog_late"], 2.0)
        self.assertAlmostEqual(m["window"], 5.0)

    def test_no_queue_leaves_the_window_delay_whole(self):
        m = report.metrics(100, [(105.0, 106.0, 5.0, -1, 1.0)], [])
        self.assertAlmostEqual(m["backlog_late"], 0.0)
        self.assertAlmostEqual(m["window"], 5.0)

    def test_capture_to_panel_and_final_start_at_the_word_end(self):
        hears = [(105.0, 106.0, 5.0, -1, 1.0), (110.0, 112.0, 10.0, 1.0, 2.0)]
        m = report.metrics(100, hears, [(107.0, 1.0)])
        self.assertAlmostEqual(m["to_panel"], 6.0)
        self.assertAlmostEqual(m["to_final"], 11.0)


if __name__ == "__main__":
    unittest.main()
