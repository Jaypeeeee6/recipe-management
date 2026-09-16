import { useRef, useState } from "react";
import api from "../api/client";

/**
 * Photo picker + preview. For existing records, uploads immediately.
 * For new records, call uploadPending(id) after create.
 */
export default function PhotoUpload({
  label = "Photo",
  hint = "Add a photo so others can see how it looks",
  photoUrl,
  uploadUrl,
  field,
  onUploaded,
  pendingFile,
  onPendingFile,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const preview = pendingFile ? URL.createObjectURL(pendingFile) : photoUrl;

  const uploadFile = async (file) => {
    if (!uploadUrl || !file) return null;
    const body = new FormData();
    body.append("photo", file);
    if (field) body.append("field", field);
    setUploading(true);
    setError("");
    try {
      const { data } = await api.post(uploadUrl, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded?.(data);
      return data;
    } catch {
      setError("Could not upload photo. Try again.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (uploadUrl) {
      await uploadFile(file);
    } else {
      onPendingFile?.(file);
      setError("");
    }
  };

  return (
    <div className="photo-upload">
      <label>{label}</label>
      <p className="hint" style={{ marginBottom: 10 }}>{hint}</p>
      <div className="photo-upload-row">
        <div className={`photo-frame ${preview ? "" : "empty"}`}>
          {preview ? (
            <img src={preview} alt="" />
          ) : (
            <span>No photo yet</span>
          )}
        </div>
        <div className="photo-upload-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onPick}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : preview ? "Change Photo" : "Add Photo"}
          </button>
          {pendingFile && !uploadUrl && (
            <div className="hint">Photo will upload after you save.</div>
          )}
          {error && <div className="hint" style={{ color: "#b91c1c" }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

export async function uploadPendingPhoto(uploadUrl, file, field) {
  if (!uploadUrl || !file) return null;
  const body = new FormData();
  body.append("photo", file);
  if (field) body.append("field", field);
  const { data } = await api.post(uploadUrl, body, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
