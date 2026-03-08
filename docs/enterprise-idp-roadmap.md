# Enterprise IdP Roadmap

## Purpose

This document captures the full architectural review and feature roadmap for evolving AuthLab from a solid happy-path SSO test utility into a credible enterprise identity integration workbench.

It includes:

- current-state findings
- protocol coverage gaps
- enterprise-specific reasoning behind each recommendation
- implementation phases, including Phase 1
- prioritization guidance for what should come next

This file is intended to be the durable product and engineering reference for upcoming roadmap work.

## Current State Summary

AuthLab currently supports:

- OIDC Authorization Code flow with PKCE
- OIDC discovery-based configuration
- generic claims inspection
- SAML SP-initiated and IdP-initiated SSO
- SAML metadata import from XML or URL
- XML hardening including XXE defense
- HTTP-Redirect and HTTP-POST SAML bindings
- inspector views for claims, JWT payloads, and raw token/XML output
- multi-tenant teams with RBAC
- encrypted secrets at rest

### Assessment

The current implementation is strong for basic protocol validation and analyst-driven "happy path" testing. It is already useful for standing up test apps, proving connectivity, and inspecting assertion/token content.

The major gap is not correctness of the current flows. The major gap is breadth:

- too few OIDC grant types
- too little token lifecycle tooling
- not enough logout/session coverage
- missing enterprise SAML controls
- limited debug and comparison workflows
- not enough support for IdP-specific enterprise scenarios

In short, AuthLab is good at "did login succeed?" but not yet strong enough at "why did this identity integration behave this way in a real enterprise environment?"

## Architectural Findings

### 1. OIDC coverage is too narrow

AuthLab has a good Authorization Code + PKCE base, but many real deployments still require:

- non-PKCE Authorization Code support for legacy clients
- machine-to-machine testing
- refresh token and lifecycle validation
- device and delegated/advanced flows

This matters because enterprise evaluators are often not testing a browser login alone. They are validating a broader identity platform configuration including API clients, service principals, consent, session renewal, and logout behavior.

### 2. Token lifecycle tooling is incomplete

For enterprise troubleshooting, successful login is only the beginning. Teams need to validate:

- whether an access token is active
- whether a refresh token rotates correctly
- whether revocation works
- whether UserInfo matches ID token claims
- whether the nonce and related token protections were honored

Without these checks, AuthLab can confirm issuance but not operational correctness.

### 3. Logout and session management are materially undercovered

Enterprise SSO rollouts fail just as often on logout as on login. RP-initiated logout, back-channel logout, and front-channel logout are recurring sources of integration bugs across Okta, Entra ID, Auth0, Ping, and ForgeRock.

If AuthLab validates login but not logout, it leaves a critical gap in end-to-end confidence.

### 4. SAML controls are not enterprise-complete

SAML in enterprise environments routinely depends on:

- signed AuthN requests
- encrypted assertions
- explicit NameID format configuration
- Single Logout
- authentication context requests
- request flags such as ForceAuthn and IsPassive

Without these, many common Entra ID, PingFederate, Okta, and Shibboleth setups cannot be tested faithfully.

### 5. Debugging ergonomics need to evolve into analyst workflows

Raw payload views are useful but not sufficient. Analysts need:

- structured protocol diagnostics
- metadata visibility
- validation annotations
- traces
- comparison tools
- time-based token views

The product needs to move from payload dumping toward guided protocol inspection.

### 6. IdP-specific scenarios matter disproportionately

Even when standards are nominally supported, enterprise IdPs differ in practical behavior:

- Okta authorization server patterns
- Auth0 organizations and connections
- Entra tenant modes and group/app role claims
- Ping and ForgeRock support for token exchange, adaptive auth, and artifact binding

The highest-leverage product direction is not hardcoding every vendor, but building enough flexible controls to model their differences without bespoke code for each one.

## Strategic Product Principle

The single highest-value direction is flexibility over narrow handholding.

The best example is custom authorization parameters. A generic key-value parameter editor unlocks:

- `login_hint`
- `prompt`
- `acr_values`
- `organization`
- `connection`
- `max_age`
- `ui_locales`
- `claims`

