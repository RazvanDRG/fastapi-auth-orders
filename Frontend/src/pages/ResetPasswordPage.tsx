import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,64}$/;

const CODE_REGEX = /^\d{6}$/;

function getErrorMessage(err: any): string {
  const detail = err?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.msg) return item.msg;
        return JSON.stringify(item);
      })
      .join(", ");
  }

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  return "Failed to reset password. Please verify the code and try again.";
}

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

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const passwordChecks = useMemo(
    () => getPasswordChecks(newPassword),
    [newPassword]
  );

  const passwordStrength = useMemo(
    () => getPasswordStrength(newPassword),
    [newPassword]
  );

  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;

  const isDisabled =
    loading ||
    !email.trim() ||
    !CODE_REGEX.test(code) ||
    !PASSWORD_REGEX.test(newPassword) ||
    newPassword !== confirmPassword;

  function ruleClass(valid: boolean) {
    return valid ? "text-emerald-300" : "text-slate-500";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!CODE_REGEX.test(code)) {
      setError("Reset code must be 6 digits.");
      return;
    }

    if (!PASSWORD_REGEX.test(newPassword)) {
      setError(
        "Password must be 8–64 characters, include at least one uppercase letter and one special character."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await resetPassword({
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setSuccess(response?.message || "Password reset successfully.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err: any) {
      setError(getErrorMessage(err));
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
                Set a new password
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                Use the reset code from your email and choose a stronger password
                for your account.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm font-semibold text-white">Required data</p>
                <p className="mt-2 text-sm text-slate-400">
                  Email, reset code, new password, and confirmation.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm font-semibold text-white">Password policy</p>
                <p className="mt-2 text-sm text-slate-400">
                  8 to 64 characters, one uppercase letter, and one special
                  character.
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
                <h2 className="mt-3 text-3xl font-bold text-white">
                  Reset password
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Enter your email, reset code, and new password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Account email
                  </label>
                  <input
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    placeholder="name@example.com"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Reset code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="Enter the 6-digit code"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Enter the 6-digit code sent to your email.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    New password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 special char"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />

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

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat the new password"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />

                  {confirmPassword && (
                    <p
                      className={`mt-2 text-xs ${
                        passwordsMatch ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {passwordsMatch ? "✓ Passwords match" : "Passwords do not match"}
                    </p>
                  )}
                </div>

                {error && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isDisabled}
                  className="w-full rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Resetting password..." : "Reset password"}
                </button>
              </form>

              <div className="mt-6 flex flex-col gap-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <Link to="/login" className="transition hover:text-cyan-300">
                  Back to sign in
                </Link>

                <Link
                  to="/forgot-password"
                  className="transition hover:text-cyan-300"
                >
                  Request a new code
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}