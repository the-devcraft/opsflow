import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, ShieldCheck, Check } from 'lucide-react';
import { client } from '../api';
import { Brand, ErrorNotice } from '../components/ui';

export function SignIn({ onDone }: { onDone: () => void }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const health = useQuery({ queryKey: ['health'], queryFn: client.health });
  const mutation = useMutation({
    mutationFn: () =>
      register ? client.register(name, email, password) : client.login(email, password),
    onSuccess: onDone,
  });
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">A LITTLE MORE ORDER.</span>
          <h1>
            Good operations
            <br />
            leave a clear trail.
          </h1>
          <p>One place for team requests, independent approvals, and the decisions behind them.</p>
          <div className="story-flow">
            <span>
              <ClipboardList />
              Request
            </span>
            <ArrowRight />
            <span>
              <ShieldCheck />
              Review
            </span>
            <ArrowRight />
            <span>
              <Check />
              Resolve
            </span>
          </div>
        </div>
        <footer>Built for teams that need clarity, not another spreadsheet.</footer>
      </section>
      <main className="auth-panel">
        <div className="auth-form">
          <span className="eyebrow">YOUR OPERATIONS WORKSPACE</span>
          <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
          <p className="muted">
            {register
              ? 'Start with an account. Create a workspace after signing in.'
              : 'Sign in to pick up where your team left off.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {register && (
              <label>
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={70}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                aria-label="Password"
                aria-describedby={register ? 'password-hint' : undefined}
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {register && <small id="password-hint">Use at least 12 characters.</small>}
            </label>
            {mutation.error && <ErrorNotice error={mutation.error} />}
            <button className="button primary full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button auth-switch"
            onClick={() => {
              setRegister(!register);
              mutation.reset();
            }}
          >
            {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
          {health.data?.demo && (
            <div className="demo-access">
              <span className="eyebrow">TRY A DEMO ACCOUNT</span>
              <div className="demo-personas">
                {[
                  ['Sam', 'Owner', 'sam'],
                  ['Jordan', 'Approver', 'jordan'],
                  ['Casey', 'Member', 'casey'],
                ].map(([person, role, mail]) => (
                  <button
                    key={mail}
                    onClick={() => {
                      setEmail(`${mail}@meridian.example`);
                      setPassword('DemoAccount!2026');
                      setRegister(false);
                    }}
                  >
                    <strong>{person}</strong>
                    <span>{role}</span>
                  </button>
                ))}
              </div>
              <small>Temporary demo data. Accounts and changes reset on restart.</small>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
