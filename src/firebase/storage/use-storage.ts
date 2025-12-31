
'use client';

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { useFirebase } from '@/firebase';
import { useState, useCallback } from 'react';

type UploadProgress = {
  progress: number;
  state: UploadTaskSnapshot['state'];
};

export const useStorageUpload = () => {
  const { storage } = useFirebase();
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (
      path: string,
      dataUrl: string,
      onProgress?: (progress: UploadProgress) => void
    ): Promise<string> => {
      if (!storage) {
        throw new Error('Firebase Storage is not initialized.');
      }

      setIsUploading(true);
      setError(null);
      setUploadProgress({ progress: 0, state: 'running' });

      // 🔹 Convert data URL → Blob
      const blob = await (await fetch(dataUrl)).blob();

      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress =
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

            const progressUpdate = {
              progress,
              state: snapshot.state,
            };

            setUploadProgress(progressUpdate);
            onProgress?.(progressUpdate);
          },
          (uploadError) => {
            setError(uploadError);
            setIsUploading(false);
            reject(uploadError);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              setUploadProgress({ progress: 100, state: 'success' });
              setIsUploading(false);
              resolve(downloadURL);
            } catch (err) {
              setError(err as Error);
              setIsUploading(false);
              reject(err);
            }
          }
        );
      });
    },
    [storage]
  );

  return { uploadFile, isUploading, uploadProgress, error };
};
