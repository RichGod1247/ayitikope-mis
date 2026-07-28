# D3.5A Headteacher Appraisal Real-Role UAT Runbook

## 1. Purpose and boundaries

This runbook prepares a controlled, evidence-based real-role user acceptance test for the completed D3.4 Headteacher appraisal lifecycle.

The objective is to prove that the implemented workflow is usable, truthful, private, tenant-safe, retry-safe, and understandable on ordinary mobile devices and weak networks.

Do not use production records. Do not use real confidential staff responses. No provider delivery is permitted during this UAT. SMS and email channels must remain dry, skipped, disabled, or isolated from live providers.

The two evidence streams remain separate:

1. Confidential staff feedback.
2. Governance supervisory assessment.

No combined appraisal score is created or inferred.

SISSO is one circuit office. `CIRCUIT_SUPERVISOR` may appear only as a legacy technical alias and must not be treated as a separate office.

## 2. Environment requirements

Use a non-production environment that matches the current application schema and configuration closely enough to exercise authentication, tenant isolation, lifecycle transactions, no-store APIs, and the BBC-friendly workspaces.

Required controls:

- Current branch and sealed D3.4I commit.
- Clean worktree.
- Non-production database only.
- No production credentials.
- No live SMS or email provider invocation.
- One test district with at least two test schools.
- One test circuit assigned to the SISSO account.
- Browser developer tools available for request/response evidence.
- Mobile-width testing at approximately 360–430 pixels.
- A weak-network profile for explicit save/load testing.
- A written cleanup plan before any test record is created.

## 3. Test identities

Create or use dedicated non-production accounts only:

| Identity | Required scope | Purpose |
|---|---|---|
| Headteacher A | School A | Requests appraisal and views released result |
| Teacher A1 | School A | Completes confidential feedback |
| Teacher A2 | School A | Tests second eligible respondent and retry behavior |
| Headteacher B | School B | Proves cross-school isolation |
| Teacher B1 | School B | Proves cross-school isolation |
| SISSO | Circuit containing School A | Performs the supervisory assessment as the single circuit office |
| District Director | Test district | Approves/opens, reviews, returns/holds/releases |
| Optional HOS/BSC | Test district | Verifies alternate authorized governance-assessor boundaries |

Never reuse production users or actual staff contact details.

## 4. Non-production test dataset

Prepare the smallest dataset that proves the workflow:

- One active test district.
- One active SISSO circuit.
- School A and School B in the same test district.
- One active Headteacher in each school.
- At least two active Teachers in School A.
- At least one active Teacher in School B.
- Active governance assignments for the District Director and SISSO.
- Notification contacts set to non-live values or opt-out/skipped states.
- No historical production appraisal records copied into the test tenant.

Record the test tenant IDs, user IDs, role names, and assignment IDs in a private test evidence sheet. Do not place secrets or passwords in the repository.

## 5. Role-by-role UAT sequence

### Phase A — Headteacher request

1. Sign in as Headteacher A.
2. Open **My Appraisal**.
3. Confirm the truthful initial state.
4. Request the appraisal.
5. Repeat the same request once and verify idempotent behavior.
6. Confirm Headteacher B cannot see or affect School A’s request.

Evidence:

- Page screenshot.
- Request status.
- Network response status.
- Audit reference without respondent identities.

### Phase B — Director approval or direct-open

1. Sign in as the District Director.
2. Verify the request is inside the assigned district.
3. Approve and open the cycle, or use the authorized direct-open route in a separate test cycle.
4. Confirm the seven-day window and frozen same-school Teacher set.
5. Repeat the same action and verify no duplicate cycle or participant rows.
6. Attempt an out-of-district target and verify fail-closed behavior.

Evidence:

- Director screen.
- Cycle status.
- Opened/deadline timestamps.
- Retry result.
- Cross-district rejection.

### Phase C — Teacher confidential responses

1. Sign in as Teacher A1.
2. Confirm only the assigned School A cycle is visible.
3. Save one section under weak-network conditions.
4. Reload and confirm the saved section is truthful.
5. Complete all four sections and all 34 items using 1–5 or N/A.
6. Finalize.
7. Retry finalization and verify `EXISTING_FINALIZED` or the equivalent immutable result.
8. Confirm Teacher B1 cannot access School A’s cycle.
9. Confirm the Headteacher cannot see respondent identities, individual forms, completion lists, response counts, or item-level values.

Evidence:

- Mobile screenshots.
- Section-save response.
- Finalization proof reference.
- Cross-tenant rejection.
- Headteacher privacy check.

### Phase D — Deadline closure and aggregate

1. Use an authorized non-production clock/deadline setup.
2. Close the cycle after the deadline.
3. Verify finalized responses are preserved.
4. Verify incomplete/not-started participants expire atomically.
5. Verify aggregate readiness.
6. Re-run closure and verify an idempotent existing/advanced result.
7. Confirm the aggregate contains no respondent identities.

Evidence:

- Closure result.
- Aggregate readiness.
- Retry result.
- Privacy-safe audit output.

