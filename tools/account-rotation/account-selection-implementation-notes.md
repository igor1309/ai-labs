# Quota-Aware Account Selection: Implementation Notes

These notes operationalize the policy in [account-selection-adr.md](./account-selection-adr.md). They do not change the decision recorded in the ADR.

1. Query every account. A query returns usage and reset time for both horizons, or an error.
2. Skip accounts whose query failed or that lack sufficient quota on either horizon.
3. For each remaining account, compute `short_ratio` and `weekly_ratio` as defined in the ADR.
4. Select the account with the lexicographically greatest `(min(short_ratio, weekly_ratio), max(short_ratio, weekly_ratio))`. Break exact ties by lowest account ID.
