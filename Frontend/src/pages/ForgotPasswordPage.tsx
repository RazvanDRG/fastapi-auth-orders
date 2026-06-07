import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    if (!EMAIL_REGEX.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);

      const response = await forgotPassword({ email });

      toast.success(
        response?.message || "If the account exists, a reset code has been sent."
      );
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to send reset code. Please try again."));
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
                  Recover account access
                </h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                  Start the password reset flow by requesting a reset code for the account email.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">What happens next</p>
                  <p className="mt-2 text-sm text-slate-400">
                    The backend sends a six-digit reset code if the account exists.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">Security note</p>
                  <p className="mt-2 text-sm text-slate-400">
                    The flow avoids revealing too much about account existence.
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
                    Forgot password
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Enter your account email. If it exists, you’ll receive a reset code.
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
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.trim())}
                      placeholder="name@example.com"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      We’ll send a reset code if the account exists.
                    </p>
                  </div>

                  {formError && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                      {formError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !EMAIL_REGEX.test(email)}
                    className="w-full rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                        Sending reset code...
                      </span>
                    ) : (
                      "Send reset code"
                    )}
                  </button>
                </form>

                <div className="mt-6 flex flex-col gap-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <Link to="/login" className="transition hover:text-cyan-300">
                    Back to sign in
                  </Link>

                  <Link to="/reset-password" className="transition hover:text-cyan-300">
                    Already have the code?
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}