That one feature covers a large share of enterprise OIDC variance without creating per-vendor UI sprawl.

The same principle should guide future work:

- build generic protocol control surfaces
- expose underlying standards clearly
- make debugging explicit
- avoid one-off vendor logic unless it fills a real workflow gap

## OIDC Flow Coverage Gaps

| Feature | Current Status | Priority | Why It Matters |
| --- | --- | --- | --- |
| Authorization Code without PKCE | Missing | High | Needed for legacy apps and older IdP/client combinations |
| Client Credentials grant | Missing | High | Essential for M2M and API testing |
| Refresh token support | Missing | High | Required for realistic token lifecycle validation |
| Device Authorization grant | Missing | Medium | Useful for CLI, device, and constrained-input scenarios |
| Implicit flow | Missing | Low | Mainly for legacy validation and migration testing |
| Token Exchange (RFC 8693) | Missing | Medium | Important in Ping and ForgeRock enterprise environments |
| CIBA | Missing | Low | Advanced niche enterprise scenario |

### OIDC Recommendations

#### Client Credentials

Add a dedicated test workflow for `client_id` plus `client_secret` token requests and display the resulting access token claims. This is essential because many enterprise buyers must validate service-to-service integrations, not only user-facing login.

#### Refresh Tokens

Add `offline_access` support, persist refresh tokens securely, and provide a refresh action that shows old versus new token results. This is necessary for validating rotation behavior and renewal policy.

#### PKCE Toggle

Allow:

- disabled
- `S256`
- `plain`

This should be per app instance. It is needed because legacy or misconfigured IdPs do not always behave correctly with modern PKCE defaults.

#### Device Authorization

Add a device flow view that displays:

- `user_code`
- `verification_uri`
- poll status
- eventual token result

This is useful for enterprise CLI and device testing against IdPs such as Okta and Entra ID.

## OIDC Token and Session Features

| Feature | Current Status | Priority | Why It Matters |
| --- | --- | --- | --- |
| Token introspection | Missing | High | Validates resource server token state |
| Token revocation | Missing | High | Validates immediate invalidation behavior |
| UserInfo endpoint call | Phase 1 | High | Compares token claims with profile endpoint results |
| JWT signature validation display | Missing | High | Analysts need trust diagnostics, not only decoded payloads |
| `at_hash` and `c_hash` display | Missing | Medium | Useful for protocol correctness checks |
| Nonce support | Phase 1 | High | Required replay-defense validation |
| `acr_values` and `amr` diagnostics | Partially missing | High | Critical for MFA and policy troubleshooting |
| Custom authorization parameters | Phase 1 | High | Highest flexibility gain across IdPs |
| Token lifetime / expiry timeline | Missing | Medium | Helps analysts understand session and renewal timing |

### Recommendations

#### UserInfo

Already in Phase 1. This should remain a first-class inspector action because mismatches between ID token claims and UserInfo are common and highly diagnostic.

#### Introspection

Add an inspector panel that calls the introspection endpoint and displays:

- `active`
- `scope`
- `client_id`
- `exp`
- token type metadata

This is especially useful for API and resource-server troubleshooting.

#### Revocation

Add revoke actions and follow-up state confirmation. Ideally the UX should show revocation followed by introspection results so analysts can confirm the provider actually invalidated the token.

#### Nonce Validation

Already in Phase 1. This should stay visible as an explicit pass/fail diagnostic in the session summary, not hidden in raw payloads.

#### `amr` and `acr`

Even if these values are already visible as generic claims, the product still needs explicit inspection treatment because these claims often drive MFA, Conditional Access, and step-up policy debugging.

## OIDC Logout and Session Management

| Feature | Current Status | Priority | Why It Matters |
| --- | --- | --- | --- |
| RP-initiated logout | Phase 1 | High | Table-stakes for browser SSO validation |
| Front-channel logout | Missing | Medium | Needed for coordinated browser logout scenarios |
| Back-channel logout | Missing | High | Important for enterprise logout propagation |
| Session Management iframe | Missing | Low | Lower-value legacy mechanism |

