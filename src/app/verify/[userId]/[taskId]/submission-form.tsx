'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { VerificationSubmission, verificationSubmissionSchema } from './schema';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { collection, serverTimestamp, doc } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import {
  initializeFirebase,
  addDocumentNonBlocking,
  useStorageUpload,
  initiateAnonymousSignIn,
  useAuth,
  useUser,
  useFirestore,
} from '@/firebase';
import { Camera, Trash2 } from 'lucide-react';
import Image from 'next/image';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

interface SubmissionFormProps {
  userId: string;
  taskId: string;
  onSuccess: () => void;
}

const MAX_PHOTOS = 10;

export function SubmissionForm({
  userId,
  taskId,
  onSuccess,
}: SubmissionFormProps) {
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { uploadFile, isUploading, uploadProgress } = useStorageUpload();

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(
    null
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);


  const form = useForm<VerificationSubmission>({
    resolver: zodResolver(verificationSubmissionSchema),
    defaultValues: {
      verifierName: '',
      notes: '',
      photoUrls: [],
    },
  });
  
  useEffect(() => {
    // Automatically sign in the user anonymously if they are not already.
    // This is required for Storage security rules to pass.
    if (!isUserLoading && !user) {
        initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  useEffect(() => {
    if (!isTakingPhoto) {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
        return;
    }

    const getCameraPermission = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        setStream(mediaStream);
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description:
            'Please enable camera permissions in your browser settings to use this feature.',
        });
        setIsTakingPhoto(false);
      }
    };

    getCameraPermission();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isTakingPhoto, toast]);

  const handleCaptureAndAdd = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUri = canvas.toDataURL('image/jpeg');
        setCapturedImages((prev) => [...prev, dataUri]);
        setIsTakingPhoto(false);
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async (submissionId: string): Promise<string[]> => {
    const uploadPromises = capturedImages.map((image, i) => {
      const imagePath = `submissions/${taskId}/${submissionId}/${Date.now()}_${i}.jpg`;
      return uploadFile(imagePath, image);
    });

    return Promise.all(uploadPromises);
  };

  const onSubmit = async (data: VerificationSubmission) => {
    if (!firestore || !user) {
      setSubmissionError('User not authenticated. Please refresh and try again.');
      return;
    }

    setSubmissionError(null);

    try {
      // 1. Create a submission document reference first to get a unique ID
      const submissionColRef = collection(
        firestore,
        'users',
        userId,
        'motoTasks',
        taskId,
        'submissions'
      );
      const submissionDocRef = doc(submissionColRef); // This creates a ref with a new ID locally

      // 2. Upload images using the client-side SDK
      const photoUrls = await uploadImages(submissionDocRef.id);

      // 3. Add the document to Firestore with the image URLs and other data
      addDocumentNonBlocking(submissionDocRef, {
        ...data,
        photoUrls: photoUrls,
        createdAt: serverTimestamp(),
      });

      toast({
        title: 'Submission Successful',
        description: 'Your verification details have been submitted.',
      });

      onSuccess();
      form.reset();
      setCapturedImages([]);
    } catch (error: any) {
      console.error('Error submitting form:', error);
      setSubmissionError(error.message || 'There was a problem uploading your submission.');
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description: 'There was a problem submitting your verification.',
      });
    }
  };
  
  const isSubmitting = isUploading || form.formState.isSubmitting;

  if (isTakingPhoto) {
    return (
      <div className="w-full space-y-4">
        <div className="relative w-full aspect-video rounded-md border bg-muted overflow-hidden">
          <canvas ref={canvasRef} className="hidden" />
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
          />
          {hasCameraPermission === false && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <Alert variant="destructive">
                <AlertTitle>Camera Access Required</AlertTitle>
                <AlertDescription>
                  Please allow camera access in your browser to use this
                  feature.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleCaptureAndAdd}
            disabled={!hasCameraPermission}
          >
            <Camera className="mr-2 h-4 w-4" />
            Capture & Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsTakingPhoto(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="w-full space-y-4 border-t pt-6"
      >
        <h3 className="text-lg font-semibold">Submit Verification</h3>

        <div className="space-y-2">
          <FormLabel>Verification Photos</FormLabel>
          <p className="text-sm text-muted-foreground">
            You can upload up to {MAX_PHOTOS} photos. ({capturedImages.length}/{MAX_PHOTOS})
          </p>
          {capturedImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {capturedImages.map((imgSrc, index) => (
                <div key={index} className="relative group">
                  <Image
                    src={imgSrc}
                    alt={`Captured verification ${index + 1}`}
                    width={150}
                    height={150}
                    className="rounded-md object-cover aspect-square"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveImage(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsTakingPhoto(true)}
            disabled={capturedImages.length >= MAX_PHOTOS}
          >
            <Camera className="mr-2 h-4 w-4" />
            Add Photo
          </Button>
          {capturedImages.length >= MAX_PHOTOS && (
             <Alert variant="default" className="mt-2">
              <AlertDescription>
                You have reached the maximum number of photos.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <FormField
          control={form.control}
          name="verifierName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Jane Smith"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verification Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any relevant notes..."
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {submissionError && (
             <Alert variant="destructive">
              <AlertTitle>Submission Failed</AlertTitle>
              <AlertDescription>
                {submissionError}
              </AlertDescription>
            </Alert>
        )}

        {isUploading && uploadProgress && (
          <div className="space-y-1">
            <Progress value={uploadProgress.progress} className="w-full" />
            <p className="text-sm text-muted-foreground">
              Uploading... {Math.round(uploadProgress.progress)}%
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting || capturedImages.length === 0 || !user}>
            {isSubmitting ? 'Submitting...' : 'Submit Verification'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
