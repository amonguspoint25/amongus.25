"use client";
import { deleteMyAccount } from "@/app/account/actions";

// Wraps the server action with a browser confirm so deletion is never one accidental click.
export function DeleteAccountButton() {
  return (
    <form
      action={deleteMyAccount}
      onSubmit={(e) => {
        if (!confirm("Permanently delete your account and all your data? This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <button
        className="btn-ghost"
        type="submit"
        style={{
          fontSize: "0.72rem",
          letterSpacing: "0.14em",
          padding: "0.55rem 0.9rem",
          color: "var(--alert, #e0524d)",
          borderColor: "var(--alert, #e0524d)",
        }}
      >
        DELETE MY ACCOUNT
      </button>
    </form>
  );
}
