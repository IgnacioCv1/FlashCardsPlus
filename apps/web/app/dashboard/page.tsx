import { auth, signOut } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Dashboard</h1>
      <p>Signed in as: {session?.user?.email ?? "Unknown user"}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
