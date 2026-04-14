import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff } from "lucide-react";

const COOLDOWN_THRESHOLD = 5;
const COOLDOWN_WINDOW_MS = 60 * 1000;
const COOLDOWN_DURATION = 60;

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const failTimestampsRef = useRef<number[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const returnTo = new URLSearchParams(search).get("returnTo") || "/";
  const isCoolingDown = cooldownSeconds > 0;

  const startCooldown = useCallback(() => {
    setCooldownSeconds(COOLDOWN_DURATION);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          failTimestampsRef.current = [];
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const recordFailure = useCallback(() => {
    const now = Date.now();
    const windowStart = now - COOLDOWN_WINDOW_MS;
    failTimestampsRef.current = failTimestampsRef.current.filter((t) => t > windowStart);
    failTimestampsRef.current.push(now);

    if (failTimestampsRef.current.length >= COOLDOWN_THRESHOLD) {
      startCooldown();
    }
  }, [startCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading || isCoolingDown) return;

    setIsLoading(true);
    setError("");

    try {
      const result = await login(password);

      if (result.success) {
        setLocation(returnTo);
      } else {
        setError(result.message || "Invalid password");
        recordFailure();
        setPassword("");
        setIsLoading(false);
      }
    } catch {
      setError("Connection error. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #040822 0%, #001278 50%, #02a2fa 100%)" }}
      data-testid="login-page"
    >
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10">
          <div className="flex flex-col items-center mb-8">
            <img
              src="/assets/logos/blueally-logo-blue.svg"
              alt="BlueAlly"
              className="h-12 mb-3"
              data-testid="img-login-logo"
            />
            <div className="text-sm font-semibold tracking-widest text-[#001278] uppercase">
              AI Platform
            </div>
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
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter password"
                  className="pl-10 pr-10 h-11"
                  autoFocus
                  disabled={isCoolingDown}
                  data-testid="input-password"
                  autoComplete="current-password"
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

            {error && !isCoolingDown && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md" data-testid="text-login-error">
                {error}
              </div>
            )}

            {isCoolingDown && (
              <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md" data-testid="text-cooldown">
                Too many attempts. Please wait {cooldownSeconds} seconds.
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold"
              style={{ background: "linear-gradient(135deg, #001278 0%, #02a2fa 100%)" }}
              disabled={isLoading || !password.trim() || isCoolingDown}
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
