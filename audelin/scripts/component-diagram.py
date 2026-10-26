#!/usr/bin/env python3
"""Writes docs/live-text.drawio from the package's targets and their dependencies.

Run from audelin/: python3 scripts/component-diagram.py
Arrows come from `swift package dump-package`; each target's lane and line come
from TARGETS below. A target missing there, or listed there but gone from the
package, stops the script, so a new target cannot slip past the diagram.
"""

import json
import subprocess
import sys
from html import escape
from pathlib import Path

# Lane: (title, colour, x, y, width, height, columns)
LANES = {
    "compose": ("Composition", "#60a5fa", 560, 110, 1240, 130, 5),
    "ui": ("UI", "#7dd3fc", 40, 280, 460, 210, 2),
    "machines": ("State machines", "#fbbf24", 560, 280, 760, 130, 3),
    "text": ("Live text", "#bef264", 40, 530, 820, 300, 3),
    "capture": ("Capture and processes", "#fb923c", 900, 530, 440, 210, 2),
    "storage": ("Storage", "#a78bfa", 1380, 530, 460, 300, 2),
    "external": ("Platform and packages", "#94a3b8", 40, 870, 1800, 120, 4),
}

# Target: (lane, line under its name, slot in the lane). Planned boxes have no target yet.
TARGETS = {
    "RecordedCapture": ("compose", "records one capture to its track", 3),
    "LiveAudio": ("compose", "hears and reads one capture,\nkeeps its time", 4),
    "Compose": ("compose", "wires one recording's pieces\nbehind Session's ports", 1),
    "PanelUI": ("ui", "the live panel and its transcript", 0),
    "SettingsUI": ("ui", "the Settings window", 1),
    "GlassLedger": ("ui", "design tokens for both views", 2),
    "Machine": ("machines", "reducer + effect handler loop", 1),
    "Recording": ("machines", "decides whether a recording runs", 2),
    "Session": ("machines", "brings one recording's\npieces up and down", 0),
    "CallFolder": ("storage", "one folder per call", 0),
    "TrackFile": ("storage", "one track's audio, readable live", 1),
    "TranscriptFile": ("storage", "the call's transcript", 2),
    "TrackFileCrashWriter": ("storage", "test helper: killed mid-write", 3),
    "TranscriptFileCrashWriter": ("storage", "test helper: killed mid-write", 4),
    "TranscriptWriting": ("storage", "keeps call text's latest text\nin the transcript", 5),
    "CallText": ("text", "both sides' text;\nswitches live text", 0),
    "LiveText": ("text", "cuts recognised text into\nsegments, partial or settled", 1),
    "TwoPassRecognizer": ("text", "draft + final,\nany two recognisers", 2),
    "NemotronRecognizer": ("text", "Nemotron 3.5, streaming", 3),
    "ParakeetRecognizer": ("text", "Parakeet v3 in its own windows", 4),
    "SideText": ("text", "one side's text,\nswitches and fills in", 8),
    "FillIn": ("text", "readies one side's live text,\nfills in its missed audio", 5),
    "ModelLoading": ("text", "shares one model load", 7),
    "AudioConversion": ("text", "sample-rate conversion\nkeeping filter state", 6),
    "MicrophoneCapture": ("capture", "AVAudioEngine input", 0),
    "SystemAudioCapture": ("capture", "Core Audio process tap", 1),
    "CoreAudioProcesses": ("capture", "processes with audio open,\ncall events", 3),
    "CallAppProcesses": ("capture", "which processes to hear\nfor the call app", 2),
}

PLANNED = [
    ("compose", "App and menu bar", "planned: LAB-401, LAB-509", 0),
    ("compose", "Reading", "planned: LAB-507", 2),
]

STANDING = [("external", "Apple frameworks", "AVFoundation, Core Audio,\nAppKit, SwiftUI", 1)]

BOX_W, BOX_H = 200, 64


def package(macos):
    out = subprocess.run(
        ["swift", "package", "dump-package"], cwd=macos, check=True, capture_output=True, text=True
    ).stdout
    targets, externals = {}, set()
    for t in json.loads(out)["targets"]:
        if t["type"] == "test":
            continue
        deps = []
        for d in t["dependencies"]:
            kind, value = next(iter(d.items()))
            name = value[0]
            deps.append(name)
            if kind == "product":
                externals.add(name)
        targets[t["name"]] = deps
    return targets, externals


