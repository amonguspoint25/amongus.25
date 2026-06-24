import { auth, signIn, signOut } from "@/auth";

export async function SignInButton() {
  const session = await auth();
  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          className="px-4 py-2 rounded-lg"
          style={{ background: "var(--surface)", color: "var(--text)" }}
        >
          Sign out{session.user.name ? ` (${session.user.name})` : ""}
        </button>
      </form>
    );
  }
  return (
    <form
      action={async () => {
        "use server";
        await signIn("discord");
      }}
    >
      <button
        className="px-4 py-2 rounded-lg font-semibold"
        style={{ background: "var(--primary)", color: "white" }}
      >
        Sign in with Discord
      </button>
    </form>
  );
}
