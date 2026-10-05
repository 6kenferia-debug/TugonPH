//SIGN IN PAGE
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/Button';

import EmailLogo from '../../assets/images/email_logo.png';
import PasswordLogo from '../../assets/images/password_logo.png';
import GoogleLogo from '../../assets/images/google_logo.png';
import AppleLogo from '../../assets/images/apple_logo.png';
import { loginUser } from '../../services/UserService';


const inputClasses =
  'w-full rounded-2xl bg-white px-4 py-1 text-sm text-zinc-900 ';

const inputBorderClasses =
  'mt-2 flex items-center rounded-xl border border-zinc-300 bg-white px-4 py-3 shadow-sm focus-within:border-[#35408E] focus-within:ring-2 focus-within:ring-[#35408E]/20';


const actionButtonClassName = 'w-full rounded-2xl py-3 text-[11px] tracking-[0.2em]';

const LogInPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const { data } = await loginUser({ email, password });

      localStorage.setItem('token', data.token);
      localStorage.setItem('firstName', data.firstName);
      localStorage.setItem('type', data.type);

      navigate('/dashboard', {
        state: { firstName: data.firstName, type: data.type },
      });
    } catch (err) {
      console.error('Login failed:', err.response?.data?.message || err.message);
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    }
  };

  return (

    <div className="rounded-[2rem] border border-[#35408E]/15 bg-[#F7F6FF] p-8 shadow-[0_25px_80px_-40px_rgba(53,64,142,0.65)] sm:p-10">
      <h1 className="text-3xl font-bold tracking-tight text-[#35408E] sm:text-4xl">
        Welcome back!
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-700">
        Sign in to access your account and continue exploring articles, insights, and content designed to support your learning journey.
      </p>

      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <form className="mt-8 space-y-5" onSubmit={handleLogin}>


        <div>
          <label htmlFor="signin-email" className="text-sm font-semibold text-[#35408E]">
            Email Address
          </label>

          <div className={inputBorderClasses}>
            <img src={EmailLogo} alt ="Email icon" className="h-5 w-5 opacity-70" />
            <input
              id="signin-email"
              type="email"
              placeholder="name@students.national-u.edu.ph"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClasses}
            />
          </div>
        </div>

        <div>
          <label htmlFor="signin-password" className="text-sm font-semibold text-[#35408E]">
            Enter your password
          </label>

          <div className={inputBorderClasses}>
            <img src={PasswordLogo} alt="Password icon" className="h-5 w-5 opacity-70" />
            <input
              id="signin-password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputClasses}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            Use at least 8 characters with a mix of letters, numbers, and symbols for secure access.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 text-sm">
          <label className="flex items-center gap-2 text-zinc-700">
            <input type="checkbox" className="h-4 w-4 rounded border-zinc-300 accent-[#35408E]" />
            <span>Remember me</span>
          </label>
          <button type="button" className="font-semibold text-[#35408E] transition hover:text-[#2B3474]">
            Forgot Password?
          </button>
        </div>

        <Button
          type="submit"
          variant="primary"
          className={`${actionButtonClassName} !border-0 !text-white bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 shadow-md hover:shadow-lg transition`}
        >
          Log In
        </Button>

        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            className={`${actionButtonClassName} flex items-center justify-center gap-3 border-[#35408E] bg-white text-[#35408E] hover:border-[#FFDC56] hover:text-[#35408E]`}
          >
            <img src={GoogleLogo} alt="Google" className="h-5 w-5" />
            <span>Log In with Google</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={`${actionButtonClassName} flex items-center justify-center gap-3 border-[#35408E] bg-white text-[#35408E] hover:border-[#FFDC56] hover:text-[#35408E]`}
          >
            <img src={AppleLogo} alt="Apple" className="h-5 w-5" />
            <span>Log In with Apple</span>
          </Button>
        </div>
      </form>

      <div className="mt-8 border-t border-[#35408E]/15 pt-6 text-sm text-zinc-700">
        No account yet?{' '}
        <Link
          to="/auth/signup"
          className="font-semibold text-[#35408E] transition hover:text-[#2B3474]"
        >
          Sign Up
        </Link>
      </div>
    </div>
  );
};

export default LogInPage;
