"use client";
import { startNextSeasonAction } from "@/app/admin/seasons/actions";

export function RolloverSeasonButton({ label }: { label: string }) {
  return (
    <form action={startNextSeasonAction}>
      <button
        className="btn-ghost"
        type="submit"
        style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.55rem 0.9rem" }}
      >
        {label}
      </button>
    </form>
  );
}
