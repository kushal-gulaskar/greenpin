import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { auth, client, cloud, mobile, profile, type Profile } from "./cloud";
import { brand } from "./data";

export const Account = createContext<{
  uid: string;
  person: Profile | null;
  update: (p: Profile) => Promise<void>;
}>({ uid: "local-demo-caretaker", person: null, update: async () => {} });
function GatePanel({ children }: { children: ReactNode }) {
  return (
    <main style={{ margin: "6vh auto", maxWidth: 540, padding: 16 }}>
      <section className="panel form">
        <small>{brand}</small>
        {children}
      </section>
    </main>
  );
}
function Login() {
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [verify, setVerify] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [left, setLeft] = useState(0);
  useEffect(() => {
    if (!left) return;
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  async function run(send: boolean) {
    setBusy(true);
    setError("");
    try {
      if (send) {
        await auth.request(phone);
        setVerify(true);
        setLeft(60);
        setCode("");
      } else await auth.verify(phone, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <GatePanel>
      <h1>{verify ? "Verify your number" : "Sign in"}</h1>
      <p>
        {verify
          ? "Enter the code for " + mobile(phone)
          : "Use your Indian mobile number to open your conservation workspace."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(!verify);
        }}
      >
        {verify ? (
          <label>
            One-time code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              required
              pattern="[0-9]{4,10}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        ) : (
          <label>
            Mobile number
            <input
              autoComplete="tel"
              type="tel"
              required
              placeholder="+91"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        )}
        <button className="primary" disabled={busy}>
          {verify ? "Verify code" : "Request code"}
        </button>
      </form>
      {verify && (
        <div className="choices">
          <button disabled={busy || left > 0} onClick={() => run(true)}>
            Resend {left ? "in " + left + "s" : "code"}
          </button>
          <button disabled={busy} onClick={() => setVerify(false)}>
            Change number
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </GatePanel>
  );
}
function SessionAccount({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  const [person, setPerson] = useState<Profile | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    profile(uid)
      .then((p) => {
        if (live) setPerson(p);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [uid, attempt]);
  if (!person)
    return (
      <GatePanel>
        {failed ? (
          <>
            <p role="alert">
              Your profile could not be loaded. Check the cloud connection and
              database configuration.
            </p>
            <button onClick={() => setAttempt(attempt + 1)}>Retry</button>
            <Logout />
          </>
        ) : (
          <p>Loading profile…</p>
        )}
      </GatePanel>
    );
  return (
    <Account.Provider
      value={{
        uid,
        person,
        update: async (p) => setPerson(await profile(uid, p)),
      }}
    >
      {children}
    </Account.Provider>
  );
}
export function AuthGate({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null | undefined>();
  useEffect(() => {
    if (!client) return;
    let expiry: ReturnType<typeof setTimeout>;
    const { data } = client.auth.onAuthStateChange((_event, s) => {
      clearTimeout(expiry);
      const remaining = (s?.expires_at ?? 0) * 1000 - Date.now();
      setUid(s && remaining > 0 ? s.user.id : null);
      if (s && remaining > 0)
        expiry = setTimeout(() => setUid(null), remaining);
    });
    return () => {
      clearTimeout(expiry);
      data.subscription.unsubscribe();
    };
  }, []);
  if (!cloud) return children;
  if (!client)
    return (
      <GatePanel>
        <h1>Connect your workspace</h1>
        <p role="alert">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local
          and restart Vite.
        </p>
      </GatePanel>
    );
  if (uid === undefined) return <GatePanel>Checking session…</GatePanel>;
  return uid ? (
    <SessionAccount key={uid} uid={uid}>
      {children}
    </SessionAccount>
  ) : (
    <Login />
  );
}
function Logout() {
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="outline"
        onClick={() => {
          if (confirm("Sign out of this browser?"))
            auth.logout().catch(() => setError("Sign-out failed. Retry."));
        }}
      >
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function AccountForm() {
  const { person, update } = useContext(Account),
    [msg, setMsg] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await update(Object.fromEntries(data) as unknown as Profile);
      setMsg("Profile saved.");
    } catch {
      setMsg("Profile update failed. Retry.");
    }
  }
  return (
    <section className="panel form">
      <form onSubmit={submit}>
        {Object.entries({
          display_name: "Display name",
          city: "City",
          state: "State",
          preferred_language: "Preferred language",
        }).map(([k, v]) => (
          <label key={k}>
            {v}
            <input
              required={k === "display_name"}
              maxLength={100}
              name={k}
              defaultValue={person?.[k as keyof Profile]}
            />
          </label>
        ))}
        <button className="primary">Save profile</button>
      </form>
      <p role="status">{msg}</p>
      <Logout />
    </section>
  );
}
