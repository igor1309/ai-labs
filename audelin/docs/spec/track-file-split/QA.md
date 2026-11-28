# Track file split QA

## S-1 Cut a saved track

Drive: Cut a CAF fixture at a known frame boundary and compare format, frame counts and decoded samples.

Evidence: Missing.

## S-2 Report failed preparation

Drive: Use an unreadable or malformed track in a temporary directory and check the returned failure.

Evidence: Missing.

## S-3 Keep only available audio

Drive: Use a short track ending before the cut and a long one spanning it. Check each part has only the track data it can play, without padded samples.

Evidence: Missing.
