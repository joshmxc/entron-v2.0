import archiver from "archiver";
import { Response } from "express";

export function streamZipToResponse(
  res: Response,
  files: Array<{ read: () => Promise<Buffer>; name: string }>,
  zipName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    archive.on("end", resolve);
    archive.pipe(res);

    void (async () => {
      try {
        for (const { read, name } of files) {
          archive.append(await read(), { name });
        }
        await archive.finalize();
      } catch (error) {
        archive.destroy();
        reject(error);
      }
    })();
  });
}
