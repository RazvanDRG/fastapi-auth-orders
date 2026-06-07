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

  const isValid =
    checks.minLength &&
    checks.maxLength &&
    checks.uppercase &&
    checks.special;

  if (!password) {
    return {
      label: "Enter a password",
      tone: "text-slate-400",
      barClass: "bg-slate-700",
      widthClass: "w-0",
    };
  }

  if (!isValid) {
    return {
      label: "Invalid",
      tone: "text-rose-300",
      barClass: "bg-rose-400",
      widthClass: "w-1/2",
    };
  }

  return {
    label: "Valid",
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const passwordChecks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const NAME_REGEX = /^[A-Za-z]+$/;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const isFirstNameValid = NAME_REGEX.test(firstName.trim());
  const isLastNameValid = NAME_REGEX.test(lastName.trim());
  const isPasswordValid = PASSWORD_REGEX.test(password);

  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const isFormValid =
    isFirstNameValid &&
    isLastNameValid &&
    EMAIL_REGEX.test(email.trim().toLowerCase()) &&
    isPasswordValid &&
    doPasswordsMatch;

  function ruleClass(valid: boolean) {
    return valid ? "text-emerald-300" : "text-slate-500";
  }

  function handlePasswordKeyEvent(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(e.getModifierState("CapsLock"));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    if (!cleanEmail) {
      setFormError("Email is required.");
      return;
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      setFormError("Please enter a valid email address.");
      return;
    }

    if (!cleanFirstName) {
      setFormError("First name is required.");
      return;
    }

    if (!NAME_REGEX.test(cleanFirstName)) {
      setFormError("First name must contain only A-Z and a-z letters.");
      return;
    }

    if (!cleanLastName) {
      setFormError("Last name is required.");
      return;
    }

    if (!NAME_REGEX.test(cleanLastName)) {
      setFormError("Last name must contain only A-Z and a-z letters.");
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      setFormError(
        "Password must be 8–64 characters, include at least one uppercase letter and one special character."
      );
      return;
    }

    if (!confirmPassword) {
      setFormError("Confirm password is required.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      await register({
        email: cleanEmail,
        password,
        confirm_password: confirmPassword,
        first_name: cleanFirstName,
        last_name: cleanLastName,
      });
      
      toast.success("Account created successfully.");

      setTimeout(() => {
        navigate("/login");
      }, 1000);

      } catch (err: unknown) {
        const message = getErrorMessage(
          err,
          "Could not create account."
        );

        setFormError(message);
        toast.error(message);
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
                        onChange={(e) => setFirstName(e.target.value.replace(/[^A-Za-z]/g, ""))}
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
                        onChange={(e) => setLastName(e.target.value.replace(/[^A-Za-z]/g, ""))}
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
                      inputMode="email"
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
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 pr-20 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-medium text-slate-200">
                        Confirm password
                      </label>

                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm your password"
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 pr-20 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                        />

                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((value) => !value)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
                        >
                          {showConfirmPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    {capsLockOn && (
                      <p className="mt-2 text-xs text-amber-300">
                        Caps Lock is on.
                      </p>
                    )}

                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-400">
                          Password requirements
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