### Recommendations

#### RP-Initiated Logout

Already in Phase 1. This should remain driven by discovery and visible only when the provider advertises an end-session endpoint and an ID token is available.

#### Back-Channel Logout

Implement a logout token endpoint and local session invalidation workflow. This is high-value because enterprise buyers often need to verify centralized session invalidation across relying parties.

#### Front-Channel Logout

Add a visible signal when the IdP triggers the registered front-channel logout URI. This matters because front-channel implementations often break due to browser or CSP assumptions.

## SAML Feature Gaps

| Feature | Current Status | Priority | Why It Matters |
| --- | --- | --- | --- |
| AuthN request signing | Phase 1 | High | Required by many enterprise IdPs |
| Encrypted assertions | Phase 3 | High | Mandatory for many enterprise SAML integrations |
| NameID format configuration | Phase 1 | High | Critical for interop troubleshooting |
| Single Logout | Phase 3 | High | Enterprise baseline requirement |
| Artifact binding | Missing | Medium | Needed in Ping and Shibboleth deployments |
| ForceAuthn / IsPassive | Phase 1 | High | Needed for silent auth and step-up testing |
| AuthnContextClassRef requests | Phase 3 | High | Required for authentication policy testing |
| Scoping / ProxyCount | Missing | Low | Specialized federation case |
| Attribute query | Missing | Low | Niche but useful in Shibboleth-style deployments |
| ECP | Missing | Low | Specialized scenario |
| Signature algorithm selection | Missing | Medium | Needed for legacy interop validation |
| Clock skew tolerance | Phase 3 | Medium | Useful in labs and staging environments |
| Conditions / AudienceRestriction display | Missing | Medium | Improves SAML troubleshooting accuracy |

### Recommendations

#### AuthN Request Signing

Already in Phase 1, and the chosen architecture should remain per-app signing only. This preserves realistic SP behavior and avoids hybrid fallback complexity.

#### Encrypted Assertions

Add per-app encryption material and decryption handling. This is mandatory for realistic Entra ID and Ping enterprise SAML testing.

#### NameID Format

Already in Phase 1. Keep it explicit in both configuration and inspector output.

#### ForceAuthn and IsPassive

Already in Phase 1. These are high-value because they expose silent SSO and reauthentication behavior directly.

#### AuthnContextClassRef

This is the next major SAML control to add after Phase 1 because it enables meaningful MFA and assurance-level testing.

#### Single Logout

This remains one of the most important missing SAML capabilities. It should support both SP-initiated and IdP-initiated flows.

## Enhanced Inspector and Debugging

| Feature | Current Status | Priority | Why It Matters |
| --- | --- | --- | --- |
| Structured SAML assertion viewer | Missing | High | Makes XML understandable at analyst speed |
| SAML signature verification detail panel | Missing | High | Needed for trust troubleshooting |
| SAML Conditions and SubjectConfirmation display | Missing | High | Critical validity diagnostics |
| OIDC discovery metadata viewer | Phase 1 | High | Helps configure and explain provider behavior |
| Request and response trace logging | Missing | High | Needed for end-to-end debugging |
| Token timeline | Missing | Medium | Useful for lifecycle analysis |
| Claims diff | Missing | Medium | Useful when comparing two runs |
| IdP certificate expiry checker | Missing | Medium | Helps identify impending breakage |
| Protocol compliance report | Missing | Low | Nice-to-have summary layer |

### Recommendations

#### Structured SAML Viewer

The SAML payload should eventually be rendered as a structured analytical tree, including:

- Issuer
- Subject
- NameID value and format
- Conditions
- AudienceRestriction
- AuthnStatement
- SessionIndex
- AuthnContextClassRef
- AttributeStatement

Each area should expose validation status, not just values.

#### Discovery Metadata Viewer

Already in Phase 1. This should stay lightweight and on-demand rather than becoming persistent configuration state.

#### Trace Logging

Eventually store per-run protocol traces for:

- authorization URL
- token request and response
- UserInfo request and response
- SAML AuthnRequest XML
- SAMLResponse XML

