import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/error";

const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,64}$/;

function getPasswordChecks(password: string) {
  return {
    minLength: password.length >= 8,
    maxLength: password.length <= 64,
    uppercase: /[A-Z]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
}

function getPasswordStrength(password: string) {
  const checks = getPasswordChecks(password);
  const passed = Object.values(checks).filter(Boolean).length;

  if (!password) {
    return {
      label: "Enter a password",
      tone: "text-slate-400",
      barClass: "bg-slate-700",
      widthClass: "w-0",
    };
  }

  if (passed <= 2) {
    return {
      label: "Weak",
      tone: "text-rose-300",
      barClass: "bg-rose-400",
      widthClass: "w-1/3",
    };
  }

  if (passed === 3) {
    return {
      label: "Medium",
      tone: "text-amber-300",
      barClass: "bg-amber-400",
      widthClass: "w-2/3",
    };
  }

  return {
    label: "Strong",
    tone: "text-emerald-300",
    barClass: "bg-emerald-400",
    widthClass: "w-full",
  };
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const passwordChecks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  function ruleClass(valid: boolean) {
    return valid ? "text-emerald-300" : "text-slate-500";
  }

  function handlePasswordKeyEvent(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(e.getModifierState("CapsLock"));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    if (!email.trim()) {
      setFormError("Email is required.");
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      setFormError(
        "Password must be 8–64 characters, include at least one uppercase letter and one special character."
      );
      return;
    }

    if (!firstName.trim()) {
      setFormError("First name is required.");
      return;
    }

    if (!lastName.trim()) {
      setFormError("Last name is required.");
      return;
    }

    try {
      setLoading(true);

      await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });

      toast.success("Account created successfully.");
      setTimeout(() => navigate("/login"), 1000);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err, "Registration failed. Please verify the input and try again.")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.10),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#020b1f_100%)] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden border-r border-slate-800 bg-slate-950/60 p-10 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400 text-xl font-bold text-slate-950">
                wo
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Create your access
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                Register a new account to access authentication flows, warehouse
                order operations, and role-aware UI behavior.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm font-semibold text-white">Registration flow</p>
                <p className="mt-2 text-sm text-slate-400">
                  Account creation is intentionally simple and aligned with the real
                  backend contract.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm font-semibold text-white">Password policy</p>
                <p className="mt-2 text-sm text-slate-400">
                  8 to 64 characters, one uppercase letter, and one special character.
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
                <h2 className="mt-3 text-3xl font-bold text-white">Create account</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Register a new user for the system.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      First name
                    </label>
                    <input
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Last name
                    </label>
                    <input
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Email
                  </label>
                  <input
                    type="email"
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Password
                  </label>

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={handlePasswordKeyEvent}
                      onKeyDown={handlePasswordKeyEvent}
                      placeholder="Min 8 chars, 1 uppercase, 1 special char"
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

                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">
                        Password strength
                      </span>
                      <span className={`text-xs font-semibold ${passwordStrength.tone}`}>
                        {passwordStrength.label}
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${passwordStrength.barClass} ${passwordStrength.widthClass}`}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className={`text-xs ${ruleClass(passwordChecks.minLength)}`}>
                      {passwordChecks.minLength ? "✓" : "•"} At least 8 characters
                    </div>
                    <div className={`text-xs ${ruleClass(passwordChecks.maxLength)}`}>
                      {passwordChecks.maxLength ? "✓" : "•"} Maximum 64 characters
                    </div>
                    <div className={`text-xs ${ruleClass(passwordChecks.uppercase)}`}>
                      {passwordChecks.uppercase ? "✓" : "•"} At least 1 uppercase letter
                    </div>
                    <div className={`text-xs ${ruleClass(passwordChecks.special)}`}>
                      {passwordChecks.special ? "✓" : "•"} At least 1 special character
                    </div>
                  </div>
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
                      Creating account...
                    </span>
                  ) : (
                    "Create account"
                  )}
                </button>
              </form>

              <div className="mt-6 flex flex-col gap-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <Link to="/login" className="transition hover:text-cyan-300">
                  Back to sign in
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