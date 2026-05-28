export default function SignupPage() {
  return (
    <div className="paper-grain mx-auto min-h-screen max-w-md px-6 py-28">
      <h1 className="font-display text-5xl lowercase text-maroon">
        create account
      </h1>
      <p className="mt-4 text-sm leading-6 text-charcoal/64">
        {/* FE dev: build form using lib/actions/auth.ts#signup */}
      </p>
      {/* TODO(frontend): RHF + Zod form, calls signup() server action. */}
    </div>
  );
}
