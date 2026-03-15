'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.user) {
          // Auto-create row in public.users
          await supabase.from('users').insert({
            id: data.user.id,
            email: data.user.email,
          });
          setMessage('Account created! Check your email to confirm, then sign in.');
          setMode('signin');
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D1117]">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Dev<span className="text-[#F0A500]">Priority</span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Your AI-powered developer co-pilot
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                className="w-full px-3 py-2 bg-[#21262D] border border-[#30363D] rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#F0A500] focus:ring-1 focus:ring-[#F0A500] transition"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-[#21262D] border border-[#30363D] rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#F0A500] focus:ring-1 focus:ring-[#F0A500] transition"
              />
            </div>

            {error && (
              <p className="text-sm text-[#F85149] bg-[#F85149]/10 border border-[#F85149]/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {message && (
              <p className="text-sm text-[#2EA043] bg-[#2EA043]/10 border border-[#2EA043]/20 rounded-lg px-3 py-2">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#F0A500] hover:bg-[#FFB800] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-lg transition"
            >
              {loading
                ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 text-center text-sm text-gray-500">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
                  className="text-[#F0A500] hover:text-[#FFB800] font-medium transition"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
                  className="text-[#F0A500] hover:text-[#FFB800] font-medium transition"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
