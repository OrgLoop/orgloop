## Appendix A: Event Schema (JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://orgloop.dev/schemas/event/v1alpha1",
  "title": "OrgLoop Event",
  "type": "object",
  "required": ["id", "timestamp", "source", "type"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^evt_[a-zA-Z0-9]+$",
      "description": "Unique event identifier"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp (UTC)"
    },
    "source": {
      "type": "string",
      "description": "Source connector ID"
    },
    "type": {
      "type": "string",
      "enum": ["resource.changed", "actor.idle", "actor.complete", "actor.error", "message.received"],
      "description": "OaC event type"
    },
    "provenance": {
      "type": "object",
      "properties": {
        "platform": { "type": "string" },
        "platform_event": { "type": "string" },
        "author": { "type": "string" },
        "author_type": {
          "type": "string",
          "enum": ["team_member", "external", "bot", "system", "unknown"]
        }
      },
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "description": "Source-specific event data",
      "additionalProperties": true
    }
  }
}
```

