import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/error";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState(() => {
    return localStorage.getItem("last_login_email") || "";
  });

  const [savedEmails, setSavedEmails] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("login_email_history") || "[]");
    } catch {
      return [];
    }
  });

  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const emailSuggestions = savedEmails.filter((savedEmail) => {
    const query = email.trim().toLowerCase();

    if (!query) return true;

    return savedEmail.toLowerCase().includes(query);
  });

  function handlePasswordKeyEvent(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(e.getModifierState("CapsLock"));
  }

  function saveEmailToHistory(normalizedEmail: string) {
    const nextEmailHistory = [
      normalizedEmail,
      ...savedEmails.filter((savedEmail) => savedEmail !== normalizedEmail),
    ].slice(0, 5);

    localStorage.setItem("last_login_email", normalizedEmail);
    localStorage.setItem("login_email_history", JSON.stringify(nextEmailHistory));
    setSavedEmails(nextEmailHistory);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setFormError("Email is required.");
      return;
    }

    if (!password.trim()) {
      setFormError("Password is required.");
      return;
    }

    try {
      setLoading(true);

      await login({
        email: normalizedEmail,
        password,
      });

      saveEmailToHistory(normalizedEmail);

      navigate("/dashboard", {
        state: { loginSuccess: true },
        replace: true,
      });
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err, "Login failed. Please check your credentials.")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen px-4 py-10 text-white relative"
      style={{
        backgroundImage: `url('https://scalarspaces.com/wp-content/uploads/2025/11/74010.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-[#020617]/80" />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
          <div className="grid w-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900/90 shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="hidden border-r border-slate-800 bg-slate-950/60 p-10 lg:flex lg:flex-col lg:justify-between">
              <div>
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400 text-xl font-bold text-slate-950">
                  wo
                </div>

                <h1 className="text-4xl font-bold tracking-tight text-white">
                  Warehouse Ops
                </h1>

                <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                  Technical demo frontend for authentication, warehouse order flows,
                  role-based access, and operational endpoints.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">Included flows</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Login, forgot/reset password, order lifecycle, integrations,
                    admin actions, and metrics visibility.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">Interview angle</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Honest UI over the real API contract, without fake list screens
                    where the backend does not expose them.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-10">
              <div className="mx-auto max-w-md">
                <div className="mb-8">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
                    Warehouse Ops Console
                  </p>

                  <h2 className="mt-3 text-3xl font-bold text-white">Sign in</h2>

                  <p className="mt-2 text-sm text-slate-400">
                    Log in with an existing account and continue the order workflow.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Email
                    </label>

                    <div className="relative">
                      <input
                        type="email"
                        autoFocus
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setShowEmailSuggestions(true);
                        }}
                        onFocus={() => setShowEmailSuggestions(true)}
                        onBlur={() => {
                          setTimeout(() => setShowEmailSuggestions(false), 150);
                        }}
                        placeholder="admin@gmail.com"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                      />

                      {showEmailSuggestions && emailSuggestions.length > 0 && (
                        <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 shadow-xl shadow-black/30">
                          {emailSuggestions.map((savedEmail) => (
                            <button
                              key={savedEmail}
                              type="button"
                              onMouseDown={() => {
                                setEmail(savedEmail);
                                setShowEmailSuggestions(false);
                              }}
                              className="block w-full px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-slate-800 hover:text-cyan-300"
                            >
                              {savedEmail}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Password
                    </label>

                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={handlePasswordKeyEvent}
                        onKeyDown={handlePasswordKeyEvent}
                        placeholder="********"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 pr-24 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>

                    {capsLockOn && (
                      <p className="mt-2 text-xs text-amber-300">
                        Caps Lock is on.
                      </p>
                    )}
                  </div>

                  {formError && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                      {formError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                        Signing in...
                      </span>
                    ) : (
                      "Sign in"
                    )}
                  </button>
                </form>

                <div className="mt-6 flex flex-col gap-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <Link to="/register" className="transition hover:text-cyan-300">
                    Create account
                  </Link>

                  <Link to="/forgot-password" className="transition hover:text-cyan-300">
                    Forgot password?
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}