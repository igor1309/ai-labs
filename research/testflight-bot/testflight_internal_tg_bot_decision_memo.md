# TestFlight Internal Telegram Bot — Decision Memo

## 1. Decision

Build **MVP 1 as team access automation for internal TestFlight**, using Telegram only as the intake channel.

The bot should not be framed as a public beta-registration bot. It should be framed as:

```text
Telegram intake
→ Apple ID email collection
→ App Store Connect user invitation
→ minimum-role/app access assignment
→ internal TestFlight access
```

## 2. Why internal TestFlight

Apple supports internal TestFlight groups with **up to 100 internal testers**. Apple defines those testers as **App Store Connect users with access to your content**.

Source: Apple, “Add internal testers”  
https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/

This fits the product intent:

- small controlled group;
- prototypes, not public marketing;
- Telegram as delivery/onboarding channel;
- lowest App Review friction.

## 3. Main tradeoff

| Option | App Review friction | User/access friction | Decision |
|---|---:|---:|---|
| External closed TestFlight group | Requires Beta App Review | Low for tester | Reject for MVP |
| Public TestFlight link | Requires Beta App Review | Lowest for tester | Reject for MVP |
| Internal TestFlight | Avoids external Beta App Review path | Requires App Store Connect user/team access | Use for MVP |

## 4. Correct abstraction

The core system is not “tester email invite automation.”

It is **Apple Developer team access automation** with a Telegram intake UI.

Apple’s App Store Connect API exposes user invitations. Apple documents `POST /v1/userInvitations` as the endpoint to invite a user with assigned roles to join a team.

Source: Apple, “Invite a User”  
https://developer.apple.com/documentation/appstoreconnectapi/post-v1-userinvitations

Apple also states that to add users, you create a `userInvitation`; App Store Connect adds the user to the team when the invitation is accepted.

Source: Apple, “Users”  
https://developer.apple.com/documentation/appstoreconnectapi/users

## 5. MVP 1 scope

### User flow

```text
/start
→ bot asks for Apple ID email
→ user enters email
→ bot trims whitespace
→ bot validates basic email shape
→ bot shows normalized email for confirmation
→ user confirms
→ backend starts Apple-side automation
→ bot replies: request accepted
```

### Bot behavior

| Area | Decision |
|---|---|
| Intake | Open intake |
| Abuse protection | None for MVP |
| Kill switch | Stop accepting new requests; existing operations may finish |
| User feedback | Accepted-only after confirmed email |
| Admin notifications | Submission + Apple-side failures |
| Retry | Simple retry for transient Apple/API failures |
| App support | One app only |
| Stack | Defer to technical spec |
| Deployment | Stack-dependent; VPS likely but not fixed |

## 6. Apple-side runtime flow

Target runtime flow:

```text
create/find App Store Connect user invitation
→ assign minimum required role/app visibility
→ wait for acceptance if required by Apple flow
→ assign internal TestFlight access path
→ notify admin only on failure
```

Apple documents pending user invitations as resources; when created, the invited user receives an email link to activate and connect the account to their Apple Account. Apple also states user invitations expire after three days.

Source: Apple, “User Invitations”  
https://developer.apple.com/documentation/appstoreconnectapi/user-invitations

## 7. Minimum-role policy

The system should optimize for **minimum role/app access**.

Apple’s role model controls what users can access and do in App Store Connect.

Source: Apple, “Role permissions”  
https://developer.apple.com/help/app-store-connect/reference/account-management/role-permissions/

Decision:

> Grant only the minimum App Store Connect role and app visibility needed to make the user an internal TestFlight tester for the target app.

Implementation note for the technical spec:

> Exact role/API-field mapping must be verified before implementation. The decision memo fixes the access policy, not the final role name.

## 8. TestFlight group/build automation

Apple’s App Store Connect API includes TestFlight resources for beta groups, beta testers, builds, and group relationships.

Sources:

- Apple, “Beta Groups”  
  https://developer.apple.com/documentation/appstoreconnectapi/beta-groups
- Apple, “Beta Testers”  
  https://developer.apple.com/documentation/appstoreconnectapi/beta-testers
- Apple, “Add Beta Testers to a Beta Group”  
  https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betagroups-_id_-relationships-betatesters
- Apple, “Add Builds to a Beta Group”  
  https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betagroups-_id_-relationships-builds

Decision:

> The bot/backend should automate the Apple-side access path as far as Apple’s API supports cleanly. Any API gap becomes a technical-spec risk, not a product-flow change.

## 9. Persistence and logs

Use audit-light operational persistence.

| Data | Decision |
|---|---|
| Telegram user ID | Store |
| Telegram username | Optional |
| Submitted Apple ID email | Store |
| Onboarding status | Store |
| Retry count | Store |
| Apple invitation/user/group identifiers | Store if returned |
| Failure reason | Store |
| Successful records | Delete after 7 days |
| Failed records | Keep until resolved/manual cleanup |
| Logs | Sanitized; no raw Apple API payload dumps |

Rationale:

- enough state for retry/debugging;
- avoids turning the bot into a personal-data archive;
- supports “user says nothing happened” debugging;
- keeps successful onboarding data short-lived.

## 10. MVP 2

MVP 2 adds user-facing status changes.

| Status change | User notification |
|---|---|
| Apple invitation sent | Yes |
| Waiting for Apple invitation acceptance | Likely yes |
| Internal TestFlight access ready | Yes |
| Failed | Yes, with user-safe wording |

MVP 1 intentionally avoids this and replies only after email confirmation:

> Request accepted.

## 11. Non-goals

- external TestFlight registration;
- public TestFlight link distribution;
- Beta App Review optimization;
- public marketing beta funnel;
- manual-first onboarding;
- multi-app selector;
- implementation code;
- stack decision;
- full technical specification;
- implementation ticket.

## 12. Final recommendation

Proceed with:

> **MVP 1: Telegram intake + automated App Store Connect user invitation/access flow + internal TestFlight access for one app.**

This is the lowest-friction path for the stated intent because it avoids external Beta App Review and matches the 100-person internal tester limit, while keeping Telegram as the controlled onboarding interface.