### Phase E — SISSO supervisory assessment

1. Sign in as SISSO.
2. Open the governance supervisory workspace.
3. Create a draft for Headteacher A using a valid visit date.
4. Save one section under weak-network conditions.
5. Complete all four sections and 34 items.
6. Finalize.
7. Retry finalization.
8. Confirm SISSO cannot assess outside the assigned circuit.
9. Confirm `CIRCUIT_SUPERVISOR` is treated only as the same legacy office alias, not a second office.

Evidence:

- Mobile screenshots.
- Draft and visit-context proof.
- Section-save result.
- Finalized assessment proof.
- Out-of-scope rejection.

### Phase F — Director review, return/hold, revision, and release

Use separate non-production cycles where needed so every branch is tested cleanly.

1. Start Director review.
2. Load the privacy-safe evidence package.
3. Verify staff feedback and supervisory evidence remain separate.
4. Verify there is no combined score or invented weighting.
5. Return one finalized supervisory assessment with a reason.
6. Confirm the original is returned and a new assessor-owned revision is required.
7. Complete and finalize the revision as SISSO.
8. Reopen the Director package.
9. Test hold with a reason.
10. Release with an optional note.
11. Retry the identical release and verify the official release is not duplicated.
12. Change release evidence and verify fail-closed behavior.

Evidence:

- Director review screenshots.
- Return reason and revision chain.
- Hold result.
- Release-proof reference.
- Identical retry result.
- Changed-evidence rejection.

### Phase G — Post-release notification seeding

1. Verify the release commits before notification seeding.
2. Verify one in-app `FEEDBACK_RELEASED` row for the exact released Headteacher.
3. Verify SMS/email rows are pending or contact-safe skipped.
4. Repeat seeding and verify no duplicates.
5. Confirm no live provider call occurs.

Evidence:

- Notification row summary without contacts.
- Idempotent retry result.
- Provider-called flag remains false.

### Phase H — Headteacher released result

1. Sign in as Headteacher A.
2. Open **My Appraisal** from the existing dashboard tile.
3. Press **Load my released result**.
4. Verify the two overall percentages.
5. Verify the four section comparisons.
6. Verify the Director release note.
7. Verify the proof reference.
8. Confirm response counts, item-level values, respondent identities, individual forms, reviewer identity, and assessor identity are absent.
9. Confirm Headteacher B cannot load Headteacher A’s result.
10. Test under weak network; confirm there is no background polling and no browser persistence.

Evidence:

- Mobile screenshots.
- No-store response headers.
- Cross-tenant rejection.
- Privacy checklist.
- Weak-network behavior.

## 6. Failure and recovery checks

Test these without modifying production or bypassing authorization:

- Duplicate request.
- Duplicate approval/open.
- Duplicate Teacher section save.
- Duplicate Teacher finalization.
- Deadline closure retry.
- Supervisory draft retry with same context.
- Changed supervisory context rejection.
- Finalization retry.
- Returned revision retry.
- Director review-start retry.
- Return retry.
- Hold retry.
- Release retry.
- Changed release evidence rejection.
- Post-release notification retry.
- Temporary notification-seeding failure after committed release.
- Result load after brief network interruption.

Every retry must be truthful, idempotent, and free of duplicate institutional records.

## 7. Evidence capture

For each test case record:

- Test case identifier.
- Date and time.
- Environment name.
- Acting role.
- Acting tenant and jurisdiction.
- Route or page.
- Expected result.
- Actual result.
- HTTP status.
- No-store header result where applicable.
- Audit/proof reference where applicable.
- Screenshot filename.
- Pass/fail.
- Defect identifier, severity, and owner.

Do not capture passwords, OTPs, raw contact details, respondent identities, individual confidential forms, access tokens, cookies, or production secrets.

## 8. Exit criteria

D3.5A readiness is complete when:

- The readiness QA gate is green.
- The D3.4I acceptance gate remains green.
- All appraisal regressions remain green.
- Strict typecheck is green.
- Production build is green.
- The runbook is committed.
- The worktree is clean.
- No production records were created.
- No provider was called.

The subsequent real-role UAT execution is acceptable only when:

- Every role completes its assigned workflow.
- Tenant and jurisdiction isolation tests pass.
- Privacy checks pass.
- Idempotency/recovery checks pass.
- BBC mobile usability is acceptable.
- Weak-network behavior is understandable and safe.
- No severity-1 or severity-2 defect remains open.
- Cleanup is verified.

## 9. Cleanup and rollback

Before UAT, document every test tenant, account, assignment, cycle, notification row, and evidence record that may be created.

After UAT:

1. Export the non-sensitive pass/fail evidence.
2. Disable or remove dedicated test accounts.
3. Remove or archive only the explicitly identified non-production UAT records.
4. Verify no live provider message was sent.
5. Verify no production tenant was touched.
6. Verify the repository worktree is clean.
7. Preserve the sealed Git commits and UAT evidence summary.
8. Do not rewrite or delete immutable production audit evidence.
