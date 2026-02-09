## Appendix C: Open Decisions

These items need resolution during implementation:

1. **Config hot-reload.** Should `orgloop apply` on a running daemon cause a hot-reload of config, or require a restart? Recommendation: restart for MVP, hot-reload for v1.1.

2. **Event ID generation.** `evt_` prefix + what? UUID v7 (time-sortable) is the recommendation. Provides natural ordering and uniqueness without coordination.

3. **Transform timeout handling.** What happens when a script transform hangs? Recommendation: configurable timeout (default 30s), kill with SIGTERM then SIGKILL, treat as transform error (fail-open).

4. **Connector authentication.** How do connectors authenticate to source APIs? Recommendation: environment variables referenced in config (`token_env: GITHUB_TOKEN`). No secrets in YAML files.

5. **Multi-route matching.** Can one event match multiple routes? Recommendation: yes. An event flows through all matching routes independently. This enables fan-out (one GitHub event → engineering agent AND audit logger).

6. **Process management.** Should OrgLoop manage itself as a system service? Recommendation: provide a `orgloop service install` command that generates a launchd plist (macOS) or systemd unit (Linux), but don't require it. Users can run it however they want.

---

*🧬 This specification is a living document. It will be updated as implementation reveals new considerations and as the community provides feedback.*
