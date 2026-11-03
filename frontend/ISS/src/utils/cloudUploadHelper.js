import API from '../api/axios';

const CHUNK_SIZE = 1500 * 1024; // 1.5 MB per chunk (~2 MB base64, well under Vercel 4.5 MB limit)

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
};

/**
 * Uploads a document or photo to a sale using:
 * 1) Direct Google Drive resumable upload (when Google OAuth session is active)
 * 2) Automatic Chunked MongoDB Cloud Storage (1.5MB chunks - works 100% permanently on Vercel for any file size without expiring tokens)
 * 3) Multipart fallback for small files
 */
export const uploadSaleDocumentReliably = async ({
  saleId,
  file,
  title,
  field = null,
  onProgress = null
}) => {
  const fileName = file.name || `${field || 'document'}.jpg`;
  const fileType = file.type || 'application/octet-stream';
  const fileSize = file.size || 0;

  let cleanFilename = null;
  let uploadUrl = null;

  try {
    const initRes = await API.post(`/installments/sales/${saleId}/documents/init-direct`, {
      fileName,
      fileType,
      fileSize,
      title
    });

    if (initRes.data?.success) {
      cleanFilename = initRes.data.cleanFilename;
      uploadUrl = initRes.data.uploadUrl || null;
    }
  } catch (initErr) {
    console.warn('init-direct notice, generating local cleanFilename for chunked upload:', initErr.message);
  }

  if (!cleanFilename) {
    const extMatch = fileName.match(/\.[^/.]+$/);
    const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg';
    const safeTitle = String(title || fileName)
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'doc';
    cleanFilename = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeTitle}${ext}`;
  }

  // 1. If Google Drive uploadUrl is available, try direct PUT first
  if (uploadUrl) {
    try {
      const driveRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': fileType },
        body: file
      });

      if (driveRes.ok) {
        const driveJson = await driveRes.json().catch(() => ({}));
        const driveFileId = driveJson.id || driveJson.fileId;
        if (driveFileId) {
          const confirmRes = await API.post(`/installments/sales/${saleId}/documents/confirm-direct`, {
            driveFileId,
            cleanFilename,
            title,
            fileSize,
            fileType,
            field
          });
          if (confirmRes.data?.success) {
            return confirmRes.data;
          }
        }
      }
    } catch (drivePutErr) {
      console.warn('Direct Drive PUT notice, switching to Chunked Cloud DB upload:', drivePutErr.message);
    }
  }

  // 2. Chunked Cloud DB Upload (slices file into 1.5MB chunks -> permanent MongoDB CloudFile storage)
  try {
    const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const blobSlice = file.slice(start, end);
      const chunkBase64 = await blobToBase64(blobSlice);

      if (typeof onProgress === 'function' && totalChunks > 1) {
        onProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
      }

      const chunkRes = await API.post(`/installments/sales/${saleId}/documents/upload-chunk`, {
        cleanFilename,
        chunkIndex,
        totalChunks,
        fileType,
        fileSize,
        chunkBase64
      });

      if (!chunkRes.data?.success) {
        throw new Error(chunkRes.data?.message || `Chunk ${chunkIndex + 1}/${totalChunks} upload failed`);
      }
    }

    const confirmRes = await API.post(`/installments/sales/${saleId}/documents/confirm-direct`, {
      driveFileId: `db:${cleanFilename}`,
      cleanFilename,
      title,
      fileSize,
      fileType,
      field
    });

    if (confirmRes.data?.success) {
      return confirmRes.data;
    }
  } catch (chunkErr) {
    console.warn('Chunked Cloud DB upload notice, attempting multipart fallback:', chunkErr.message);
    if (fileSize > 4 * 1024 * 1024) {
      throw chunkErr;
    }
  }

  // 3. Final fallback for small files (< 4MB)
  const formData = new FormData();
  formData.append('documents', file);
  formData.append('docTitle_0', title);
  formData.append('title', title);
  if (field) {
    formData.append('field', field);
  }

  const fallbackRes = await API.post(`/installments/sales/${saleId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  if (fallbackRes.data?.success) {
    return fallbackRes.data;
  }

  throw new Error(fallbackRes.data?.message || `Document "${title}" upload failed`);
};
