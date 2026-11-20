# Authorization and storage

| Resource | Read | Write |
| --- | --- | --- |
| Profile | Authenticated account itself | Create own ID and update permitted profile fields |
| Species | Signed-in accounts | Database administrator via trusted migration |
| Tree and private coordinates | Registrant or active caretaker | Register through the transaction function. Registrant may update name, location description and notes. |
| Growth, health and maintenance | Registrant or active caretaker | Append through gp_observe. Actor comes from auth.uid(). |
| Adoption request | Requester and registrant | Requester requests using a shared ID or withdraws. Registrant approves/rejects another user's request. |
| Assignment | Authorized tree users and the assigned user | Approval creates an assignment. Registrant or assigned user may release it. |
| Audit | Administrative inspection | Database triggers only |
| Private images | Authorized tree users; uploaders can retrieve their own staged files | Authenticated staging; metadata linked only after tree authorization |

All exposed application tables have RLS. Column grants constrain profile and tree edits. Privileged mutation functions derive actor identity from the JWT, set a fixed search path, check resource relationships, and have explicit execute grants. The coordinate view uses security_invoker. The location visibility model in this sprint is private. No public coordinate endpoint is enabled. Caretaking is a responsibility distinct from legal ownership.

The private bucket enforces a MIME allowlist and byte limit. The browser decodes and re-encodes selected photos as JPEG, downsizes their longest edge to 1,920 pixels, and uploads to uploader UUID/tree UUID/object UUID.jpg. The app downloads through authenticated Storage requests. Released caretakers lose access to committed images. A browser may retain bytes already received. Ordinary users have no overwrite or delete policy. For abandoned staged uploads, an operator should confirm the path is absent from tree_photos and no retry is pending before removing it through the Storage API. [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