This is one of the highest-value post-Phase-1 analyst capabilities.

#### Claims Diff

Allow analysts to save two runs and compare claims side-by-side. This is especially useful when testing:

- scope changes
- claim mapping changes
- MFA policy changes
- SP-initiated versus IdP-initiated flows

## IdP-Specific Scenario Coverage

### Okta

Recommended support:

- authorization server selection guidance
- groups claim guidance
- custom parameter flexibility for hooks and policy testing

Reasoning:

Okta frequently differs based on whether a customer uses the org issuer or a custom authorization server. Analysts often misconfigure this and need explicit cues.

### Auth0

Recommended support:

- `organization`
- `connection`
- token claim inspection for Actions and Rules
- hosted login validation

Reasoning:

Auth0 behavior often depends more on authorization parameters than on static app metadata, making flexible runtime parameters especially valuable.

### Entra ID

Recommended support:

- tenant-mode awareness
- app role and group claim guidance
- `acrs` and step-up testing
- encrypted SAML assertions

Reasoning:

Entra often requires understanding issuer patterns, tenant scope, and claim overage behavior. This is hard to diagnose with only generic login success.

### PingIdentity and ForgeRock

Recommended support:

- token exchange
- artifact binding
- adaptive auth via `acr_values`
- broader advanced OIDC and SAML flexibility

Reasoning:

These vendors show up in larger or more mature identity programs where advanced protocols are not theoretical edge cases.

## Multi-Protocol and Advanced Scenarios

| Feature | Priority | Reasoning |
| --- | --- | --- |
| SP-initiated vs IdP-initiated comparison | High | Helps compare claim and assertion differences clearly |
| Step-up authentication testing | High | Directly useful for MFA and assurance validation |
| JIT provisioning simulation | Medium | Helps downstream application onboarding scenarios |
| SCIM mock endpoint | Medium | High differentiation for enterprise evaluations |
| Dynamic client registration | Medium | Useful for standards-complete OIDC testing |
| Pushed Authorization Requests | Medium | Important for FAPI and regulated environments |
| DPoP | Low | Emerging standard, lower current demand |
| mTLS client authentication | Low | Important but advanced and operationally heavier |
| SAML to OIDC bridge testing | Medium | Useful in hybrid federation environments |

### Important Product Insight

SCIM mock support is strategically important because many enterprise IdP evaluations test provisioning and SSO together. AuthLab can become significantly more differentiated if it supports both.

PAR is also important because it is increasingly required in regulated ecosystems and financial-grade OIDC deployments.

## Phase Plan

## Phase 1: Enterprise Essentials

### Scope

- custom authorization parameters
- nonce support and validation
- RP-initiated logout
- UserInfo endpoint call
- SAML AuthN request signing
- SAML NameID format configuration
- SAML ForceAuthn and IsPassive
- OIDC discovery metadata viewer

### Architectural Direction

- persist auth execution state in a DB-backed `AuthRun`
- keep cookies as thin pointers instead of storing full auth payloads
- use per-app SAML signing material only
- store sensitive material encrypted at rest
- keep runtime protocol overrides ephemeral to the run, not app defaults

### Why Phase 1 First

Phase 1 unlocks immediate enterprise credibility without taking on the heaviest protocol work first.

It addresses:

- browser login realism
- logout validation
- flexible OIDC request shaping
- meaningful SAML interoperability
- the first serious step toward analyst-focused diagnostics

### Phase 1 Status

Phase 1 is the implemented foundation of the current roadmap direction.

Implemented foundation includes:

- custom OIDC auth parameters
- nonce generation and validation
- RP-initiated logout
- UserInfo fetch
- discovery metadata view
- per-app SAML signing
- NameID format
- ForceAuthn / IsPassive
- `AuthRun` persistence
- compact enterprise SaaS UI refresh baseline

## Phase 2: Token Lifecycle

### Scope

- refresh token support
- token introspection
- token revocation
- client credentials grant
- PKCE mode toggle
- token expiry timeline

### Why Phase 2 Next

