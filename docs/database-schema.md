# Architecture and schema

Before Sprint 3, React Router rendered six screens. The root React component loaded arrays into state; JournalContext provided mutations to the field book. IndexedDB database nature-ecosystem v2 held a trees store (UUID key with a photograph Blob) and a journal store (UUID key, treeId index). The discriminated journal represented adoption requests, assignments, growth, maintenance and health observations. Growth and its linked health observation were written atomically. Four illustrative trees lived in code. The local-demo-caretaker string represented the development identity. Playwright covered registration, GPS denial, version 1 upgrades and field-book operations.

The implementation preserves those repositories for development and migration, adds a session gate, and selects cloud data explicitly. Cloud SDK calls live in src/cloud.ts. React maps the normalized rows back into the existing tree and journal models. Cloud data loads in pages and private photos are downloaded with the session token. The current workspace loads the accessible collection and its images into memory; a large deployment should paginate the UI and load photographs on demand.

| Tables | Relationship and purpose |
| --- | --- |
| profiles | One private application profile per auth.users UUID |
| species | Shared, authenticated read-only seed catalog with unverified illustrative names |
| trees | Registrant and species foreign keys. The generated public_tree_id equals the permanent internal UUID. Sharing the ID enables a request for caretaking. |
| tree_locations | One private PostGIS geography(Point,4326) per tree; X is longitude, Y is latitude, in degrees. GiST spatial index. |
| tree_photos | Tree and uploader references, unique private object path and capture time |
| adoption_requests, tree_caretakers | Requests have a reviewer-controlled state transition. Assignment rows retain ended_at. A partial unique index permits one active primary caretaker. |
| tree_growth_records | Timestamped height, circumference, leaves, health and optional photograph reference |
| tree_maintenance | Dated activity, actor, notes and optional photograph reference |
| tree_health_observations | Independent or growth-linked observations. Current health follows the latest dated observation at or after registration. |
| audit_events | Server-triggered actor, action, entity and database timestamp on application writes |

gp_register links tree, location and photo metadata in one transaction after staging the object. gp_observe links measurements and health observations in one transaction. gp_care serializes decisions for a tree. IDs and history are immutable to ordinary clients. Metadata updates touch updated_at. Client-supplied historical timestamps are distinct from the audit timestamp.
