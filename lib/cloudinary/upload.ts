import { getCloudinary } from "@/lib/cloudinary";

export interface UploadedImage {
  url: string;
}

/**
 * Server-side image upload — the API secret never leaves the server, so
 * route handlers stream the file straight through here rather than handing
 * the browser signed params (getSignedUploadParams exists for a future
 * client-direct-to-Cloudinary flow, but nothing currently uses it).
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  folder: string,
): Promise<UploadedImage> {
  const cloudinary = getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => {
        if (err || !result) {
          reject(err ?? new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve({ url: result.secure_url });
      },
    );
    stream.end(buffer);
  });
}
