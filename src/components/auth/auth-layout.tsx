import type { ReactNode } from "react";

const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="auth-page-shell min-h-screen grid lg:grid-cols-2">
      <aside className="auth-layout-left relative min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-teal-500 to-teal-600 px-10 py-12 text-white">
        <div
          className="mb-8 flex items-center justify-center rounded-3xl bg-white p-4"
          style={{ width: 300, height: 300 }}
        >
          <img
            src="/no-bg-icon.png"
            alt="TugonPH logo"
            className="object-contain"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        <h2 className="mb-4 text-center text-4xl font-bold text-black/90">
          Your Trusted Website
        </h2>
        <p className="mb-6 text-center text-black/80">
          Start your journey with us
        </p>
      </aside>

      <main className="flex min-h-screen min-w-0 items-start justify-center bg-white px-4 py-8 sm:px-6 lg:px-10">
        <div className="w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
};

export default AuthLayout;
