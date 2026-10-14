# Absence is inferred from listing membership and a name-keyed map, and each edge leaks

Asked by: review run 20261003T130421Z-aa12ef (code_review of 0f3be3cd, LAB-64), item "Absence is inferred from listing membership and a name-keyed map, and each edge leaks".

Question for the owner: should absence stay "not in the listing" plus a name-keyed map, with each edge patched (list matching directories, unique input names, a listing-error test)? Or should resolution carry, per input, a distinguishable not-found result from the read path, so that only a genuine not-found in both layers omits the input and no name collision can suppress a different input? Option A is smaller and fits the current diff. Option B removes the class of defect.

Answer with one of the options and why, or "owner" if this needs the
owner's decision.
