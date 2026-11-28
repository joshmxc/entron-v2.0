import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const logoPath = path.join(process.cwd(), "public", "entron-logo.png");
  const logo = fs.readFileSync(logoPath).toString("base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: "#000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={`data:image/png;base64,${logo}`}
          width="32"
          height="32"
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size }
  );
}
