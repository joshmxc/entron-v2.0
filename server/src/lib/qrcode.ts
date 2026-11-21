import QRCode from "qrcode";
import { storeFile } from "./storage";

export async function generateQRImage(qrCode: string, eventId: string): Promise<string> {
  const image = await QRCode.toBuffer(qrCode, {
    type: "png",
    width: 300,
    margin: 2,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  return storeFile("public", `qr/${eventId}/${qrCode}.png`, image, "image/png");
}

export async function generateQRDataUrl(qrCode: string): Promise<string> {
  return QRCode.toDataURL(qrCode, {
    width: 300,
    margin: 2,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}
