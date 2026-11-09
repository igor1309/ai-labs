"""Fixture-based recommendation contracts, including opt-in compatibility."""

import io
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import claude_parser
import codex_parser
import sessions_audit_core as core
from test_sessions_audit import (
    NOW, HERE, c_tool, c_result, x_call, x_exec, x_output, js_cmd,
    write_jsonl, run_cli, run_json, run_script,
)


class RecommendationTests(unittest.TestCase):
    def setUp(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name).resolve()

    def test_claude_details_merge_without_cross_context_duplicates(self):
        parent = write_jsonl(self.root / 's.jsonl', [
            c_tool('Skill', {'skill': 'review'}, 's1'),
            c_tool('Skill', {'skill': 'review'}, 's2'),
            c_tool('Bash', {'command': 'ls'}, 'b'),
            c_result('b', 'x' * 100),
            c_result('missing', 'private raw result' * 10),
            c_result(None, 'y' * 100),
        ])
        write_jsonl(self.root / 's/subagents/agent-1.jsonl', [
            c_tool('Skill', {'skill': 'review'}, 's1'),
            c_tool('Skill', {'skill': 'review'}, 's2'),
            c_tool('Skill', {'skill': 'review'}, 's3'),
            c_tool('Read', {'file_path': '/a'}, 'b'),
            c_result('b', 'z' * 100),
            c_result('missing', 'w' * 100),
        ])
        s = claude_parser.analyze(parent, 100)
        self.assertEqual(s.duplicate_skills, {'review': 3})
        self.assertEqual(s.duplicate_skill_loads, 3)
        self.assertEqual(s.large_result_tools, {'Bash': 1, 'Read': 1, '(unknown)': 3})
        self.assertEqual(s.large_results, 3)
        self.assertEqual(s.unmatched_large_results, 2)
        self.assertEqual(s.result_chars, 300)
        row = next(r for r in core.recommendations([s]) if r['id'] == 'results')
        self.assertEqual(row['metrics'], {'large_results': 3, 'unmatched_large_results': 2})
        self.assertEqual(row['score'], 10)
        self.assertEqual(row['affected_sessions'], 1)
        self.assertNotIn('private raw result', json.dumps(row))
        s.project = 'repo'
        result = core.AgentResult('claude', 'Claude', {}, [s], {}, [])
        payload = json.loads(json.dumps(core.build_json(
            [result], core.Window(), 100, 15, False, NOW, recommend=True)))
        self.assertEqual(payload['agents']['claude']['sessions'][0]['recommendation_details'], {
            'duplicate_skills': {'review': 3},
            'large_result_tools': {'Bash': 1, 'Read': 1, '(unknown)': 3},
            'unmatched_large_results': 2,
        })
        evidence = {r['id']: r['evidence'] for r in payload['recommendations']}
        self.assertEqual(evidence, {
            'skills': [{
                'agent': 'claude', 'project': 'repo', 'path': str(parent),
                'metrics': {'duplicate_skill_loads': 3}, 'score': 9,
                'duplicate_skills': {'review': 3},
            }],
            'results': [{
                'agent': 'claude', 'project': 'repo', 'path': str(parent),
                'metrics': {'large_results': 3, 'unmatched_large_results': 2},
                'score': 10,
                'large_result_tools': {'Bash': 1, 'Read': 1, '(unknown)': 3},
            }],
        })

    def test_both_parsers_track_skill_identities_and_only_extra_loads(self):
        cases = [
            (claude_parser, [
                c_tool('Skill', {'skill': 'review'}, '1'),
                c_tool('Skill', {'skill': 'review'}, '2'),
                c_tool('Read', {'file_path': '/skills/dev/SKILL.md'}, '3'),
                c_tool('Read', {'file_path': '/skills/dev/SKILL.md'}, '4'),
                c_tool('Skill', {'skill': 'other'}, '5'),
                c_tool('Skill', {'skill': 'review'}, '6'),
            ]),
            (codex_parser, [
                x_call('load_skill', {'name': 'review'}, '1'),
                x_call('load_skill', {'skill': 'review'}, '2'),
                x_exec(js_cmd('cat /skills/dev/SKILL.md'), '3'),
                x_exec(js_cmd('cat /skills/dev/SKILL.md'), '4'),
                x_call('load_skill', {'name': 'other'}, '5'),
                x_call('load_skill', {'name': 'review'}, '6'),
            ]),
        ]
        for parser, records in cases:
            with self.subTest(agent=parser.NAME):
                s = parser.analyze(write_jsonl(self.root / (parser.NAME + '.jsonl'), records), 100)
                self.assertEqual(s.duplicate_skills, {'review': 2, '/skills/dev/SKILL.md': 1})
                self.assertEqual(s.skill_loads, 6)
                self.assertEqual(s.duplicate_skill_loads, 3)

    def test_codex_attributes_actual_calls_and_keeps_exec_wrapper(self):
        records = [
            x_exec(js_cmd('ls') + ';' + js_cmd('pwd'), 'wrapper'),
            {'type': 'response_item', 'payload': {
                'type': 'custom_tool_call_output', 'call_id': 'wrapper', 'output': 'x' * 100}},
            x_call('exec_command', {'cmd': 'ls'}, 'direct'),
            x_output('direct', 'y' * 100),
            x_output('unmatched', 'z' * 100),
            x_output(None, 'w' * 100),
            {'type': 'function_call', 'name': 'read_file', 'arguments': '{"path":"/a"}', 'id': 'legacy'},
            {'type': 'function_call_output', 'call_id': 'legacy', 'output': 'a' * 100},
            {'type': 'event_msg', 'payload': {'type': 'exec_command_end', 'output': 'b' * 100}},
            x_output('direct', 'c' * 99),
        ]
        s = codex_parser.analyze(write_jsonl(self.root / 'rollout.jsonl', records), 100)
        self.assertEqual(s.large_result_tools, {'exec': 1, 'exec_command': 1, '(unknown)': 2, 'read_file': 1})
        self.assertEqual(s.large_results, 5)
        self.assertEqual(s.result_chars, 599)
        self.assertEqual(s.unmatched_large_results, 0)
        s.project = 'repo'
        result = core.AgentResult('codex', 'Codex', {}, [s], {}, [])
        payload = json.loads(json.dumps(core.build_json(
            [result], core.Window(), 100, 15, False, NOW, recommend=True)))
        tools = {'exec': 1, 'exec_command': 1, '(unknown)': 2, 'read_file': 1}
        self.assertEqual(payload['agents']['codex']['sessions'][0]['recommendation_details'], {
            'duplicate_skills': {}, 'large_result_tools': tools, 'unmatched_large_results': 0,
        })
        self.assertEqual(payload['recommendations'][0]['evidence'], [{
            'agent': 'codex', 'project': 'repo', 'path': s.path,
            'metrics': {'large_results': 5, 'unmatched_large_results': 0},
            'score': 10, 'large_result_tools': tools,
        }])

    def fixture(self):
        croot, xhome = self.root / 'claude', self.root / 'codex'
        for n in range(8):
            repo = self.root / f'repo{n}'
            (repo / '.git').mkdir(parents=True)
            records = [
                c_tool('Bash', {'command': 'swift test'}, 'b', cwd=str(repo)),
                c_result('b', 'a' * 100),
                c_tool('Read', {'file_path': '/a'}, 'r1'),
                c_tool('Read', {'file_path': '/a', 'offset': 1, 'limit': 2}, 'r2'),
                c_tool('Skill', {'skill': f'skill{n}'}, 's1'),
                c_tool('Skill', {'skill': f'skill{n}'}, 's2'),
                c_tool('Bash', {'command': 'sleep 2'}, 'p'),
                c_tool('Bash', {'command': 'gh pr checks 1'}, 'c1'),
                c_tool('Bash', {'command': 'gh pr checks 1'}, 'c2'),
            ]
            write_jsonl(croot / f's{n}.jsonl', records)
            write_jsonl(xhome / f'sessions/rollout-{n}.jsonl', [
                {'type': 'session_meta', 'payload': {'cwd': str(repo / 'sub')}},
                x_call('exec_command', {'cmd': 'swift build'}, 'b'),
                x_output('b', 'x' * 100),
            ])
            (repo / 'sub').mkdir()
        return ['all', '--claude-root', str(croot), '--codex-home', str(xhome), '--large-result-chars', '100']

    def test_global_cap_grouping_exact_counts_and_additive_json(self):
        argv = self.fixture()
        plain = run_json(argv)
        opted = run_json(argv + ['--recommend'])
        rows = opted.pop('recommendations')
        self.assertEqual(len(rows), 5)
        self.assertEqual([r['id'] for r in rows], ['builds', 'reads', 'results', 'waiting', 'skills'])
        self.assertEqual([r['score'] for r in rows], [80, 32, 32, 32, 24])
        self.assertEqual([r['rank'] for r in rows], list(range(1, 6)))
        builds = rows[0]
        self.assertEqual(builds['metrics'], {'unfiltered_builds': 16})
        self.assertEqual(builds['affected_sessions'], 16)
        self.assertEqual(len(builds['breakdown']), 16)
        self.assertEqual(len(builds['evidence']), 16)
        self.assertEqual(builds['evidence'][:2], [
            {'agent': 'claude', 'project': str(self.root / 'repo0'),
             'path': str(self.root / 'claude/s0.jsonl'),
             'metrics': {'unfiltered_builds': 1}, 'score': 5},
            {'agent': 'codex', 'project': str(self.root / 'repo0'),
             'path': str(self.root / 'codex/sessions/rollout-0.jsonl'),
             'metrics': {'unfiltered_builds': 1}, 'score': 5},
        ])
        self.assertEqual([(g['project'], g['agent']) for g in builds['breakdown'][:2]],
                         [(str(self.root / 'repo0'), 'claude'), (str(self.root / 'repo0'), 'codex')])
        self.assertTrue(all(g['metrics'] == {'unfiltered_builds': 1} and g['affected_sessions'] == 1
                            for g in builds['breakdown']))
        waiting = next(r for r in rows if r['id'] == 'waiting')
        self.assertEqual(waiting['metrics'], {'polling_candidates': 8, 'repeated_checks': 8})
        self.assertEqual(waiting['affected_sessions'], 8)
        self.assertEqual(len(waiting['evidence']), 8)
        self.assertEqual(opted['schema_version'], 1)
        self.assertEqual(opted['options'].pop('recommendation_weights'), core.RECOMMENDATION_WEIGHTS)
        self.assertEqual(opted['options'].pop('recommendation_limit'), 5)
        for block in opted['agents'].values():
            for s in block['sessions']:
                self.assertIn('large_result_tools', s.pop('recommendation_details'))
        self.assertEqual(opted, plain)
        # No --by-project is needed for recommendation breakdowns.
        self.assertNotIn('by_project', plain['agents']['claude'])

    def test_group_ranking_uses_score_then_sessions_then_labels(self):
        samples = [('a', 2), ('a', 2), ('b', 4), ('c', 1)]
        items = []
        for i, (repo, repeats) in enumerate(samples):
            records = [c_tool('Read', {'file_path': '/a'}, str(n)) for n in range(repeats + 1)]
            s = claude_parser.analyze(write_jsonl(self.root / f'{i}.jsonl', records), 100)
            s.project = repo
            items.append(s)
        row = core.recommendations(items)[0]
        self.assertEqual([(g['project'], g['score'], g['affected_sessions']) for g in row['breakdown']],
                         [('a', 16, 2), ('b', 16, 1), ('c', 4, 1)])
        self.assertEqual(row, core.recommendations(list(reversed(items)))[0])

    def test_all_rule_ties_have_stable_identifier_order(self):
        records = [c_tool('Bash', {'command': 'swift test'}, str(i)) for i in range(12)]
        records += [c_tool('Read', {'file_path': '/a'}, 'r' + str(i)) for i in range(16)]
        records += [c_tool('Skill', {'skill': 's'}, 's' + str(i)) for i in range(21)]
        records += [c_tool('Bash', {'command': 'sleep 1'}, 'p' + str(i)) for i in range(60)]
        records += [c_result(None, 'x' * 100) for _ in range(30)]
        s = claude_parser.analyze(write_jsonl(self.root / 'ties.jsonl', records), 100)
        rows = core.recommendations([s])
        self.assertEqual([r['score'] for r in rows], [60] * 5)
        self.assertEqual([r['id'] for r in rows], ['builds', 'reads', 'results', 'skills', 'waiting'])

    def test_unknown_project_and_tool_remain_explicit_in_both_reports(self):
        root = self.root / 'claude'
        write_jsonl(root / 'unknown.jsonl', [c_result('missing', 'x' * 100)])
        argv = ['claude', '--claude-root', str(root), '--large-result-chars', '100', '--recommend']
        row = run_json(argv)['recommendations'][0]
        self.assertEqual(row['id'], 'results')
        self.assertEqual(row['metrics'], {'large_results': 0, 'unmatched_large_results': 1})
        self.assertEqual(row['large_result_tools'], {'(unknown)': 1})
        self.assertEqual(row['breakdown'], [
            {'rank': 1, 'project': '(unknown)', 'agent': 'claude', 'score': 2,
             'affected_sessions': 1, 'metrics': {'large_results': 0, 'unmatched_large_results': 1}},
        ])
        rc, text, err = run_cli(argv)
        self.assertEqual((rc, err), (0, ''))
        self.assertIn('Producing tools (large results): \\(unknown\\)=1', text)
        self.assertIn('\\(unknown\\) / claude', text)
        self.assertIn('unmatched_large_results=1', text)

    def test_zero_evidence_emits_no_advice_for_both_agents_and_empty_inputs(self):
        croot, xhome = self.root / 'claude', self.root / 'codex'
        write_jsonl(croot / 'empty.jsonl', [
            c_tool('Read', {'file_path': '/a'}, 'r'),
            c_tool('Skill', {'skill': 's'}, 's'),
            c_tool('Bash', {'command': 'swift test | xcsift'}, 'b'),
            c_result('b', 'small'),
        ])
        write_jsonl(xhome / 'sessions/rollout-empty.jsonl', [x_call('exec_command', {'cmd': 'cat /a'}, 'r')])
        for argv in (["claude", '--claude-root', str(croot)],
                     ["codex", '--codex-home', str(xhome)],
                     ["all", '--claude-root', str(croot), '--codex-home', str(xhome)]):
            with self.subTest(agent=argv[0]):
                self.assertEqual(run_json(argv + ['--recommend'])['recommendations'], [])
                rc, text, err = run_cli(argv + ['--recommend'])
                self.assertEqual((rc, err), (0, ''))
                self.assertIn('No recommendation evidence found.', text)
                self.assertNotIn('## 1.', text)
        self.assertEqual(core.recommendations([]), [])

    def test_markdown_bounds_breakdowns_names_and_ignores_top(self):
        argv = self.fixture()
        rc, text, err = run_cli(argv + ['--recommend', '--top', '0', '--by-project'])
        self.assertEqual((rc, err), (0, ''))
        self.assertEqual(text.count('\n## '), 5)
        self.assertEqual(text.count('\n- '), 15)
        for phrase in ('xcsift', '-quiet', 'offset/limit', 'notes', 'trim instructions',
                       'wakeup', 'stop waiting on CI', 'output limits', 'skill0=1', 'Bash=8',
                       'exec\\_command=8', 'affected sessions=16', 'unfiltered_builds=16',
                       'showing 3 of 16', 'showing 3 of 8', 'JSON retains full evidence'):
            self.assertIn(phrase, text)
        self.assertNotIn('Highest-signal sessions', text)
        self.assertNotIn('s0.jsonl', text)
        self.assertLess(len(text), 7000)

    def test_markdown_escapes_and_bounds_transcript_labels(self):
        s = claude_parser.analyze(write_jsonl(self.root / 'unsafe.jsonl', [
            c_tool('Skill', {'skill': 'skill\n# injected ' + 'x' * 500}, '1'),
            c_tool('Skill', {'skill': 'skill\n# injected ' + 'x' * 500}, '2'),
        ]), 100)
        s.project = '[repo](url)\n# injected'
        out = io.StringIO()
        core.print_recommendations(core.recommendations([s]), out)
        text = out.getvalue()
        self.assertNotIn('\n# injected', text)
        self.assertIn('\\[repo\\]\\(url\\)', text)
        self.assertIn('…', text)
        self.assertLess(len(text), 1300)

    def test_executable_and_compatibility_wrappers_support_both_formats(self):
        argv = self.fixture()
        for script, flags, agent in (
            ('sessions-audit', argv, None),
            ('audit_claude_sessions.py', ['--root', str(self.root / 'claude'), '--large-result-chars', '100'], 'claude'),
            ('audit_codex_sessions.py', ['--home', str(self.root / 'codex'), '--large-result-chars', '100'], 'codex'),
        ):
            with self.subTest(script=script):
                p = run_script(HERE / script, *flags, '--recommend', '--json')
                self.assertEqual(p.returncode, 0, p.stderr)
                d = json.loads(p.stdout)
                self.assertLessEqual(len(d['recommendations']), 5)
                self.assertTrue(d['recommendations'])
                if agent:
                    self.assertEqual(list(d['agents']), [agent])
                    self.assertEqual({e['agent'] for r in d['recommendations'] for e in r['evidence']}, {agent})
                p = run_script(HERE / script, *flags, '--recommend')
                self.assertEqual(p.returncode, 0, p.stderr)
                self.assertIn('# Session recommendations', p.stdout)
                self.assertIn('## 1. Filter build output', p.stdout)


if __name__ == '__main__':
    unittest.main()
