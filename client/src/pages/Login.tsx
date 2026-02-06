import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff } from "lucide-react";

interface LoginProps {
  onAuthenticated: () => void;
}

export default function Login({ onAuthenticated }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });

      if (res.ok) {
        sessionStorage.setItem("ba_authenticated", "true");
        onAuthenticated();
      } else {
        const data = await res.json();
        setError(data.error || "Incorrect password. Please try again.");
        setIsLoading(false);
      }
    } catch {
      setError("Connection error. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #040822 0%, #001278 50%, #02a2fa 100%)" }}>
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10">
          <div className="flex flex-col items-center mb-8">
            <img
              src="/assets/logos/blueally-logo-blue.svg"
              alt="BlueAlly"
              className="h-12 mb-3"
              data-testid="img-login-logo"
            />
            <div className="text-sm font-semibold tracking-widest text-[#001278] uppercase">AI Platform</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter password"
                  className="pl-10 pr-10 h-11"
                  autoFocus
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md" data-testid="text-login-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold"
              style={{ background: "linear-gradient(135deg, #001278 0%, #02a2fa 100%)" }}
              disabled={isLoading || !password}
              data-testid="button-login"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-8 pt-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              BlueAlly Insight | Enterprise AI Advisory
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