def cell(id, value, style, parent, x, y, w, h):
    return (
        f'<mxCell id="{id}" value="{escape(value).replace(chr(10), "&#xa;")}" style="{style}" '
        f'vertex="1" parent="{parent}"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
    )


def box_style(colour, dashed=False, bold=False):
    return (
        f"rounded=0;whiteSpace=wrap;html=1;fillColor=#252525;strokeColor={colour};fontColor={colour};"
        f"fontSize=13;{'dashed=1;' if dashed else ''}{'fontStyle=1;' if bold else ''}"
    )


def main():
    root = Path(__file__).resolve().parent.parent
    targets, externals = package(root / "macos")
    unknown = sorted(set(targets) - set(TARGETS))
    gone = sorted(set(TARGETS) - set(targets))
    if unknown or gone:
        sys.exit(f"update TARGETS: not drawn {unknown}, no longer in the package {gone}")

    cells = [
        cell("canvas", "", "rounded=0;whiteSpace=wrap;html=1;fillColor=#252525;strokeColor=none;container=1;pointerEvents=0;", "1", 0, 0, 1880, 1060),
        cell("title", "Audelin", "text;html=1;align=left;verticalAlign=middle;fontSize=28;fontColor=#f8fafc;fontStyle=1;", "canvas", 40, 24, 400, 40),
        cell("subtitle", "components as built — generated from Package.swift by scripts/component-diagram.py",
             "text;html=1;align=left;verticalAlign=middle;fontSize=15;fontColor=#94a3b8;", "canvas", 42, 66, 900, 26),
        cell("legend", "solid box: a target · dashed box: planned · arrow: depends on",
             "text;html=1;align=left;verticalAlign=middle;fontSize=13;fontColor=#94a3b8;", "canvas", 40, 1010, 900, 26),
    ]
    for lane, (title, colour, x, y, w, h, _) in LANES.items():
        cells.append(cell(f"lane-{lane}", title,
                          f"swimlane;startSize=28;rounded=0;html=1;container=1;pointerEvents=0;fillColor=none;"
                          f"strokeColor=#4b5563;dashed=1;fontSize=13;fontColor={colour};", "canvas", x, y, w, h))

    def place(lane, n, id, label, line, dashed=False, bold=False):
        _, colour, _, _, w, _, columns = LANES[lane]
        gap = (w - columns * BOX_W) // (columns + 1)
        bx = gap + (n % columns) * (BOX_W + gap)
        by = 44 + (n // columns) * (BOX_H + 22)
        cells.append(cell(id, f"{label}\n{line}", box_style(colour, dashed, bold), f"lane-{lane}", bx, by, BOX_W, BOX_H))

    for name, (lane, line, n) in TARGETS.items():
        place(lane, n, name, name, line, bold=name == "Compose")
    for lane, label, line, n in PLANNED:
        place(lane, n, "planned-" + label, label, line, dashed=True)
    for lane, label, line, n in STANDING:
        place(lane, n, "standing-" + label, label, line)
    for n, name in enumerate(sorted(externals)):
        place("external", n * 2, name, name, "Swift package")

    edge = 0
    for name, deps in targets.items():
        for dep in deps:
            edge += 1
            colour = LANES[TARGETS[name][0]][1]
            lane = TARGETS.get(dep, ("external",))[0]
            below = LANES[lane][3] > LANES[TARGETS[name][0]][3]
            ends = "exitX=0.5;exitY=1;entryX=0.5;entryY=0;" if below else ""
            cells.append(
                f'<mxCell id="e{edge}" value="" style="{ends}edgeStyle=none;rounded=0;'
                f'html=1;strokeColor={colour};opacity=70;endArrow=classic;endFill=1;" edge="1" '
                f'parent="canvas" source="{name}" target="{dep}"><mxGeometry relative="1" as="geometry"/></mxCell>'
            )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<mxfile host="drawio"><diagram id="audelin-live" name="Components"><mxGraphModel dx="1880" dy="1060" '
        'grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" '
        'pageWidth="1880" pageHeight="1060" background="#252525" math="0" shadow="0"><root>\n'
        '<mxCell id="0"/>\n<mxCell id="1" parent="0"/>\n' + "\n".join(cells) + "\n</root></mxGraphModel></diagram></mxfile>\n"
    )
    (root / "docs" / "live-text.drawio").write_text(xml)
    print(f"{len(targets)} targets, {edge} arrows")


if __name__ == "__main__":
    main()
