import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Sign in</h1>
      <p>Use Google to continue.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button type="submit">Continue with Google</button>
      </form>
    </main>
  );
}
