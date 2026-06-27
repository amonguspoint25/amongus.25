import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Favicon: ".25" in the brand cyan on the dark console background.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#04060b",
          color: "#3d8bff",
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        .25
      </div>
    ),
    { ...size }
  );
}
