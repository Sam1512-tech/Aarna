export default function SignupPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-4xl text-ink">Create account</h1>
      <p className="mt-2 text-sm text-warm-grey">
        {/* FE dev: build form using lib/actions/auth.ts#signup */}
      </p>
      {/* TODO(frontend): RHF + Zod form, calls signup() server action. */}
    </div>
  );
}
