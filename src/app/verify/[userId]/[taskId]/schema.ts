'use client';
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

export const verificationSubmissionSchema = z.object({
  verifierName: z.string().min(1, 'Your name is required'),
  notes: z.string().min(1, 'Verification notes are required'),
  photoUrls: z.array(z.string().url()).optional(),
  createdAt: z.custom<Timestamp>().optional(),
});

export type VerificationSubmission = z.infer<typeof verificationSubmissionSchema>;
