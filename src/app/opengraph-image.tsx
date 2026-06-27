import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Among Us .25 Ranked";

// The link-preview card shown when au-25.vercel.app is shared in Discord.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#04060b",
          color: "#e6edf3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 36, letterSpacing: 8, color: "#3d8bff" }}>AMONG US .25</div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, marginTop: 8 }}>RANKED</div>
        <div style={{ display: "flex", fontSize: 30, color: "#8b97a8", marginTop: 24 }}>
          Crew &amp; Impostor ELO ladders
        </div>
      </div>
    ),
    { ...size }
  );
}
