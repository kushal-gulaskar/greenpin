# Import existing browser records

1. Use the browser profile, URL and port where the trees were registered. Sign in to the intended cloud account.
2. Open **My profile → Import local records**. Review the account UUID and local counts. Choose **Export backup with photographs** to download a JSON snapshot of trees, journal records and original photo bytes. Store it privately; it includes precise locations.
3. Confirm the destination and select **Import and verify**. The importer uses original tree and journal UUIDs, original creation times and observation dates. Cloud records are attributed to the importing account. Growth entries retain their associated health record IDs. Local files are compressed for the cloud. The backup preserves originals.
4. Review the progress and summary. Verification rereads cloud records and downloads photographs. Already-present verified records are counted as skipped. Failed records are listed by ID. Connectivity failures can be retried from the same account and browser.
5. Resolve historical adoption requests and assignments manually with the actual account holders. Entries on sample trees have no imported parent. Both cases appear in the attention list and remain in the backup. Review identity or UUID conflicts before taking action.

Import reads IndexedDB and leaves it intact after success or failure. It never creates Auth users. Registration stages files at deterministic paths; retry the same registration with its original photograph. A registration UUID is retained in session storage for the current tab and account until success. After an interrupted registration, return to the form and re-enter its details. Uncommitted objects are private and can be reviewed by an operator.