This phase completes the OIDC operational story. After Phase 1, the biggest remaining value gap is not login initiation. It is token lifecycle verification.

This phase is the best next investment because it serves:

- API testing
- renewal behavior
- provider policy validation
- resource server troubleshooting

### Recommended Order Inside Phase 2

1. Refresh token support
2. Introspection
3. Revocation
4. Client Credentials
5. PKCE toggle
6. Token timeline

### Phase 2 Status

Phase 2 is now implemented on top of the Phase 1 workbench foundation.

Implemented foundation includes:

- refresh token support with rotation-aware lifecycle storage
- token introspection
- token revocation
- client credentials grant
- PKCE modes: `S256`, `PLAIN`, and `NONE`
- lifecycle event history
- token timeline UI
- explicit `acr` / `amr` diagnostics
- JWT signature validation display
- `at_hash` and `c_hash` validation display

## Phase 3: Enterprise SAML

Status: Implemented on `beta`

### Scope

- encrypted assertions
- SAML SLO
- AuthnContextClassRef requests
- signature algorithm selection
- structured SAML assertion viewer
- clock skew tolerance

### Why Phase 3 After Phase 2

This phase is high value but more operationally complex. It requires stronger cryptographic handling, deeper XML diagnostics, and more involved protocol UX. Once the OIDC lifecycle story is complete, this becomes the next logical maturity step.

### Phase 3 Outcome

Phase 3 is now the SAML baseline on `beta`: structured assertion diagnostics, encrypted assertions, SAML SLO, requested `AuthnContextClassRef`, signature algorithm selection, and clock skew tolerance are all implemented. That closes the core enterprise SAML gap that remained after Phases 1 and 2.

## Phase 4: Advanced Flows

### Scope

- back-channel logout
- device authorization grant
- token exchange
- SCIM mock endpoints
- full trace logging
- claims diff
- PAR

### Why Phase 4 Last

These features are valuable but are either:

- more specialized
- broader in surface area
- or dependent on foundations from earlier phases

This phase should be treated as the advanced capability layer after the core browser and token lifecycle workflows are solid.

## What Still Remains After Phase 2

The major remaining roadmap work is:

- encrypted SAML assertions
- SAML SLO
- AuthnContextClassRef
- signature algorithm selection
- structured SAML viewer
- clock skew tolerance
- back-channel logout
- device authorization
- token exchange
- SCIM mock
- full trace logging
- claims diff
- PAR

Additional gaps still outside the implemented Phase 1 and Phase 2 baseline:

- front-channel logout
- session management iframe support
- artifact binding
- SAML Conditions / AudienceRestriction diagnostics
- certificate expiry checker
- compliance summary reporting

### Deferred OIDC Session Items

The following OIDC items are intentionally deferred for a later dedicated session/logout phase rather than being folded into Phase 2:

- front-channel logout
- session management iframe support

Reasoning:

- they expand browser coordination and session state complexity rather than token analysis depth
- they do not materially block the current OIDC inspector and lifecycle workbench goals
- they fit better beside back-channel logout and other logout/session propagation work than beside token validation

## Recommended Next Step

The cleanest next implementation target is Phase 3.

If narrowed further, the highest-value immediate bundle is:

1. encrypted SAML assertions
2. SAML SLO
3. AuthnContextClassRef requests
4. structured SAML assertion viewer

Reasoning:

- it addresses the largest remaining enterprise fidelity gap in the product
- it unlocks common Entra ID, PingFederate, and Okta enterprise-app SAML scenarios
- it builds naturally on the per-app signing and compact inspector foundation already in place
- it keeps roadmap sequencing coherent by finishing the next protocol depth layer rather than reopening solved OIDC lifecycle work

## Product Positioning Outcome

If the full roadmap is executed, AuthLab moves from:

- basic protocol demo and login inspection

to:

- enterprise-grade identity integration workbench

The biggest differentiators will be:

- flexible OIDC request shaping
- deep token lifecycle tools
- realistic enterprise SAML controls
- strong inspection and trace tooling
- eventual SCIM plus SSO testing in one place

That combination is what makes the roadmap strategically worthwhile.
