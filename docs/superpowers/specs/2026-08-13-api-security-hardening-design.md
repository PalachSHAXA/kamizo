# API Security Hardening Design

## Goal

Close the confirmed authorization and workflow bypasses in meetings and
requests without changing the database schema or interrupting active voting.

## Scope

- Require authentication and tenant context when listing meetings.
- Restrict request assignment and generic updates by role and ownership.
- Treat `resident`, `tenant`, and `commercial_owner` as equivalent request
  owners for cancellation.
- Allow meeting voting only for `resident` and `commercial_owner` users that
  are eligible for the meeting.
- Validate vote choice and agenda item ownership on the server.
- Stop accepting OTP verification claims from the client.
- Restrict protocol generation and approval to valid roles and states.

This package does not add columns, change existing tables, deploy to
production, add an SMS provider, or implement the complete OTP user flow.

## Authorization Rules

### Meeting list

`GET /api/meetings` requires an authenticated user and a non-empty tenant ID.
Every meeting query is filtered by that tenant ID. Resident-like building
visibility remains unchanged after authentication.

### Request assignment and updates

Only `admin`, `director`, `manager`, `dispatcher`, and `department_head` may
assign an executor. A department head remains limited to their specialization.
Executors cannot assign or reassign requests through the management endpoint.

The generic `PATCH /api/requests/:id` becomes a metadata endpoint rather than
a workflow endpoint. It must not accept `status` or `executor_id`. Status
transitions continue through the existing dedicated workflow endpoints.

`resident`, `tenant`, and `commercial_owner` may cancel only their own request
and only while it is `new`, `assigned`, or `accepted`. Management roles may
cancel any non-completed request in their tenant. Other roles are denied.

The legacy rating endpoint may rate only an owned request that is already
`pending_approval` or `completed`; it must not force an arbitrary request to
`completed`.

### Meeting voting

Only `resident` and `commercial_owner` may vote. A voter must either have an
eligible-voter row for the meeting or match the meeting building under the
existing fallback rule. `tenant` users cannot vote without a future explicit
delegation model.

The server accepts only `for`, `against`, or `abstain`. The agenda item must
belong to the meeting and tenant. Area and apartment data remain server-derived.

The current production OTP flow is not operational: all existing meetings use
`require_otp=1`, the OTP table has no rows, the frontend does not invoke the OTP
routes, and the route contract differs from the production schema. This package
therefore does not block active voting. It ignores client-provided
`otp_verified` and `verification_method`, stores `otp_verified=0`, and records
the method as `login`. A separate OTP package must add delivery, schema-aligned
verification, attempt limiting, frontend UX, and a safe rollout.

### Protocol lifecycle

Protocol generation remains available to `admin`, `director`, and `manager`,
but only after voting is closed or results are published. An already approved
protocol cannot be regenerated.

Only `admin` and `director` may approve a protocol. Approval requires meeting
status `protocol_generated` and updates only the tenant-scoped meeting and its
current protocol.

## Error Behavior

- Missing authentication: `401`.
- Missing tenant context or cross-tenant object: `403` or `404` without leaking
  whether the object exists.
- Role violation: `403`.
- Invalid field, vote choice, or state transition: `400`.
- Concurrent state change: `409` where an atomic update affects no rows.

## Testing

Implementation follows red-green-refactor. Tests must first reproduce each
confirmed bypass and fail for the expected reason.

Required coverage:

- anonymous and tenant-less meeting list requests are rejected;
- meeting lists cannot read another tenant;
- executor and resident assignment attempts are rejected;
- generic request PATCH rejects `status` and `executor_id`;
- all three request-owner roles can cancel only their own early-stage request;
- invalid request roles and states are rejected;
- tenant users cannot vote, while eligible owners can;
- invalid vote choices and foreign agenda items are rejected;
- client OTP flags never produce a verified vote;
- protocol generation and approval enforce role, state, and tenant;
- approved protocols cannot be regenerated.

After focused tests pass, run the complete backend test suite, backend
TypeScript check, frontend TypeScript check, and frontend production build.

## Rollout

This package ends with verified repository changes only. Production deployment
is a separate explicit action. Before deployment, review active meetings and
request clients for reliance on the removed generic transitions. After a future
deployment, verify authorization failures, normal resident voting, request
workflow transitions, protocol generation, and API logs.

## Follow-up Packages

1. Complete OTP with an SMS provider and production-schema migration.
2. Remove reversible staff passwords and add password reset.
3. Implement production SQLite backup and restore drills.
4. Isolate frontend caches and stores by tenant and user.
