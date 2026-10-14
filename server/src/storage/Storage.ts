export type PresignedUpload = {
  url: string;
  method: "PUT";
  /** Headers the client must send with the upload (they are part of the signature). */
  headers: Record<string, string>;
};

export interface Storage {
  /** URL the browser can PUT exactly `size` bytes of `contentType` to. */
  presignUpload(key: string, opts: { contentType: string; size: number; expiresIn?: number }): Promise<PresignedUpload>;
  /** Short-lived URL to read the object (supports Range requests for media). */
  presignDownload(key: string, opts?: { contentType?: string; filename?: string; expiresIn?: number }): Promise<string>;
  /** Every object under a prefix with its size. */
  list(prefix: string): Promise<Map<string, number>>;
  /** Deletes the given keys; returns how many were deleted. */
  deleteKeys(keys: string[]): Promise<number>;
  /** Deletes everything under a prefix; returns how many objects were deleted. */
  deletePrefix(prefix: string): Promise<number>;
}

/** Storage keys are built only from server-generated ids. */
export const courseKeyPrefix = (userId: string, courseId: string) => `users/${userId}/courses/${courseId}/`;
export const fileKey = (userId: string, courseId: string, fileId: string) => `${courseKeyPrefix(userId, courseId)}${fileId}`;
