import { useContext, useEffect, useState } from "react";
import { Account } from "./Account";
import { repository, type Tree } from "./data";
import { journal, type Entry } from "./journal";
import { register, writeEntry, loadCloud, equalBytes, jpeg } from "./cloud";

async function snapshot() {
  const [trees, rows] = await Promise.all([repository.list(), journal.list()]);
  return { trees, rows };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
async function backup(data: Snapshot) {
  async function pack(record: Tree | Entry) {
    if (!("photo" in record) || !(record.photo instanceof Blob)) return record;
    const photo = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(record.photo as Blob);
    });
    return { ...record, photo };
  }
  const payload = {
    version: 2,
    trees: await Promise.all(data.trees.map(pack)),
    journal: await Promise.all(data.rows.map(pack)),
  };
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "greenpin-local-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function verifiedPhoto(
  source: Blob | string | undefined,
  cloudPhoto: Blob | string | undefined,
) {
  if (!source) return !cloudPhoto;
  return (
    source instanceof Blob &&
    cloudPhoto instanceof Blob &&
    (await equalBytes(await jpeg(source), cloudPhoto))
  );
}
function sameObservation(a: Entry, b: Entry) {
  if (a.kind === "growth" && b.kind === "growth")
    return (
      a.height === b.height &&
      a.circumference === b.circumference &&
      a.day === b.day &&
      a.leaves === b.leaves &&
      a.health === b.health &&
      a.notes === b.notes
    );
  if (a.kind === "maintenance" && b.kind === "maintenance")
    return (
      a.activity === b.activity &&
      Date.parse(a.when) === Date.parse(b.when) &&
      a.notes === b.notes
    );
  return (
    a.kind === "health" &&
    b.kind === "health" &&
    a.health === b.health &&
    a.day === b.day &&
    a.notes === b.notes
  );
}
export function ImportLocal({ refresh }: { refresh: () => Promise<void> }) {
  const { uid, person } = useContext(Account),
    [data, setData] = useState<Snapshot>(),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [report, setReport] = useState<string[]>([]);
  useEffect(() => {
    snapshot()
      .then(setData)
      .catch(() => setMsg("Cannot read browser records."));
  }, []);
  async function migrate() {
    if (!confirm || !data || busy) return;
    setBusy(true);
    setReport([]);
    const issues: string[] = [],
      eligible = new Set<string>(),
      done = new Set<string>();
    let skipped = 0,
      trees = 0,
      photos = 0,
      growth = 0,
      maintenance = 0,
      step = 0;
    const progress = () =>
      setMsg(
        "Processing " +
          ++step +
          " of " +
          (data!.trees.length + data!.rows.length),
      );
    try {
      const before = await loadCloud(uid);
      for (const tree of data.trees) {
        progress();
        try {
          const prior = before.trees.find((t) => t.id === tree.id);
          if (
            prior &&
            (prior.owner !== uid ||
              prior.name !== tree.name ||
              Date.parse(prior.created) !== Date.parse(tree.created))
          )
            throw Error();
          if (!prior) await register(uid, tree);
          eligible.add(tree.id);
        } catch {
          issues.push(tree.id + " · tree needs review");
        }
      }
      for (const entry of data.rows) {
        progress();
        if (
          !eligible.has(entry.treeId) ||
          entry.kind === "assignment" ||
          entry.kind === "request"
        ) {
          issues.push(
            entry.id + " · resolve tree or demo caretaker identity manually",
          );
          continue;
        }
        if (
          entry.kind === "health" &&
          entry.growthId &&
          data.rows.some((r) => r.id === entry.growthId && r.kind === "growth")
        )
          continue;
        try {
          const prior = before.rows.find((r) => r.id === entry.id);
          if (
            prior &&
            (prior.treeId !== entry.treeId ||
              prior.kind !== entry.kind ||
              prior.userId !== uid ||
              Date.parse(prior.created) !== Date.parse(entry.created))
          )
            throw Error();
          const paired = data.rows.find(
            (r) => r.kind === "health" && r.growthId === entry.id,
          );
          if (!prior)
            await writeEntry(
              uid,
              entry.treeId,
              entry,
              entry.id,
              entry.created,
              paired?.id,
            );
          done.add(entry.id);
        } catch {
          issues.push(entry.id + " · observation needs review");
        }
      }
      setMsg("Verifying saved records and downloading private photographs…");
      const after = await loadCloud(uid);
      for (const t of data.trees.filter((t) => eligible.has(t.id))) {
        const v = after.trees.find((r) => r.id === t.id);
        if (
          !v ||
          v.owner !== uid ||
          Date.parse(v.created) !== Date.parse(t.created) ||
          v.lat !== t.lat ||
          v.lng !== t.lng ||
          v.name !== t.name ||
          t.location !== v.location ||
          t.species !== v.species ||
          !(await verifiedPhoto(t.photo, v.photo))
        ) {
          issues.push(t.id + " · verification failed");
          continue;
        }
        if (before.trees.some((r) => r.id === t.id)) {
          skipped++;
          continue;
        }
        trees++;
        photos++;
      }
      for (const e of data.rows.filter((e) => done.has(e.id))) {
        const v = after.rows.find((r) => r.id === e.id);
        if (
          !v ||
          v.treeId !== e.treeId ||
          Date.parse(v.created) !== Date.parse(e.created) ||
          !sameObservation(e, v) ||
          ("photo" in e &&
            !(await verifiedPhoto(e.photo, "photo" in v ? v.photo : undefined)))
        ) {
          issues.push(e.id + " · verification failed");
          continue;
        }
        if (before.rows.some((r) => r.id === e.id)) {
          skipped++;
          continue;
        }
        if (e.kind === "growth") growth++;
        if (e.kind === "maintenance") maintenance++;
        if ("photo" in e && e.photo) photos++;
      }
      for (const h of data.rows) {
        if (
          h.kind === "health" &&
          h.growthId &&
          done.has(h.growthId) &&
          !after.rows.some(
            (v) =>
              v.id === h.id &&
              v.kind === "health" &&
              v.growthId === h.growthId &&
              sameObservation(h, v),
          )
        )
          issues.push(h.id + " · linked health observation requires review");
      }
      await refresh();
      setMsg(
        "Verified import · Trees " +
          trees +
          " · Photos " +
          photos +
          " · Growth " +
          growth +
          " · Maintenance " +
          maintenance +
          " · Skipped " +
          skipped +
          " · Require attention " +
          issues.length,
      );
    } catch {
      setMsg(
        "Import interrupted. Your browser records are intact. Retry to verify and resume.",
      );
    } finally {
      setReport(issues);
      setBusy(false);
      setConfirm(false);
    }
  }
  return (
    <section className="panel form">
      <h1>Import browser records</h1>
      <p>
        Copy local trees and observations into {person?.display_name} ({uid}).
        You will be recorded as their importer. Demo caretakers and sample-tree
        activity require manual review. Originals stay in this browser.
      </p>
      {data && (
        <>
          <p>
            {data.trees.length} local trees · {data.rows.length} journal entries
          </p>
          <button
            className="outline"
            onClick={() =>
              backup(data).catch(() => setMsg("Backup failed. Retry."))
            }
          >
            Export backup with photographs
          </button>
          <label>
            <input
              style={{ width: "auto" }}
              type="checkbox"
              checked={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            I confirm these records belong in this account.
          </label>
          <button
            className="primary"
            disabled={!confirm || busy}
            onClick={migrate}
          >
            Import and verify
          </button>
        </>
      )}
      <p role="status">{msg}</p>
      {report.length > 0 && (
        <ul>
          {report.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
