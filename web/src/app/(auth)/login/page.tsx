import LoginForm from "./LoginForm";

export const metadata = { title: "Login — Entron" };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-entron-dark px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/entron-logo.png"
            alt="Entron"
            className="w-20 h-20 rounded-2xl object-contain bg-black mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-slate-100">Entron</h1>
          <p className="text-slate-400 mt-1 text-sm">Event Guest Management</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
