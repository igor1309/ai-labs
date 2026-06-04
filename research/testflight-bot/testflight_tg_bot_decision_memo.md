# Decision Memo: Telegram Bot for TestFlight Closed Testing

## Decision

Build a small Telegram bot that collects a tester email and automatically registers it into a prepared **External Testing / closed TestFlight group** in App Store Connect.

Do **not** start with public links, internal testers, multi-app selection, or admin approval.

## Recommended MVP

### User flow

1. User opens Telegram bot.
2. Bot explains: “Send the email you use for Apple/TestFlight.”
3. User sends email.
4. Backend creates or finds the beta tester in App Store Connect.
5. Backend adds the tester to the configured TestFlight beta group.
6. User receives Apple/TestFlight invitation by email.

### Apple/TestFlight model

Use **external testers invited by email**.

Why:

- Internal testers are App Store Connect team members. That is wrong for normal Telegram users.
- Public links reduce friction but weaken control.
- External closed groups match the desired model: selected people, email invitation, controlled group membership.
- Apple allows inviting external testers by email and supports external testing groups.
- External testing requires a build available for TestFlight external testing; the first external build must go through TestFlight App Review.

### Registration model

Use **open-auto for MVP**:

- Any Telegram user who submits a valid email is registered.
- Store Telegram user ID + email + registration status.
- Add light abuse protection: one active email per Telegram user, rate limit repeated attempts.

Reason:

- This is for prototype testing, not public acquisition.
- Admin approval adds friction and implementation surface.
- If the bot link leaks, the damage is bounded by TestFlight group limits and removable testers.

Upgrade path:

- Add invite codes if the bot link starts spreading.
- Add admin approval if prototypes become sensitive.
- Add app selection when there are multiple active apps.

### Apple-side setup ownership

Keep Apple setup manual.

One-time setup:

- Create app record.
- Upload build.
- Add TestFlight test information.
- Create External Testing group.
- Add build to that group.
- Ensure build passes TestFlight App Review when required.
- Create App Store Connect API key with suitable permissions.
- Configure backend with:
  - issuer ID
  - key ID
  - private key
  - app ID
  - beta group ID

Runtime automation:

- Bot/backend handles only tester registration into an existing group.

Reason:

- App Store Connect setup is low-frequency and permission-sensitive.
- Automating group/build/app setup is unnecessary for MVP.
- Keeping setup manual avoids accidental Apple-side state changes.

### Implementation stack

Use **Node.js / TypeScript** unless there is a strong reason not to.

Reason:

- Telegram bot libraries are mature.
- JWT signing and HTTP clients are straightforward.
- Deployment is simple on common VPS/PaaS options.
- TypeScript is safer than a loose script for state/status handling.

Acceptable alternative:

- Python is fine for fastest scripting.
- Swift/Vapor is possible but adds less value here unless you want the backend in Swift for learning or consistency.

## System shape

```text
Telegram User
    ↓
Telegram Bot
    ↓
Registration Backend
    ↓
App Store Connect API
    ↓
TestFlight External Testing Group
    ↓
Apple email invitation to tester
```

## Minimal data model

```text
TesterRegistration
- telegramUserID
- telegramUsername?
- email
- appID
- betaGroupID
- status: received | submittedToApple | invited | failed
- appleBetaTesterID?
- failureReason?
- createdAt
- updatedAt
```

## Required backend operations

1. Validate email shape.
2. Check whether Telegram user already submitted an email.
3. Create beta tester or find existing tester.
4. Add tester to configured beta group.
5. Persist status.
6. Reply with clear result:
   - “Invitation requested. Check email.”
   - “This email is already registered.”
   - “Registration failed. Try later.”

## What must be grounded in Apple behavior

- TestFlight supports external testers and external tester groups.
- External testers can be invited by email.
- External testers can also be invited via public links, but this memo does not recommend that for MVP.
- External testing has Apple-side review/setup requirements.
- App Store Connect API supports beta testers and beta groups.
- API authentication uses JWT signed with an App Store Connect API private key.

## Main risks

| Risk | Impact | MVP handling |
|---|---:|---|
| Build is not approved for external testing | Users registered but cannot test | Manual setup checklist before bot launch |
| Wrong App Store Connect permissions | API calls fail | Verify API key with a dry-run/list call |
| Same email submitted repeatedly | Duplicate/noisy state | Deduplicate by email and Telegram user |
| Bot link leaks | Unwanted testers join | Rate limit now; invite codes later |
| Apple API behavior differs from expectation | Failed invitations | Log raw Apple error and surface generic bot message |
| Private API key leaks | Account risk | Store only in server secret storage; never in repo |

## Non-goals for MVP

- Multi-app selection.
- Admin approval workflow.
- Public TestFlight link generation.
- Creating apps/groups/builds from the bot.
- Managing build lifecycle.
- Tester feedback collection.
- Full CRM-style tester management.
- Industry-scale security/compliance.

## Final recommendation

Build the MVP as:

```text
Single app
External closed TestFlight group
Email-based invite
Open-auto registration
Manual Apple setup
Node.js/TypeScript backend
Small persistent store
```

This gives the intended low-friction flow while keeping control at the TestFlight group level. It avoids premature admin tooling and avoids using public links before there is evidence that friction is the real bottleneck.

## Apple documentation used

- Apple Developer — TestFlight: external testers, 10,000 external tester limit, external group setup, first build review requirement.
  https://developer.apple.com/testflight/

- App Store Connect Help — Invite external testers: email invitation and public link options.
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/

- App Store Connect API — Beta Testers: create/delete beta testers, assign to apps/builds/groups; beta tester requires email when created directly.
  https://developer.apple.com/documentation/appstoreconnectapi/beta-testers

- App Store Connect API — Create a Beta Tester.
  https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betatesters

- App Store Connect API — Add Beta Testers to a Beta Group.
  https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betagroups-_id_-relationships-betatesters

- App Store Connect API — Beta Groups.
  https://developer.apple.com/documentation/appstoreconnectapi/beta-groups

- App Store Connect API — Generating Tokens for API Requests.
  https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests

- App Store Connect Help — App Store Connect API: API key generation and roles.
  https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/

- Apple Developer Help — Roles: TestFlight and API permissions.
  https://developer.apple.com/help/account/access/roles/
